import { NextRequest, NextResponse } from "next/server";
import { fetchAllRSSFeeds, extractArticleContent } from "@/lib/scraper";
import { extractFundingData } from "@/lib/claude";
import {
  fundingRoundExists,
  fundingRoundExistsByUrl,
  fundingRoundExistsByDetails,
  normalizeCompanyName,
  insertFundingRound,
  type FundingRoundInsert,
} from "@/lib/supabase";

/**
 * Daily scraper API route
 *
 * This endpoint:
 * 1. Fetches RSS feeds from tech media sources
 * 2. Extracts article content
 * 3. Uses Claude API to extract funding data
 * 4. Deduplicates and stores results in Supabase
 *
 * Triggered by Vercel cron at 6am daily
 */

// Maximum number of items to process per run to avoid timeouts
// Vercel Hobby: 10s limit. URL-deduped items take ~50ms; new items take ~4-5s.
// 50 items covers a full RSS batch; fast URL checks handle most on repeat runs.
const MAX_ITEMS_PER_RUN = 50;

// Maximum function execution time before stopping
// Return at 8s, before Vercel kills at 10s
const FUNCTION_TIMEOUT_MS = 8000;

// Delay between processing items to avoid rate limits (in ms)
// No delay — every ms counts at 10s limit
const PROCESSING_DELAY = 0;

/**
 * Result tracking for the scrape operation
 */
interface ScrapeResult {
  success: boolean;
  totalItemsFetched: number;
  itemsProcessed: number;
  newItemsAdded: number;
  skippedDuplicate: number;
  skippedNotFunding: number;
  errors: number;
  stoppedEarly: boolean;
  details: {
    added: Array<{ company: string; amount: number | null; source: string }>;
    errors: Array<{ url: string; error: string }>;
  };
  duration: number;
}

/**
 * Verify authorization for cron requests
 * Checks for CRON_SECRET header if configured
 */
