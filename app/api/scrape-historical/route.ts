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
 * Historical scraper API route
 *
 * Scrapes funding articles from archive/search pages instead of RSS feeds.
 * Supports TechCrunch and Crunchbase News paginated archives.
 *
 * Query parameters:
 * - startDate: ISO date string (e.g., "2026-01-01") - scrape articles after this date
 * - maxPages: Maximum pages to scrape per source (default 10)
 */

// Rate limiting delay between requests (1 second)
const REQUEST_DELAY_MS = 1000;

// Default max pages per source
const DEFAULT_MAX_PAGES = 10;

// User agent for requests
const USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Type for cheerio loaded document
type CheerioDocument = ReturnType<typeof cheerio.load>;

/**
 * Archive source configuration
 */
interface ArchiveSource {
  name: string;
  baseUrl: string;
  getPageUrl: (page: number) => string;
  extractArticles: ($: CheerioDocument) => ArticleLink[];
}

/**
 * Extracted article link from archive page
 */
interface ArticleLink {
  url: string;
  title: string;
  publishedAt: string | null;
}

/**
 * Result tracking for historical scrape
 */
interface HistoricalScrapeResult {
  success: boolean;
  totalArticlesFound: number;
  newFundingRoundsAdded: number;
  skippedDuplicate: number;
  skippedNotFunding: number;
  skippedOldArticle: number;
  errors: string[];
  duration: number;
  details: {
    added: Array<{ company: string; amount: number | null; source: string }>;
  };
}

/**
 * Archive sources configuration
 */
const ARCHIVE_SOURCES: ArchiveSource[] = [
  {
    name: "TechCrunch",
    baseUrl: "https://techcrunch.com",
    getPageUrl: (page: number) =>
      `https://techcrunch.com/category/startups/page/${page}/`,
    extractArticles: ($: CheerioDocument): ArticleLink[] => {
      const articles: ArticleLink[] = [];

      // TechCrunch article cards
      $("article, .post-block, .river-item, [class*='post-']").each((_, el) => {
        const $el = $(el);

        // Find the article link
        const linkEl =
          $el.find("a[href*='/20']").first() ||
          $el.find("h2 a, h3 a, .post-block__title a").first();
        const url = linkEl.attr("href");

        if (!url || !url.includes("techcrunch.com")) {
          return;
        }

        // Get title
        const title =
          linkEl.text().trim() ||
          $el.find("h2, h3, .post-block__title").text().trim();

        // Try to extract date from various elements
        let publishedAt: string | null = null;
        const timeEl = $el.find("time");
        if (timeEl.length > 0) {
          publishedAt = timeEl.attr("datetime") || timeEl.text().trim();
        }

        if (url && title) {
          articles.push({ url, title, publishedAt });
        }
      });

      return articles;
    },
  },
  {
    name: "Crunchbase News",
    baseUrl: "https://news.crunchbase.com",
    getPageUrl: (page: number) =>
      `https://news.crunchbase.com/venture/page/${page}/`,
    extractArticles: ($: CheerioDocument): ArticleLink[] => {
      const articles: ArticleLink[] = [];

      // Crunchbase News article cards
      $("article, .post, .entry, [class*='article']").each((_, el) => {
        const $el = $(el);

        // Find the article link
        const linkEl = $el
          .find("a[href*='news.crunchbase.com']")
          .not('[href*="/page/"]')
          .first();
        let url = linkEl.attr("href");

        // Also try direct href on the element
        if (!url) {
          const directLink = $el.find("h2 a, h3 a, .entry-title a").first();
          url = directLink.attr("href");
        }

        if (!url) {
          return;
        }

        // Ensure full URL
        if (!url.startsWith("http")) {
          url = `https://news.crunchbase.com${url}`;
        }

        // Get title
        const title =
          linkEl.text().trim() ||
          $el.find("h2, h3, .entry-title").text().trim();

        // Try to extract date
        let publishedAt: string | null = null;
        const timeEl = $el.find("time, .entry-date, .post-date");
        if (timeEl.length > 0) {
          publishedAt = timeEl.attr("datetime") || timeEl.text().trim();
        }

        if (url && title) {
          articles.push({ url, title, publishedAt });
        }
      });

      return articles;
    },
  },
];

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
      console.log(
        `[Historical] HTTP ${response.status} for ${url}`
      );
      return null;
    }

    return await response.text();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.log(`[Historical] Error fetching ${url}: ${errorMsg}`);
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
      console.error("[Historical] Error checking source_url:", error);
      return false;
    }

    return (data?.length || 0) > 0;
  } catch {
    return false;
  }
}

/**
 * Parse a date string and return Date object or null
 */
