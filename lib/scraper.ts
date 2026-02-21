/**
 * RSS feed scraper and article content extractor
 *
 * Responsibilities:
 * - Fetch RSS feeds from configured sources
 * - Parse RSS XML to extract article URLs
 * - Fetch and extract article content using cheerio/readability
 */

import Parser from "rss-parser";
import * as cheerio from "cheerio";
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
  // VC-focused feeds for higher signal-to-noise ratio (verified working)
  {
    name: "PR Newswire VC",
    url: "https://www.prnewswire.com/rss/financial-services-latest-news/venture-capital-list.rss",
  },
  {
    name: "GlobeNewswire Financing",
    url: "https://www.globenewswire.com/RssFeed/subjectcode/17-Financing%20Agreements/feedTitle/GlobeNewswire%20-%20Financing%20Agreements",
  },
  {
    name: "NVCA Blog",
    url: "https://nvca.org/feed/",
  },
  {
    name: "VC Cafe",
    url: "https://www.vccafe.com/feed/",
  },
  {
    name: "Techmeme",
    url: "https://www.techmeme.com/feed.xml",
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
 * Common selectors for article content on news sites
 * Ordered by specificity - more specific selectors first
 */
const ARTICLE_SELECTORS = [
  "article",
  ".article-content",
  ".article-body",
  ".post-content",
  ".entry-content",
  ".story-content",
  ".content-body",
  '[role="main"]',
  "main",
  ".main-content",
];

/**
 * Elements to remove before extracting text
 * These typically contain non-article content
 */
const ELEMENTS_TO_REMOVE = [
  "script",
  "style",
  "nav",
  "footer",
  "aside",
  "header",
  ".advertisement",
  ".ad",
  ".ads",
  ".sidebar",
  ".comments",
  ".comment-section",
  ".social-share",
  ".share-buttons",
  ".related-posts",
  ".related-articles",
  ".newsletter-signup",
  ".subscription-box",
  "iframe",
  "noscript",
  "svg",
  "figure figcaption",
];

/**
 * Extract article content from a URL
 *
 * Fetches the HTML page, parses it with cheerio, removes unwanted elements,
 * and extracts the main article text content.
 *
 * @param url - The article URL to fetch and extract content from
 * @returns The extracted article text, or empty string on error
 */
export async function extractArticleContent(url: string): Promise<string> {
  console.log(`[Extractor] Extracting content from: ${url}`);

  try {
    // Create an AbortController for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

    // Fetch the HTML page
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.error(
        `[Extractor] HTTP error fetching ${url}: ${response.status} ${response.statusText}`
      );
      return "";
    }

    const html = await response.text();

    // Parse HTML with cheerio
    const $ = cheerio.load(html);

    // Remove unwanted elements
    ELEMENTS_TO_REMOVE.forEach((selector) => {
      $(selector).remove();
    });

    // Try to find article content using common selectors
    let articleContent = "";

    for (const selector of ARTICLE_SELECTORS) {
      const element = $(selector);
      if (element.length > 0) {
        // Get the text content of the first matching element
        articleContent = element.first().text();
        if (articleContent.trim().length > 100) {
          // Found substantial content
          console.log(
            `[Extractor] Found content using selector: ${selector}`
          );
          break;
        }
      }
    }

    // Fallback: if no article selector worked, try body content
    if (articleContent.trim().length < 100) {
      console.log(`[Extractor] Using body fallback for: ${url}`);
      articleContent = $("body").text();
    }

    // Clean up the text
    const cleanedContent = cleanText(articleContent);

    console.log(
      `[Extractor] Extracted ${cleanedContent.length} characters from: ${url}`
    );
    return cleanedContent;
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        console.error(`[Extractor] Timeout fetching ${url}`);
      } else {
        console.error(`[Extractor] Error extracting from ${url}: ${error.message}`);
      }
    } else {
      console.error(`[Extractor] Unknown error extracting from ${url}`);
    }
    return "";
  }
}

/**
 * Clean extracted text content
 *
 * - Normalizes whitespace (multiple spaces/newlines to single space)
 * - Trims leading/trailing whitespace
 * - Removes excessive blank lines
 *
 * @param text - Raw extracted text
 * @returns Cleaned text
 */
function cleanText(text: string): string {
  return (
    text
      // Replace multiple whitespace characters (including newlines, tabs) with a single space
      .replace(/\s+/g, " ")
      // Trim leading and trailing whitespace
      .trim()
  );
}

/**
 * Fetch all RSS feeds and extract content
 * Alias for fetchAllRSSFeeds for backward compatibility
 */
export async function scrapeAllSources(): Promise<RSSItem[]> {
  return fetchAllRSSFeeds();
}
