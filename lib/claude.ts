/**
 * Claude API integration for funding data extraction
 *
 * Uses Claude to analyze article content and extract structured
 * funding information (company, amount, round, investors, etc.)
 */

import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedFunding } from "./types";

// Re-export for backward compatibility
export type { ExtractedFunding };

// Initialize Anthropic client
// Uses ANTHROPIC_API_KEY from environment automatically
const anthropic = new Anthropic();

// Model to use for extraction (fast and cost-effective)
const MODEL = "claude-haiku-4-5-20251001";

// Maximum tokens for response
const MAX_TOKENS = 1024;

/**
 * System prompt for funding extraction
 */
const SYSTEM_PROMPT = `You are a precise data extraction assistant. Your job is to extract funding information from news articles that mention a specific new startup funding round.

You must respond with ONLY valid JSON, no other text or explanation.

Return null if:
- The article merely MENTIONS a company's past funding as background detail (e.g., "Company X, which raised $50M last year, today launched...")
- The article mentions AGGREGATE or CUMULATIVE funding to date (e.g., "has raised $100M to date", "total funding reaches $50M", "bringing total raised to $200M")
- The funding amount refers to total capital raised over multiple rounds, not a single new round
- The funding is a public offering (IPO, SPAC, direct listing, secondary offering, public offering)
- The funding is a PRIVATE PLACEMENT (PIPE, registered direct offering, or similar public company financings)
- The article is a roundup that references old funding news
- The article discusses funding plans or intentions without confirming a closed round
- Acquisitions, partnerships, product launches, layoffs, or general company news with NO funding component

ONLY extract when:
- The article mentions a SPECIFIC NEW funding round (Seed, Series A, Series B, etc.)
  OR a specific new investment amount raised in a single transaction
- The company name and funding are clearly identifiable
- Extract even if the article also announces a product launch, acquisition, expansion, or milestone
  alongside the funding — as long as a specific new round is present

If the article IS announcing a recent private venture funding round, extract the data and return:
{
  "company_name": string,
  "funding_amount": number | null,
  "funding_round": string | null,
  "investors": string[],
  "lead_investor": string | null,
  "product_description": string,
  "industry": string | null
}

Rules:
- company_name: The name of the startup that received funding
- funding_amount: The amount in USD as a number (e.g., 50000000 for $50M). Use null if undisclosed. MUST be the amount for THIS SPECIFIC ROUND, not cumulative/total funding.
- funding_round: The round type (e.g., "Seed", "Series A", "Series B", etc.). Use null if not mentioned. Categorize growth rounds as "etc."
- investors: Array of investor names, with lead investor first if known
- lead_investor: The lead investor name, or null if not specified
- product_description: A brief 1-2 sentence description of what the company does
- industry: The company's industry/sector (e.g., "AI", "Healthcare", "Fintech"). Use null if unclear

If the article is NOT specifically announcing a new funding round, respond with exactly: null

Do not include any markdown formatting, code blocks, or explanations. Just the JSON or null.`;

/**
 * User prompt template for funding extraction
 */
const USER_PROMPT_TEMPLATE = `Extract funding information from the following article:

---
{content}
---

Remember: Respond with ONLY valid JSON or null. No other text.`;

/**
 * Extract funding data from article content using Claude
 *
 * @param articleContent - The text content of the article to analyze
 * @returns ExtractedFunding object if article is about funding, null otherwise
 */
export async function extractFundingData(
  articleContent: string
): Promise<ExtractedFunding | null> {
  // Validate input
  if (!articleContent || articleContent.trim().length === 0) {
    console.log("Empty article content, skipping extraction");
    return null;
  }

  // Truncate very long articles to avoid token limits
  // Claude 3.5 Haiku has a 200K context, but we don't need that much
  const maxContentLength = 15000;
  const content =
    articleContent.length > maxContentLength
      ? articleContent.slice(0, maxContentLength) + "..."
      : articleContent;

  console.log(`Extracting funding data from article (${content.length} chars)`);

  try {
    const response = await anthropic.messages.create({
      model: MODEL,
      max_tokens: MAX_TOKENS,
      messages: [
        {
          role: "user",
          content: USER_PROMPT_TEMPLATE.replace("{content}", content),
        },
      ],
      system: SYSTEM_PROMPT,
    });

    // Extract text content from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      console.log("No text content in Claude response");
      return null;
    }

    // Strip markdown code fences if Claude wrapped the response (e.g. ```json ... ```)
    const rawText = textBlock.text.trim();
    const responseText = rawText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    // Check if Claude determined this is not a funding article
    if (responseText === "null" || responseText.toLowerCase() === "null") {
      console.log("Article is not about startup funding");
      return null;
    }

    // Parse JSON response
    const parsed = JSON.parse(responseText) as ExtractedFunding;

    // Validate required fields
    if (!parsed.company_name || typeof parsed.company_name !== "string") {
      console.log("Invalid extraction: missing company_name");
      return null;
    }

    if (
      !parsed.product_description ||
      typeof parsed.product_description !== "string"
    ) {
      console.log("Invalid extraction: missing product_description");
      return null;
    }

    // Ensure investors is an array
    if (!Array.isArray(parsed.investors)) {
      parsed.investors = [];
    }

    // Normalize funding_amount to number or null
    if (parsed.funding_amount !== null) {
      const amount = Number(parsed.funding_amount);
      parsed.funding_amount = isNaN(amount) ? null : amount;
    }

    console.log(`Successfully extracted funding data for: ${parsed.company_name}`);
    return parsed;
  } catch (error) {
    // Handle specific error types
    if (error instanceof SyntaxError) {
      console.error("Failed to parse Claude response as JSON:", error.message);
      return null;
    }

    if (error instanceof Anthropic.APIError) {
      console.error(
        `Anthropic API error: ${error.status} - ${error.message}`
      );
      throw error; // propagate so caller counts it as an error, not a non-funding skip
    }

    // Log unexpected errors
    console.error("Unexpected error during funding extraction:", error);
    return null;
  }
}
