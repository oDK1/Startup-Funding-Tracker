/**
 * Resend email integration for daily digest
 *
 * Sends formatted email digest with today's funding rounds
 */

import type { FundingRound } from "./supabase";

// Environment variables needed:
// - RESEND_API_KEY
// - DIGEST_EMAIL_TO

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
 * Send email digest via Resend
 * TODO: Implement with Resend SDK
 */
export async function sendDigestEmail(rounds: FundingRound[]): Promise<void> {
  // TODO: Implement Resend API call
  // - Generate subject and body
  // - Send via Resend
  const date = new Date();
  const subject = generateSubject(rounds, date);
  const body = generateEmailBody(rounds, date);

  console.log("Email digest preview:");
  console.log(`Subject: ${subject}`);
  console.log(body);
}
