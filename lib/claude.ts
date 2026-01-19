/**
 * Claude API integration for funding data extraction
 *
 * Uses Claude to analyze article content and extract structured
 * funding information (company, amount, round, investors, etc.)
 */

// Environment variable needed:
// - ANTHROPIC_API_KEY

export type ExtractedFunding = {
  company_name: string;
  funding_amount: number | null;
  funding_round: string | null;
  investors: string[];
  lead_investor: string | null;
  product_description: string;
  industry: string | null;
};

/**
 * Extraction prompt for Claude
 */
export const EXTRACTION_PROMPT = `Extract funding information from this article. Return JSON:
{
  "company_name": string,
  "funding_amount": number | null,
  "funding_round": string | null,
  "investors": string[],
  "lead_investor": string | null,
  "product_description": string,
  "industry": string | null
}

If this article is NOT about a startup funding round, return null.

Article content:
`;

/**
 * Extract funding data from article content using Claude
 * TODO: Implement with Anthropic SDK
 */
export async function extractFundingData(
  articleContent: string
): Promise<ExtractedFunding | null> {
  // TODO: Implement Claude API call
  // - Use Anthropic SDK
  // - Send article content with extraction prompt
  // - Parse JSON response
  // - Return null if not a funding article

  console.log(
    `Extracting funding data from article (${articleContent.length} chars)`
  );
  return null;
}