function verifyAuthorization(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET is configured, allow all requests (development mode)
  if (!cronSecret) {
    console.log("[Scrape] No CRON_SECRET configured, allowing request");
    return true;
  }

  // Check Authorization header
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${cronSecret}`) {
    return true;
  }

  // Check x-cron-secret header (alternative)
  const cronHeader = request.headers.get("x-cron-secret");
  if (cronHeader === cronSecret) {
    return true;
  }

  console.log("[Scrape] Authorization failed");
  return false;
}

/**
 * Sleep utility for rate limiting
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * GET /api/scrape
 *
 * Main scraping workflow:
 * 1. Fetch all RSS feeds
 * 2. For each item, check if it exists (deduplication)
 * 3. Extract full article content
 * 4. Use Claude to extract funding data
 * 5. If valid, insert into Supabase
 */
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  // Verify authorization
  if (!verifyAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[Scrape] Starting scrape job...");

  const result: ScrapeResult = {
    success: true,
    totalItemsFetched: 0,
    itemsProcessed: 0,
    newItemsAdded: 0,
    skippedDuplicate: 0,
    skippedNotFunding: 0,
    errors: 0,
    stoppedEarly: false,
    details: {
      added: [],
      errors: [],
    },
    duration: 0,
  };

  try {
    // Step 1: Fetch all RSS feeds
    console.log("[Scrape] Fetching RSS feeds...");
    const rssItems = await fetchAllRSSFeeds();
    result.totalItemsFetched = rssItems.length;
    console.log(`[Scrape] Fetched ${rssItems.length} RSS items`);

    if (rssItems.length === 0) {
      console.log("[Scrape] No RSS items found");
      result.duration = Date.now() - startTime;
      return NextResponse.json(result);
    }

    // Limit items to process to avoid timeouts
    const itemsToProcess = rssItems.slice(0, MAX_ITEMS_PER_RUN);
    console.log(`[Scrape] Processing ${itemsToProcess.length} items (max: ${MAX_ITEMS_PER_RUN})`);

    // Track processed items within this batch to avoid in-batch duplicates
    const processedUrls = new Set<string>();
    const processedCompanies = new Set<string>(); // normalized company names

    // Step 2: Process each item
    let stoppedEarly = false;
    for (const item of itemsToProcess) {
      // Check if approaching timeout
      const elapsed = Date.now() - startTime;
      if (elapsed > FUNCTION_TIMEOUT_MS) {
        console.log(`[Scrape] Approaching timeout (${elapsed}ms), stopping early`);
        stoppedEarly = true;
        break;
      }

      result.itemsProcessed++;

      try {
        // Validate item has required fields
        if (!item.link) {
          console.log(`[Scrape] Skipping item with no URL: ${item.title}`);
          continue;
        }

        // Step 2a: Check for URL duplicate (in-batch)
        if (processedUrls.has(item.link)) {
          console.log(`[Scrape] Skipping in-batch URL duplicate: ${item.link}`);
          result.skippedDuplicate++;
          continue;
        }

        // Step 2b: Check for URL duplicate (in database)
        const urlExists = await fundingRoundExistsByUrl(item.link);
        if (urlExists) {
          console.log(`[Scrape] Skipping - URL already in database: ${item.link}`);
          result.skippedDuplicate++;
          processedUrls.add(item.link);
          continue;
        }

        console.log(`[Scrape] Processing: ${item.title}`);

        // Step 2c: Extract article content (needed for Claude extraction)
        const articleContent = await extractArticleContent(item.link);

        if (!articleContent || articleContent.length < 100) {
          console.log(`[Scrape] Skipping - insufficient content: ${item.link}`);
          result.skippedNotFunding++;
          processedUrls.add(item.link);
          continue;
        }

        // Step 2d: Use Claude to extract funding data
        const fundingData = await extractFundingData(articleContent);

        if (!fundingData) {
          console.log(`[Scrape] Not a funding article: ${item.title}`);
          result.skippedNotFunding++;
          processedUrls.add(item.link);
          continue;
        }

        // Step 2e: Check for company duplicate (in-batch)
        const normalizedCompany = normalizeCompanyName(fundingData.company_name);
        if (processedCompanies.has(normalizedCompany)) {
          console.log(`[Scrape] Skipping in-batch company duplicate: ${fundingData.company_name}`);
          result.skippedDuplicate++;
          processedUrls.add(item.link);
          continue;
        }

        // Step 2f: Check for duplicates in database (company + date)
        const existsByDate = await fundingRoundExists(
          fundingData.company_name,
          item.pubDate
        );

        if (existsByDate) {
          console.log(`[Scrape] Duplicate found (company+date): ${fundingData.company_name}`);
          result.skippedDuplicate++;
          processedUrls.add(item.link);
          processedCompanies.add(normalizedCompany);
          continue;
        }

        // Step 2g: Check for duplicates by company + amount + round (within 7 days)
        const existsByDetails = await fundingRoundExistsByDetails(
          fundingData.company_name,
          fundingData.funding_amount,
          fundingData.funding_round
        );

        if (existsByDetails) {
          console.log(`[Scrape] Duplicate found (company+amount+round): ${fundingData.company_name}`);
          result.skippedDuplicate++;
          processedUrls.add(item.link);
          processedCompanies.add(normalizedCompany);
          continue;
        }

        // Step 2h: Prepare data for insertion
        const fundingRound: FundingRoundInsert = {
          company_name: fundingData.company_name,
          funding_amount: fundingData.funding_amount,
          funding_round: fundingData.funding_round,
          investors: fundingData.investors,
          lead_investor: fundingData.lead_investor,
          product_description: fundingData.product_description,
          industry: fundingData.industry,
          source_url: item.link,
          source_name: item.source,
          published_at: item.pubDate ? new Date(item.pubDate).toISOString() : null,
        };

        // Step 2i: Insert into Supabase
        await insertFundingRound(fundingRound);

        // Track as processed to prevent in-batch duplicates
        processedUrls.add(item.link);
        processedCompanies.add(normalizedCompany);

        console.log(`[Scrape] Added: ${fundingData.company_name} (${formatAmount(fundingData.funding_amount)})`);
        result.newItemsAdded++;
        result.details.added.push({
          company: fundingData.company_name,
          amount: fundingData.funding_amount,
          source: item.source,
        });

        // Rate limiting delay
        await sleep(PROCESSING_DELAY);
      } catch (error) {
        // Log error but continue processing other items
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        console.error(`[Scrape] Error processing ${item.link}: ${errorMessage}`);
        result.errors++;
        result.details.errors.push({
          url: item.link,
          error: errorMessage,
        });
      }
    }

    result.duration = Date.now() - startTime;
    result.stoppedEarly = stoppedEarly;
    console.log(`[Scrape] Completed in ${result.duration}ms${stoppedEarly ? ' (stopped early due to timeout)' : ''}`);
    console.log(`[Scrape] Summary: ${result.newItemsAdded} added, ${result.skippedDuplicate} duplicates, ${result.skippedNotFunding} not funding, ${result.errors} errors`);

    return NextResponse.json(result);
  } catch (error) {
    // Critical error that prevented the scrape from running
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[Scrape] Critical error: ${errorMessage}`);

    result.success = false;
    result.duration = Date.now() - startTime;
    result.details.errors.push({
      url: "global",
      error: errorMessage,
    });

    return NextResponse.json(result, { status: 500 });
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
