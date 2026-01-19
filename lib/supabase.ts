/**
 * Supabase client configuration
 *
 * Provides:
 * - Browser client for frontend queries (uses ANON_KEY)
 * - Server/Admin client for API routes (uses SERVICE_ROLE_KEY)
 */

import { createClient } from "@supabase/supabase-js";
import type {
  FundingRound,
  FundingRoundInsert,
  ScrapeProgress,
  ScrapeProgressUpdate,
} from "./types";

// Re-export types for backward compatibility
export type { FundingRound, FundingRoundInsert, ScrapeProgress };

// Environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * Browser/Public Supabase client
 * Uses the anon key - respects Row Level Security (RLS)
 * Safe to use in client-side code
 */
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey)
    : null;

/**
 * Server/Admin Supabase client
 * Uses the service role key - bypasses Row Level Security (RLS)
 * Only use in server-side code (API routes, server components)
 */
export const supabaseAdmin =
  supabaseUrl && supabaseServiceRoleKey
    ? createClient(supabaseUrl, supabaseServiceRoleKey, {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      })
    : null;

/**
 * Get the appropriate Supabase client
 * Returns admin client if available (for server-side), otherwise public client
 */
export function getSupabaseClient() {
  const client = supabaseAdmin || supabase;
  if (!client) {
    throw new Error(
      "Supabase client not initialized. Check your environment variables: " +
        "NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY"
    );
  }
  return client;
}

/**
 * Get the admin Supabase client (for server-side operations)
 * Throws if not available
 */
export function getSupabaseAdmin() {
  if (!supabaseAdmin) {
    throw new Error(
      "Supabase admin client not initialized. Check your environment variables: " +
        "NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY"
    );
  }
  return supabaseAdmin;
}

/**
 * Helper function to fetch all funding rounds
 * @param options - Optional query options including search and filters
 */
export async function getFundingRounds(options?: {
  limit?: number;
  offset?: number;
  orderBy?: keyof FundingRound;
  ascending?: boolean;
  search?: string;
  roundFilter?: string;
  industryFilter?: string;
}): Promise<FundingRound[]> {
  const client = getSupabaseClient();
  const {
    limit = 50,
    offset = 0,
    orderBy = "published_at",
    ascending = false,
    search,
    roundFilter,
    industryFilter,
  } = options || {};

  let query = client.from("funding_rounds").select("*");

  // Apply search filter (case-insensitive partial match on company_name or product_description)
  if (search && search.trim()) {
    const searchTerm = search.trim();
    query = query.or(
      `company_name.ilike.%${searchTerm}%,product_description.ilike.%${searchTerm}%`
    );
  }

  // Apply round filter (exact match)
  if (roundFilter) {
    query = query.eq("funding_round", roundFilter);
  }

  // Apply industry filter (exact match)
  if (industryFilter) {
    query = query.eq("industry", industryFilter);
  }

  // Apply ordering and pagination
  const { data, error } = await query
    .order(orderBy, { ascending })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching funding rounds:", error);
    throw error;
  }

  return (data as FundingRound[]) || [];
}

/**
 * Get unique filter options (rounds and industries) from the database
 * Paginates through all records to ensure we get all unique values
 */
export async function getFilterOptions(): Promise<{
  rounds: string[];
  industries: string[];
}> {
  const client = getSupabaseClient();
  const batchSize = 1000;

  // Helper to fetch all records with pagination
  async function fetchAllValues<T>(
    column: string
  ): Promise<T[]> {
    const allData: T[] = [];
    let offset = 0;

    while (true) {
      const { data, error } = await client
        .from("funding_rounds")
        .select(column)
        .not(column, "is", null)
        .range(offset, offset + batchSize - 1);

      if (error) {
        console.error(`Error fetching ${column} options:`, error);
        throw error;
      }

      if (!data || data.length === 0) break;
      allData.push(...(data as T[]));
      if (data.length < batchSize) break;
      offset += batchSize;
    }

    return allData;
  }

  // Fetch all funding rounds and industries in parallel
  const [roundsData, industriesData] = await Promise.all([
    fetchAllValues<{ funding_round: string }>("funding_round"),
    fetchAllValues<{ industry: string }>("industry"),
  ]);

  // Extract unique values
  const rounds = [
    ...new Set(
      roundsData
        .map((r) => r.funding_round)
        .filter(Boolean)
    ),
  ].sort();

  const industries = [
    ...new Set(
      industriesData
        .map((i) => i.industry)
        .filter(Boolean)
    ),
  ].sort();

  return { rounds, industries };
}

/**
 * Helper function to insert a funding round
 * Uses admin client to bypass RLS
 */
export async function insertFundingRound(
  round: FundingRoundInsert
): Promise<FundingRound> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from("funding_rounds")
    .insert(round as Record<string, unknown>)
    .select()
    .single();

  if (error) {
    console.error("Error inserting funding round:", error);
    throw error;
  }

  return data as FundingRound;
}

