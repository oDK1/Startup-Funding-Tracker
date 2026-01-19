/**
 * Supabase client configuration
 *
 * Provides:
 * - Browser client for frontend queries (uses ANON_KEY)
 * - Server/Admin client for API routes (uses SERVICE_ROLE_KEY)
 */

import { createClient } from "@supabase/supabase-js";
import type { FundingRound, FundingRoundInsert } from "./types";

// Re-export types for backward compatibility
export type { FundingRound, FundingRoundInsert };

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
 * @param options - Optional query options
 */
export async function getFundingRounds(options?: {
  limit?: number;
  offset?: number;
  orderBy?: keyof FundingRound;
  ascending?: boolean;
}): Promise<FundingRound[]> {
  const client = getSupabaseClient();
  const {
    limit = 50,
    offset = 0,
    orderBy = "published_at",
    ascending = false,
  } = options || {};

  const { data, error } = await client
    .from("funding_rounds")
    .select("*")
    .order(orderBy, { ascending })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Error fetching funding rounds:", error);
    throw error;
  }

  return (data as FundingRound[]) || [];
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
