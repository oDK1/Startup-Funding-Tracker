import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { extractArticleContent } from "@/lib/scraper";
import { extractFundingData } from "@/lib/claude";
import {
  insertFundingRound,
  getSupabaseClient,
  type FundingRoundInsert,
} from "@/lib/supabase";

/**
 * VCNewsDaily Scraper API Route
 *
 * Scrapes VCNewsDaily monthly and daily archives for funding news.
 *
 * VCNewsDaily Structure:
 * 1. Monthly archive: https://vcnewsdaily.com/access/archivemonth.php?m=1&y=2026
 *    - Contains links to daily archives like archivedate.php?date=2026-01-16
 * 2. Daily archive: https://vcnewsdaily.com/access/archivedate.php?date=2026-01-16
 *    - Contains article cards with links and titles
 * 3. Article pages have full funding content
 *
 * Query parameters:
 * - month: Month number (1-12), default 1
 * - year: Year number, default 2026
 */

// Rate limiting delay between requests (500ms)
const REQUEST_DELAY_MS = 500;

// User agent for requests
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Source name for database entries
const SOURCE_NAME = "VCNewsDaily";

/**
 * Result tracking for VCNewsDaily scrape
 */
interface VCNewsScrapeResult {
  success: boolean;
  month: number;
  year: number;
  dailyArchivesFound: number;
  totalArticlesFound: number;
  newFundingRoundsAdded: number;
  skippedDuplicate: number;
  skippedNotFunding: number;
  errors: string[];
  duration: number;
  details: {
    added: Array<{ company: string; amount: number | null; url: string }>;
  };
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Fetch a page with proper headers and error handling
 */
async function fetchPage(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": USER_AGENT,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.log(`[VCNews] HTTP ${response.status} for ${url}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.log(`[VCNews] Error fetching ${url}: ${errorMsg}`);
    return null;
  }
}

/**
 * Check if source_url already exists in database
 */
