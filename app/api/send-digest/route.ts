import { NextResponse } from "next/server";

/**
 * Email digest sender API route
 *
 * This endpoint will:
 * 1. Query today's funding rounds from Supabase
 * 2. Format data into email template
 * 3. Send via Resend
 *
 * Triggered after scraper completes or via separate cron
 */
export async function GET() {
  // TODO: Implement email digest logic
  // - Query today's funding rounds from Supabase
  // - Sort by funding amount (descending)
  // - Format into plain text email template
  // - Send via Resend API

  return NextResponse.json({
    message: "Email digest endpoint - not yet implemented",
  });
}