/**
 * Helper function to check if a funding round already exists
 * Used for deduplication based on company_name and published_at date
 */
export async function fundingRoundExists(
  companyName: string,
  publishedAt: string | null
): Promise<boolean> {
  const client = getSupabaseClient();

  if (!publishedAt) {
    // If no published date, check by company name only (within last 24 hours)
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);

    const { data, error } = await client
      .from("funding_rounds")
      .select("id")
      .eq("company_name", companyName)
      .gte("created_at", yesterday.toISOString())
      .limit(1);

    if (error) {
      console.error("Error checking for existing funding round:", error);
      return false;
    }

    return (data?.length || 0) > 0;
  }

  // Check by company name and published date
  const publishedDate = new Date(publishedAt).toISOString().split("T")[0];

  const { data, error } = await client
    .from("funding_rounds")
    .select("id")
    .eq("company_name", companyName)
    .gte("published_at", `${publishedDate}T00:00:00Z`)
    .lt("published_at", `${publishedDate}T23:59:59Z`)
    .limit(1);

  if (error) {
    console.error("Error checking for existing funding round:", error);
    return false;
  }

  return (data?.length || 0) > 0;
}

/**
 * Get or create a scrape progress record for a specific source/month/year
 * If the record exists, returns it. Otherwise, creates a new one with 'pending' status.
 */
export async function getOrCreateProgress(
  source: string,
  month: number,
  year: number
): Promise<ScrapeProgress> {
  const client = getSupabaseAdmin();

  // First try to get existing record
  const { data: existing, error: selectError } = await client
    .from("scrape_progress")
    .select("*")
    .eq("source", source)
    .eq("month", month)
    .eq("year", year)
    .single();

  if (existing && !selectError) {
    return existing as ScrapeProgress;
  }

  // Create new record if not exists
  const { data: created, error: insertError } = await client
    .from("scrape_progress")
    .insert({
      source,
      month,
      year,
      status: "pending",
      articles_found: 0,
      articles_saved: 0,
    } as Record<string, unknown>)
    .select()
    .single();

  if (insertError) {
    // Handle race condition - record might have been created by another process
    if (insertError.code === "23505") {
      // unique violation
      const { data: retry, error: retryError } = await client
        .from("scrape_progress")
        .select("*")
        .eq("source", source)
        .eq("month", month)
        .eq("year", year)
        .single();

      if (retryError) {
        throw retryError;
      }
      return retry as ScrapeProgress;
    }
    throw insertError;
  }

  return created as ScrapeProgress;
}

/**
 * Update a scrape progress record by ID
 */
export async function updateProgress(
  id: string,
  updates: ScrapeProgressUpdate
): Promise<ScrapeProgress> {
  const client = getSupabaseAdmin();

  const { data, error } = await client
    .from("scrape_progress")
    .update(updates as Record<string, unknown>)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    console.error("Error updating scrape progress:", error);
    throw error;
  }

  return data as ScrapeProgress;
}

/**
 * Get all pending or failed months for a source that haven't been completed yet
 * Optionally filter by date range
 */
export async function getPendingMonths(
  source: string,
  options?: {
    startMonth?: number;
    startYear?: number;
    endMonth?: number;
    endYear?: number;
  }
): Promise<ScrapeProgress[]> {
  const client = getSupabaseClient();

  let query = client
    .from("scrape_progress")
    .select("*")
    .eq("source", source)
    .in("status", ["pending", "failed"])
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  // Note: Date range filtering would need to be done in application code
  // as Supabase doesn't support complex compound conditions easily

  const { data, error } = await query;

  if (error) {
    console.error("Error fetching pending months:", error);
    throw error;
  }

  let results = (data as ScrapeProgress[]) || [];

  // Apply date range filter in application code
  if (options) {
    const { startMonth, startYear, endMonth, endYear } = options;
    results = results.filter((p) => {
      const pDate = p.year * 12 + p.month;
      const startDate = startYear && startMonth ? startYear * 12 + startMonth : 0;
      const endDate =
        endYear && endMonth ? endYear * 12 + endMonth : Number.MAX_SAFE_INTEGER;
      return pDate >= startDate && pDate <= endDate;
    });
  }

  return results;
}

/**
 * Get all scrape progress records for a source
 */
export async function getAllProgress(source: string): Promise<ScrapeProgress[]> {
  const client = getSupabaseClient();

  const { data, error } = await client
    .from("scrape_progress")
    .select("*")
    .eq("source", source)
    .order("year", { ascending: true })
    .order("month", { ascending: true });

  if (error) {
    console.error("Error fetching all progress:", error);
    throw error;
  }

  return (data as ScrapeProgress[]) || [];
}