function parseDate(dateStr: string | null): Date | null {
  if (!dateStr) return null;

  try {
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return null;
    return date;
  } catch {
    return null;
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
 * Scrape articles from a single archive source
 */
async function scrapeArchiveSource(
  source: ArchiveSource,
  startDate: Date,
  maxPages: number,
  result: HistoricalScrapeResult
): Promise<void> {
  console.log(`[Historical] Scraping ${source.name} archives...`);

  let page = 1;
  let shouldContinue = true;

  while (shouldContinue && page <= maxPages) {
    const pageUrl = source.getPageUrl(page);
    console.log(`[Historical] Fetching ${source.name} page ${page}: ${pageUrl}`);

    const html = await fetchPage(pageUrl);
    if (!html) {
      console.log(`[Historical] Failed to fetch page ${page}, stopping`);
      break;
    }

    const $ = cheerio.load(html);
    const articles = source.extractArticles($);

    console.log(
      `[Historical] Found ${articles.length} articles on page ${page}`
    );

    if (articles.length === 0) {
      console.log(`[Historical] No articles found on page ${page}, stopping`);
      break;
    }

    // Process each article
    for (const article of articles) {
      // Check article date if available
      const articleDate = parseDate(article.publishedAt);
      if (articleDate && articleDate < startDate) {
        console.log(
          `[Historical] Article ${article.title} is before start date, stopping`
        );
        result.skippedOldArticle++;
        shouldContinue = false;
        break;
      }

      result.totalArticlesFound++;

      // Rate limiting between article processing
      await sleep(REQUEST_DELAY_MS);

      // Check if already exists by source_url
      const exists = await sourceUrlExists(article.url);
      if (exists) {
        console.log(`[Historical] Duplicate URL: ${article.url}`);
        result.skippedDuplicate++;
        continue;
      }

      try {
        // Extract article content
        const content = await extractArticleContent(article.url);
        if (!content || content.length < 100) {
          console.log(
            `[Historical] Insufficient content: ${article.url}`
          );
          result.skippedNotFunding++;
          continue;
        }

        // Use Claude to extract funding data
        const fundingData = await extractFundingData(content);
        if (!fundingData) {
          console.log(
            `[Historical] Not a funding article: ${article.title}`
          );
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
          source_name: source.name,
          published_at: article.publishedAt
            ? new Date(article.publishedAt).toISOString()
            : null,
        };

        // Insert into Supabase
        await insertFundingRound(fundingRound);

        console.log(
          `[Historical] Added: ${fundingData.company_name} (${formatAmount(fundingData.funding_amount)})`
        );
        result.newFundingRoundsAdded++;
        result.details.added.push({
          company: fundingData.company_name,
          amount: fundingData.funding_amount,
          source: source.name,
        });
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[Historical] Error processing ${article.url}: ${errorMsg}`
        );
        result.errors.push(`${article.url}: ${errorMsg}`);
      }
    }

    page++;
    // Rate limiting between pages
    await sleep(REQUEST_DELAY_MS);
  }

  console.log(`[Historical] Finished scraping ${source.name}`);
}

/**
 * GET /api/scrape-historical
 *
 * Query parameters:
 * - startDate: ISO date string (required, e.g., "2026-01-01")
 * - maxPages: Maximum pages per source (optional, default 10)
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Parse query parameters
  const searchParams = request.nextUrl.searchParams;
  const startDateParam = searchParams.get("startDate");
  const maxPagesParam = searchParams.get("maxPages");

  // Validate startDate
  if (!startDateParam) {
    return NextResponse.json(
      { error: "startDate query parameter is required (ISO format, e.g., 2026-01-01)" },
      { status: 400 }
    );
  }

  const startDate = parseDate(startDateParam);
  if (!startDate) {
    return NextResponse.json(
      { error: "Invalid startDate format. Use ISO format (e.g., 2026-01-01)" },
      { status: 400 }
    );
  }

  const maxPages = maxPagesParam
    ? parseInt(maxPagesParam, 10)
    : DEFAULT_MAX_PAGES;

  if (isNaN(maxPages) || maxPages < 1 || maxPages > 100) {
    return NextResponse.json(
      { error: "maxPages must be a number between 1 and 100" },
      { status: 400 }
    );
  }

  console.log(
    `[Historical] Starting historical scrape from ${startDate.toISOString()}, max ${maxPages} pages per source`
  );

  const result: HistoricalScrapeResult = {
    success: true,
    totalArticlesFound: 0,
    newFundingRoundsAdded: 0,
    skippedDuplicate: 0,
    skippedNotFunding: 0,
    skippedOldArticle: 0,
    errors: [],
    duration: 0,
    details: {
      added: [],
    },
  };

  try {
    // Process each archive source
    for (const source of ARCHIVE_SOURCES) {
      await scrapeArchiveSource(source, startDate, maxPages, result);
    }

    result.duration = Date.now() - startTime;
    console.log(`[Historical] Completed in ${result.duration}ms`);
    console.log(
      `[Historical] Summary: ${result.totalArticlesFound} found, ${result.newFundingRoundsAdded} added, ${result.skippedDuplicate} duplicates, ${result.skippedNotFunding} not funding, ${result.skippedOldArticle} old articles, ${result.errors.length} errors`
    );

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[Historical] Critical error: ${errorMessage}`);

    result.success = false;
    result.duration = Date.now() - startTime;
    result.errors.push(`Critical error: ${errorMessage}`);

    return NextResponse.json(result, { status: 500 });
  }
}
