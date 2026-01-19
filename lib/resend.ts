/**
 * Resend email integration for daily digest
 *
 * Sends formatted email digest with today's funding rounds
 */

import { Resend } from "resend";
import type { FundingRound } from "./types";

// Environment variables needed:
// - RESEND_API_KEY
// - DIGEST_EMAIL_TO

// Initialize Resend client
const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

/**
 * Get the Resend client, throwing an error if not configured
 */
function getResendClient(): Resend {
  if (!resend) {
    throw new Error(
      "Resend client not initialized. Check your RESEND_API_KEY environment variable."
    );
  }
  return resend;
}

/**
 * Format funding amount for display
 */
export function formatAmount(amount: number | null): string {
  if (amount === null) return "Undisclosed";
  if (amount >= 1_000_000_000) {
    return `$${(amount / 1_000_000_000).toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(0)}M`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Generate email subject line
 */
export function generateSubject(
  rounds: FundingRound[],
  date: Date
): string {
  const totalAmount = rounds.reduce((sum, r) => sum + (r.funding_amount || 0), 0);
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `Funding Digest - ${dateStr} (${rounds.length} rounds, ${formatAmount(totalAmount)} total)`;
}

/**
 * Generate plain text email body
 */
export function generateEmailBody(rounds: FundingRound[], date: Date): string {
  const dateStr = date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const divider = "────────────────────────────────────────────────────";

  let body = `${divider}

STARTUP FUNDING DIGEST
${dateStr}

${divider}

`;

  for (const round of rounds) {
    body += `${formatAmount(round.funding_amount).padEnd(7)} | ${round.company_name} | ${round.funding_round || "Unknown"} | ${round.lead_investor || "Undisclosed"}
         ${round.product_description}
         -> ${round.source_url}

`;
  }

  body += `${divider}

View all: https://your-app.vercel.app

${divider}`;

  return body;
}

/**
 * Result type for email sending operations
 */
export interface SendEmailResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

/**
 * Send email digest via Resend
 *
 * @param rounds - Array of funding rounds to include in the digest
 * @param recipientEmail - Email address to send the digest to
 * @returns Promise resolving to the send result
 */
export async function sendDigestEmail(
  rounds: FundingRound[],
  recipientEmail: string
): Promise<SendEmailResult> {
  const client = getResendClient();
  const date = new Date();
  const subject = generateSubject(rounds, date);
  const body = generateEmailBody(rounds, date);

  console.log(`[Resend] Sending digest to ${recipientEmail}`);
  console.log(`[Resend] Subject: ${subject}`);
  console.log(`[Resend] Rounds included: ${rounds.length}`);

  try {
    const { data, error } = await client.emails.send({
      from: "Startup Funding Tracker <onboarding@resend.dev>",
      to: [recipientEmail],
      subject: subject,
      text: body,
    });

    if (error) {
      console.error(`[Resend] Error sending email:`, error);
      return {
        success: false,
        error: error.message,
      };
    }

    console.log(`[Resend] Email sent successfully, ID: ${data?.id}`);
    return {
      success: true,
      messageId: data?.id,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : "Unknown error";
    console.error(`[Resend] Exception sending email:`, errorMessage);
    return {
      success: false,
      error: errorMessage,
    };
  }
}
