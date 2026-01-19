/**
 * RSS feed scraper and article content extractor
 *
 * Responsibilities:
 * - Fetch RSS feeds from configured sources
 * - Parse RSS XML to extract article URLs
 * - Fetch and extract article content using cheerio/readability
 */

import Parser from "rss-parser";
import type { RSSItem, RSSSource } from "./types";

// Re-export for backward compatibility
export type { RSSItem };

// Create a single parser instance for reuse
const parser = new Parser({
  timeout: 10000, // 10 second timeout
  headers: {
    "User-Agent":
      "Mozilla/5.0 (compatible; StartupFundingTracker/1.0; +https://github.com/startup-funding-tracker)",
    Accept: "application/rss+xml, application/xml, text/xml, */*",
  },
  customFields: {
    item: [
      ["content:encoded", "contentEncoded"],
      ["description", "description"],
    ],
  },
});

// Data sources (RSS feeds)
export const RSS_SOURCES: RSSSource[] = [
  {
    name: "TechCrunch",
    url: "https://techcrunch.com/category/startups/feed/",
  },
  {
    name: "Crunchbase News",
    url: "https://news.crunchbase.com/feed/",
  },
  {
    name: "Forbes",
    url: "https://www.forbes.com/business/feed/",
  },
  {
    name: "Bloomberg",
    url: "https://feeds.bloomberg.com/markets/news.rss",
  },
  {
    name: "Tech Funding News",
    url: "https://techfundingnews.com/feed/",
  },
];

/**
 * Fetch and parse a single RSS feed
 *
 * @param url - The RSS feed URL to fetch
 * @param sourceName - Name of the source for attribution
 * @returns Array of RSSItem objects from the feed
 */
export async function fetchRSSFeed(
  url: string,
  sourceName: string
): Promise<RSSItem[]> {
  try {
    console.log(`[RSS] Fetching feed from ${sourceName}: ${url}`);

    const feed = await parser.parseURL(url);

    const items: RSSItem[] = feed.items.map((item) => {
      // Get content from various possible fields
      const content =
        (item as { contentEncoded?: string }).contentEncoded ||
        item.content ||
        (item as { description?: string }).description ||
        item.contentSnippet ||
        "";

      return {
        title: item.title || "Untitled",
        link: item.link || "",
        pubDate: item.pubDate || item.isoDate || new Date().toISOString(),
        content: content,
        contentSnippet: item.contentSnippet || "",
        source: sourceName,
      };
    });

    console.log(`[RSS] Fetched ${items.length} items from ${sourceName}`);
    return items;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`[RSS] Error fetching ${sourceName}: ${errorMessage}`);
    // Return empty array on error - don't let one feed failure break everything
    return [];
  }
}

/**
 * Fetch all RSS feeds from configured sources
 * Fetches feeds in parallel and handles errors gracefully
 *
 * @returns Combined array of RSSItem objects from all sources
 */
export async function fetchAllRSSFeeds(): Promise<RSSItem[]> {
  console.log(`[RSS] Starting fetch of ${RSS_SOURCES.length} RSS feeds`);

  // Fetch all feeds in parallel for better performance
  const feedPromises = RSS_SOURCES.map((source) =>
    fetchRSSFeed(source.url, source.name)
  );

  const results = await Promise.allSettled(feedPromises);

  // Collect all successful results
  const allItems: RSSItem[] = [];
  let successCount = 0;
  let failCount = 0;

  results.forEach((result, index) => {
    const source = RSS_SOURCES[index];
    if (result.status === "fulfilled") {
      allItems.push(...result.value);
      if (result.value.length > 0) {
        successCount++;
      }
    } else {
      // This shouldn't happen since fetchRSSFeed catches errors,
      // but handle it just in case
      console.error(
        `[RSS] Unexpected error for ${source.name}: ${result.reason}`
      );
      failCount++;
    }
  });

  console.log(
    `[RSS] Fetch complete: ${allItems.length} total items from ${successCount} sources (${failCount} failures)`
  );

  return allItems;
}

/**
 * Extract article content from URL
 * TODO: Implement with cheerio and @mozilla/readability
 */
export async function extractArticleContent(url: string): Promise<string> {
  // TODO: Implement article content extraction
  console.log(`Extracting content from: ${url}`);
  return "";
}

/**
 * Fetch all RSS feeds and extract content
 * Alias for fetchAllRSSFeeds for backward compatibility
 */
export async function scrapeAllSources(): Promise<RSSItem[]> {
  return fetchAllRSSFeeds();
}
