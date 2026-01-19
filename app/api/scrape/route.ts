import { NextRequest, NextResponse } from "next/server";
import { fetchAllRSSFeeds, extractArticleContent } from "@/lib/scraper";
import { extractFundingData } from "@/lib/claude";
import {
  fundingRoundExists,
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
const MAX_ITEMS_PER_RUN = 50;

// Delay between processing items to avoid rate limits (in ms)
const PROCESSING_DELAY = 500;

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

    // Step 2: Process each item
    for (const item of itemsToProcess) {
      result.itemsProcessed++;

      try {
        // Validate item has required fields
        if (!item.link) {
          console.log(`[Scrape] Skipping item with no URL: ${item.title}`);
          continue;
        }

        console.log(`[Scrape] Processing: ${item.title}`);

        // Step 2a: Extract article content first (needed for Claude extraction)
        // We extract content before dedup check because we need company name
        // from Claude to do proper deduplication
        const articleContent = await extractArticleContent(item.link);

        if (!articleContent || articleContent.length < 100) {
          console.log(`[Scrape] Skipping - insufficient content: ${item.link}`);
          result.skippedNotFunding++;
          continue;
        }

        // Step 2b: Use Claude to extract funding data
        const fundingData = await extractFundingData(articleContent);

        if (!fundingData) {
          console.log(`[Scrape] Not a funding article: ${item.title}`);
          result.skippedNotFunding++;
          continue;
        }

        // Step 2c: Check for duplicates (now that we have company name)
        const exists = await fundingRoundExists(
          fundingData.company_name,
          item.pubDate
        );

        if (exists) {
          console.log(`[Scrape] Duplicate found: ${fundingData.company_name}`);
          result.skippedDuplicate++;
          continue;
        }

        // Step 2d: Prepare data for insertion
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

        // Step 2e: Insert into Supabase
        await insertFundingRound(fundingRound);

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
    console.log(`[Scrape] Completed in ${result.duration}ms`);
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
