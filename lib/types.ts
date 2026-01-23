/**
 * Shared TypeScript types for the Startup Funding Tracker
 */

/**
 * FundingRound - Database model for funding_rounds table
 * Matches the Supabase schema exactly
 */
export interface FundingRound {
  id: string;
  company_name: string;
  funding_amount: number | null; // USD, null if undisclosed
  funding_round: string | null; // Seed, Series A, etc.
  investors: string[]; // Array, lead investor first
  lead_investor: string | null;
  product_description: string | null;
  industry: string | null;
  source_url: string;
  source_name: string | null; // Internal tracking only
  published_at: string | null; // ISO timestamp
  created_at: string; // ISO timestamp
}

/**
 * FundingRoundInsert - Type for inserting new funding rounds
 * Omits auto-generated fields
 */
export type FundingRoundInsert = Omit<FundingRound, "id" | "created_at">;

/**
 * ExtractedFunding - Claude extraction response format
 * This is the structure Claude returns when analyzing article content
 */
export interface ExtractedFunding {
  company_name: string;
  funding_amount: number | null;
  funding_round: string | null;
  investors: string[];
  lead_investor: string | null;
  product_description: string;
  industry: string | null;
}

/**
 * RSSItem - Parsed RSS feed item
 * Common fields across different RSS feeds
 */
export interface RSSItem {
  title: string;
  link: string;
  pubDate: string;
  content?: string;
  contentSnippet?: string;
  source: string; // Name of the RSS source
}

/**
 * RSSSource - Configuration for an RSS feed source
 */
export interface RSSSource {
  name: string;
  url: string;
}

/**
 * ScrapedArticle - Article with extracted content
 */
export interface ScrapedArticle {
  title: string;
  url: string;
  content: string;
  publishedAt: string | null;
  source: string;
}

/**
 * ScrapeProgress - Database model for scrape_progress table
 * Tracks progress of batch scraping operations
 */
export interface ScrapeProgress {
  id: string;
  source: string;
  month: number;
  year: number;
  status: "pending" | "in_progress" | "completed" | "failed";
  articles_found: number;
  articles_saved: number;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

/**
 * ScrapeProgressInsert - Type for inserting/updating scrape progress
 */
export type ScrapeProgressInsert = Omit<ScrapeProgress, "id" | "created_at">;

/**
 * ScrapeProgressUpdate - Type for partial updates to scrape progress
 */
export type ScrapeProgressUpdate = Partial<
  Omit<ScrapeProgress, "id" | "source" | "month" | "year" | "created_at">
>;

/**
 * Database types for Supabase
 * This provides type safety when using Supabase client
 * Follows the structure expected by @supabase/supabase-js
 */
export interface Database {
  public: {
    Tables: {
      funding_rounds: {
        Row: FundingRound;
        Insert: FundingRoundInsert;
        Update: Partial<FundingRoundInsert>;
        Relationships: [];
      };
      scrape_progress: {
        Row: ScrapeProgress;
        Insert: ScrapeProgressInsert;
        Update: ScrapeProgressUpdate;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
