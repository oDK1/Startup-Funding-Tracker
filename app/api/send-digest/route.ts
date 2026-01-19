import { NextRequest, NextResponse } from "next/server";
import { getSupabaseClient, type FundingRound } from "@/lib/supabase";
import { sendDigestEmail } from "@/lib/resend";

/**
 * Email digest sender API route
 *
 * This endpoint:
 * 1. Queries today's funding rounds from Supabase
 * 2. Sorts by funding amount (descending)
 * 3. Formats data into email template
 * 4. Sends via Resend
 *
 * Triggered after scraper completes or via separate cron
 */

/**
 * Result tracking for the digest operation
 */
interface DigestResult {
  success: boolean;
  message: string;
  roundsFound: number;
  emailSent: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Verify authorization for cron/API requests
 * Checks for CRON_SECRET header if configured
 */
function verifyAuthorization(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;

  // If no CRON_SECRET is configured, allow all requests (development mode)
  if (!cronSecret) {
    console.log("[SendDigest] No CRON_SECRET configured, allowing request");
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

  console.log("[SendDigest] Authorization failed");
  return false;
}

/**
 * Get today's date range for querying
 * Returns start and end of today in ISO format
 */
function getTodayDateRange(): { start: string; end: string } {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999
  );

  return {
    start: startOfDay.toISOString(),
    end: endOfDay.toISOString(),
  };
}

/**
 * Query today's funding rounds from Supabase
 * Returns rounds sorted by funding_amount DESC
 */
async function getTodaysFundingRounds(): Promise<FundingRound[]> {
  const client = getSupabaseClient();
  const { start, end } = getTodayDateRange();

  console.log(`[SendDigest] Querying funding rounds from ${start} to ${end}`);

  // Query for rounds where published_at is today OR created_at is today
  // This handles both cases: articles with published dates and newly scraped articles
  const { data, error } = await client
    .from("funding_rounds")
    .select("*")
    .or(`published_at.gte.${start},created_at.gte.${start}`)
    .or(`published_at.lte.${end},created_at.lte.${end}`)
    .order("funding_amount", { ascending: false, nullsFirst: false });

  if (error) {
    console.error("[SendDigest] Error querying funding rounds:", error);
    throw error;
  }

  // Filter to ensure we only get today's rounds
  // (the OR query may include some edge cases)
  const todayRounds = (data as FundingRound[]).filter((round) => {
    const publishedAt = round.published_at
      ? new Date(round.published_at)
      : null;
    const createdAt = new Date(round.created_at);
    const startDate = new Date(start);
    const endDate = new Date(end);

    // Check if either published_at or created_at is within today
    if (publishedAt && publishedAt >= startDate && publishedAt <= endDate) {
      return true;
    }
    if (createdAt >= startDate && createdAt <= endDate) {
      return true;
    }
    return false;
  });

  return todayRounds;
}

/**
 * GET /api/send-digest
 *
 * Query today's funding rounds and send email digest
 */
export async function GET(request: NextRequest) {
  console.log("[SendDigest] Starting digest send job...");

  // Verify authorization
  if (!verifyAuthorization(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result: DigestResult = {
    success: false,
    message: "",
    roundsFound: 0,
    emailSent: false,
  };

  try {
    // Check for recipient email
    const recipientEmail = process.env.DIGEST_EMAIL_TO;
    if (!recipientEmail) {
      console.error("[SendDigest] DIGEST_EMAIL_TO environment variable not set");
      result.message = "DIGEST_EMAIL_TO environment variable not configured";
      result.error = "Missing recipient email configuration";
      return NextResponse.json(result, { status: 500 });
    }

    // Query today's funding rounds
    console.log("[SendDigest] Querying today's funding rounds...");
    const rounds = await getTodaysFundingRounds();
    result.roundsFound = rounds.length;
    console.log(`[SendDigest] Found ${rounds.length} funding rounds for today`);

    // If no rounds today, return without sending
    if (rounds.length === 0) {
      console.log("[SendDigest] No funding rounds found for today, skipping email");
      result.success = true;
      result.message = "No funding rounds found for today, email not sent";
      return NextResponse.json(result);
    }

    // Send the digest email
    console.log(`[SendDigest] Sending digest email to ${recipientEmail}...`);
    const emailResult = await sendDigestEmail(rounds, recipientEmail);

    if (emailResult.success) {
      result.success = true;
      result.emailSent = true;
      result.messageId = emailResult.messageId;
      result.message = `Successfully sent digest with ${rounds.length} funding rounds`;
      console.log(`[SendDigest] ${result.message}`);
    } else {
      result.success = false;
      result.emailSent = false;
      result.error = emailResult.error;
      result.message = `Failed to send email: ${emailResult.error}`;
      console.error(`[SendDigest] ${result.message}`);
      return NextResponse.json(result, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error(`[SendDigest] Critical error: ${errorMessage}`);

    result.success = false;
    result.message = `Error sending digest: ${errorMessage}`;
    result.error = errorMessage;

    return NextResponse.json(result, { status: 500 });
  }
}

/**
 * POST /api/send-digest
 *
 * Alternative POST handler for triggering digest
 * Useful when chaining from /api/scrape
 */
export async function POST(request: NextRequest) {
  return GET(request);
}