async function sourceUrlExists(sourceUrl: string): Promise<boolean> {
  try {
    const client = getSupabaseClient();
    const { data, error } = await client
      .from("funding_rounds")
      .select("id")
      .eq("source_url", sourceUrl)
      .limit(1);

    if (error) {
      console.error("[VCNews] Error checking source_url:", error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Format funding amount for logging
 */
function formatAmount(amount: number | null): string {
  if (amount === null) {
    return "undisclosed";
  }
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(1)}M`;
  }
  if (amount >= 1_000) {
    return `$${(amount / 1_000).toFixed(1)}K`;
  }
  return `$${amount}`;
}

/**
 * Extract daily archive dates from monthly archive page
 * Monthly archive URL: https://vcnewsdaily.com/access/archivemonth.php?m=1&y=2026
 * Links to: archivedate.php?date=2026-01-16
 */
function extractDailyArchiveDates(html: string): string[] {
  const $ = cheerio.load(html);
  const dates: string[] = [];

  // Find all links to archivedate.php
  $('a[href*="archivedate.php"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) {
      // Extract date from URL like archivedate.php?date=2026-01-16
      const match = href.match(/date=(\d{4}-\d{2}-\d{2})/);
      if (match && match[1]) {
        dates.push(match[1]);
      }
    }
  });

  // Return unique dates
  return [...new Set(dates)];
}

/**
 * Extract article links from daily archive page
 * Daily archive URL: https://vcnewsdaily.com/access/archivedate.php?date=2026-01-16
 * Article links are in .select-article a.titleLink
 */
function extractArticleLinks(
  html: string
): Array<{ url: string; title: string }> {
  const $ = cheerio.load(html);
  const articles: Array<{ url: string; title: string }> = [];

  // Find article links using the specified selector
  $(".select-article a.titleLink").each((_, el) => {
    const $el = $(el);
    const url = $el.attr("href");
    const title = $el.find("h5").text().trim() || $el.text().trim();

    if (url && title) {
      articles.push({ url, title });
    }
  });

  // Also try alternative selectors in case structure varies
  if (articles.length === 0) {
    // Try finding article cards directly
    $("a[href*='vcnewsdaily.com'][href*='venture-capital-funding']").each(
      (_, el) => {
        const $el = $(el);
        const url = $el.attr("href");
        const title = $el.find("h5").text().trim() || $el.text().trim();

        if (url && title && !articles.some((a) => a.url === url)) {
          articles.push({ url, title });
        }
      }
    );
  }

  return articles;
}

/**
 * GET /api/scrape-vcnews
 *
 * Query parameters:
 * - month: Month number (1-12), default 1
 * - year: Year number, default 2026
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const monthParam = searchParams.get("month");
  const yearParam = searchParams.get("year");

  const month = monthParam ? parseInt(monthParam, 10) : 1;
  const year = yearParam ? parseInt(yearParam, 10) : 2026;

  // Validate month
  if (isNaN(month) || month < 1 || month > 12) {
    return NextResponse.json(
      { error: "month must be a number between 1 and 12" },
      { status: 400 }
    );
  }

  // Validate year
  if (isNaN(year) || year < 2000 || year > 2100) {
    return NextResponse.json(
      { error: "year must be a valid year number" },
      { status: 400 }
    );
  }

  console.log(`[VCNews] Starting VCNewsDaily scrape for ${month}/${year}`);

  const result: VCNewsScrapeResult = {
    success: true,
    month,
    year,
    dailyArchivesFound: 0,
    totalArticlesFound: 0,
    newFundingRoundsAdded: 0,
    skippedDuplicate: 0,
    skippedNotFunding: 0,
    errors: [],
    duration: 0,
    details: {
      added: [],
    },
  };

  try {
    // Step 1: Fetch monthly archive to get all daily archive dates
    const monthlyArchiveUrl = `https://vcnewsdaily.com/access/archivemonth.php?m=${month}&y=${year}`;
    console.log(`[VCNews] Fetching monthly archive: ${monthlyArchiveUrl}`);

    const monthlyHtml = await fetchPage(monthlyArchiveUrl);
    if (!monthlyHtml) {
      result.success = false;
      result.errors.push(`Failed to fetch monthly archive: ${monthlyArchiveUrl}`);
      result.duration = Date.now() - startTime;
      return NextResponse.json(result, { status: 500 });
    }

    const dailyDates = extractDailyArchiveDates(monthlyHtml);
    result.dailyArchivesFound = dailyDates.length;
    console.log(`[VCNews] Found ${dailyDates.length} daily archives`);

    if (dailyDates.length === 0) {
      console.log(`[VCNews] No daily archives found for ${month}/${year}`);
      result.duration = Date.now() - startTime;
      return NextResponse.json(result);
    }

    // Step 2: Process each daily archive
    for (const date of dailyDates) {
      const dailyArchiveUrl = `https://vcnewsdaily.com/access/archivedate.php?date=${date}`;
      console.log(`[VCNews] Processing daily archive: ${date}`);

      await sleep(REQUEST_DELAY_MS);

      const dailyHtml = await fetchPage(dailyArchiveUrl);
      if (!dailyHtml) {
        console.log(`[VCNews] Failed to fetch daily archive: ${date}`);
        result.errors.push(`Failed to fetch daily archive: ${date}`);
        continue;
      }

      const articles = extractArticleLinks(dailyHtml);
      console.log(`[VCNews] Found ${articles.length} articles for ${date}`);

      // Step 3: Process each article
      for (const article of articles) {
        result.totalArticlesFound++;

        await sleep(REQUEST_DELAY_MS);

        // Check if source_url already exists in Supabase (skip duplicates)
        const exists = await sourceUrlExists(article.url);
        if (exists) {
          console.log(`[VCNews] Duplicate URL: ${article.url}`);
          result.skippedDuplicate++;
          continue;
        }

        try {
          // Fetch full article content
          const content = await extractArticleContent(article.url);
          if (!content || content.length < 100) {
            console.log(`[VCNews] Insufficient content: ${article.url}`);
            result.skippedNotFunding++;
            continue;
          }

          // Use Claude to extract funding data
          const fundingData = await extractFundingData(content);
          if (!fundingData) {
            console.log(`[VCNews] Not a funding article: ${article.title}`);
            result.skippedNotFunding++;
            continue;
          }

          // Prepare data for insertion
          const fundingRound: FundingRoundInsert = {
            company_name: fundingData.company_name,
            funding_amount: fundingData.funding_amount,
            funding_round: fundingData.funding_round,
            investors: fundingData.investors,
            lead_investor: fundingData.lead_investor,
            product_description: fundingData.product_description,
            industry: fundingData.industry,
            source_url: article.url,
            source_name: SOURCE_NAME,
            published_at: new Date(date).toISOString(),
          };

          // Insert into Supabase
          await insertFundingRound(fundingRound);

          console.log(
            `[VCNews] Added: ${fundingData.company_name} (${formatAmount(fundingData.funding_amount)})`
          );
          result.newFundingRoundsAdded++;
          result.details.added.push({
            company: fundingData.company_name,
            amount: fundingData.funding_amount,
            url: article.url,
          });
        } catch (error) {
          const errorMsg =
            error instanceof Error ? error.message : "Unknown error";
          console.error(`[VCNews] Error processing ${article.url}: ${errorMsg}`);
          result.errors.push(`${article.url}: ${errorMsg}`);
        }
      }
    }

    result.duration = Date.now() - startTime;
    console.log(`[VCNews] Completed in ${result.duration}ms`);
    console.log(
      `[VCNews] Summary: ${result.totalArticlesFound} found, ${result.newFundingRoundsAdded} added, ${result.skippedDuplicate} duplicates, ${result.skippedNotFunding} not funding, ${result.errors.length} errors`
    );

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[VCNews] Critical error: ${errorMessage}`);

    result.success = false;
    result.duration = Date.now() - startTime;
    result.errors.push(`Critical error: ${errorMessage}`);

    return NextResponse.json(result, { status: 500 });
  }
}
