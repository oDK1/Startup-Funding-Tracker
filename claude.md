# Startup Funding Tracker - Implementation Plan

## Overview
A web app that scrapes tech media daily, extracts startup funding data using Claude, displays it in a searchable table, and sends a daily email digest.

## Tech Stack
- **Frontend/Backend:** Next.js (App Router) on Vercel
- **Database:** Supabase (PostgreSQL + RLS)
- **Email:** Resend
- **AI Extraction:** Claude API
- **Styling:** Tailwind CSS

## Architecture

```
Vercel Cron (6am daily)
       │
       ▼
┌──────────────────┐     ┌─────────────────┐
│ /api/scrape      │────▶│ Claude API      │
│ (fetch + extract)│     │ (extraction)    │
└────────┬─────────┘     └─────────────────┘
         │
         ▼
┌──────────────────┐     ┌─────────────────┐
│ Supabase         │────▶│ Resend          │
│ (store data)     │     │ (email digest)  │
└────────┬─────────┘     └─────────────────┘
         │
         ▼
┌──────────────────┐
│ Next.js Web UI   │
│ (table view)     │
└──────────────────┘
```

## Data Sources (5 total)
1. **TechCrunch** - RSS: `techcrunch.com/category/startups/feed/`
2. **Crunchbase News** - RSS: `news.crunchbase.com/feed/`
3. **Forbes** - RSS: `forbes.com/business/feed/`
4. **Bloomberg** - RSS: `feeds.bloomberg.com/markets/news.rss`
5. **Tech Funding News** - RSS: `techfundingnews.com/feed/`

## Database Schema

```sql
CREATE TABLE funding_rounds (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_name        TEXT NOT NULL,
  funding_amount      BIGINT,           -- USD, null if undisclosed
  funding_round       TEXT,             -- Seed, Series A, etc.
  investors           TEXT[],           -- Array, lead investor first
  lead_investor       TEXT,
  product_description TEXT,
  industry            TEXT,
  source_url          TEXT NOT NULL,
  source_name         TEXT,             -- Internal tracking only
  published_at        TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(company_name, published_at::date)
);

-- RLS: Public read, authenticated write
CREATE POLICY "Public read" ON funding_rounds FOR SELECT USING (true);
CREATE POLICY "Admin write" ON funding_rounds FOR ALL USING (auth.role() = 'authenticated');

-- Indexes
CREATE INDEX idx_funding_amount ON funding_rounds(funding_amount DESC);
CREATE INDEX idx_published_at ON funding_rounds(published_at DESC);
CREATE INDEX idx_company_name ON funding_rounds(company_name);
```

## Implementation Steps

### Phase 1: Project Setup
- [ ] Initialize Next.js project with TypeScript
- [ ] Configure Tailwind CSS
- [ ] Set up Supabase project and create database schema
- [ ] Set up Resend account
- [ ] Configure environment variables (Supabase, Resend, Anthropic API keys)

### Phase 2: Scraper API Route
- [ ] Create `/api/scrape` route
- [ ] Implement RSS fetcher for all 5 sources
- [ ] Implement article content extractor (cheerio/readability)
- [ ] Implement Claude extraction prompt (returns structured JSON)
- [ ] Add deduplication logic before saving
- [ ] Add Vercel cron config (`vercel.json`) for daily 6am run

### Phase 3: Web UI
- [ ] Create main page with table component
- [ ] Implement sortable columns (Amount, Date, Company)
- [ ] Implement search (company name + description)
- [ ] Implement filter dropdowns (Round type, Industry)
- [ ] Add click-to-expand for full investor list
- [ ] Add "Load More" pagination
- [ ] Link company names to source articles

### Phase 4: Email Digest
- [ ] Create `/api/send-digest` route
- [ ] Build email template (plain text format)
- [ ] Query today's funding rounds, sorted by amount
- [ ] Send via Resend
- [ ] Trigger after scrape completes (or separate cron)

### Phase 5: Auth & Polish
- [ ] Set up Supabase RLS policies (public read, admin write)
- [ ] Add simple admin auth for manual data edits
- [ ] Add email subscription/unsubscribe flow
- [ ] Deploy to Vercel

## File Structure

```
/app
  /page.tsx              # Main table UI
  /api
    /scrape/route.ts     # Daily scraper
    /send-digest/route.ts # Email sender
/lib
  /supabase.ts           # Supabase client
  /scraper.ts            # RSS fetch + article extraction
  /claude.ts             # Claude extraction logic
  /resend.ts             # Email sending
/components
  /FundingTable.tsx      # Main table component
  /SearchBar.tsx
  /Filters.tsx
vercel.json              # Cron configuration
```

## Claude Extraction Prompt

```
Extract funding information from this article. Return JSON:
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
Exclude public offerings (IPO, SPAC, direct listing, secondary offering) - only include private funding rounds.
Categorize growth rounds as "etc." for the funding_round field.
```

## Web UI - Table View

```
┌──────────────────────────────────────────────────────────────────────────────────────┐
│  Startup Funding Tracker                                              [Search 🔍]    │
├──────────────────────────────────────────────────────────────────────────────────────┤
│  Filters: [All Rounds ▼] [All Industries ▼]                                          │
├────────────┬──────────┬──────────┬─────────────────────┬──────────────────────┬──────┤
│ Company ▼  │ Amount ▼ │ Round    │ Lead Investor       │ Description          │ Date │
├────────────┼──────────┼──────────┼─────────────────────┼──────────────────────┼──────┤
│ Acme AI    │ $50M     │ Series B │ Sequoia             │ AI code review...    │ 1/18 │
├────────────┼──────────┼──────────┼─────────────────────┼──────────────────────┼──────┤
│ HealthFlow │ $25M     │ Series A │ Andreessen Horowitz │ Healthcare billing...│ 1/18 │
└────────────┴──────────┴──────────┴─────────────────────┴──────────────────────┴──────┘
```

- Click column headers to sort
- Click company name → opens source article
- Click lead investor → expands to show all investors
- Search filters by company name OR product description

## Email Digest Format

```
Subject: Funding Digest - Jan 18, 2025 (12 rounds, $847M total)

────────────────────────────────────────────────────

STARTUP FUNDING DIGEST
January 18, 2025

────────────────────────────────────────────────────

$50M   │ Acme AI │ Series B │ Sequoia
         AI-powered code review for enterprises
         → https://techcrunch.com/...

$25M   │ HealthFlow │ Series A │ a16z
         Healthcare billing automation
         → https://forbes.com/...

────────────────────────────────────────────────────

View all: https://your-app.vercel.app

────────────────────────────────────────────────────
```

## Verification Plan
1. **Scraper:** Manually trigger `/api/scrape`, check Supabase for new rows
2. **UI:** Load web page, verify sorting/searching/filtering works
3. **Email:** Trigger `/api/send-digest`, verify email received with correct data
4. **Cron:** Check Vercel logs next day to confirm automatic run

## Environment Variables Needed
```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
DIGEST_EMAIL_TO=
```
