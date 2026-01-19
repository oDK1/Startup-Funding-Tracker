/**
 * Supabase client configuration
 *
 * Provides:
 * - Browser client for frontend queries
 * - Server client for API routes (with service role key)
 */

// TODO: Import and configure Supabase client
// import { createClient } from "@supabase/supabase-js";

// Environment variables needed:
// - NEXT_PUBLIC_SUPABASE_URL
// - NEXT_PUBLIC_SUPABASE_ANON_KEY
// - SUPABASE_SERVICE_ROLE_KEY (for server-side operations)

export type FundingRound = {
  id: string;
  company_name: string;
  funding_amount: number | null;
  funding_round: string | null;
  investors: string[];
  lead_investor: string | null;
  product_description: string;
  industry: string | null;
  source_url: string;
  source_name: string | null;
  published_at: string | null;
  created_at: string;
};

// Placeholder for Supabase client
export const supabase = null;

// Placeholder for server-side Supabase client
export const supabaseAdmin = null;
