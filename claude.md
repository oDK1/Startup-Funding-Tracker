# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Next.js app that scrapes tech RSS feeds daily, uses Claude AI to extract startup funding announcements, stores them in Supabase, and displays them in a searchable table. Automated via GitHub Actions (not Vercel cron — `vercel.json` has an empty crons array).

## Commands

```bash
npm run dev      # Start local dev server
npm run build    # Production build
npm run lint     # ESLint
```

No tests are configured. Manual verification is done by hitting the API endpoints directly.

## Architecture

### Data Flow

```
GitHub Actions (daily 14:00 UTC)
  → GET /api/scrape        (RSS feeds → Claude extraction → Supabase)
  → GET /api/scrape-vcnews (VCNewsDaily web scraping → Supabase)
```

The main scrape pipeline in `/api/scrape/route.ts`:
1. Fetch 9 RSS feeds in parallel (`lib/scraper.ts`)
2. For each item, check deduplication (3 levels: URL, company+date, company+amount+round)
3. Extract full article HTML via cheerio (`extractArticleContent`)
4. Send to Claude 3.5 Haiku for structured JSON extraction (`lib/claude.ts`)
5. Insert into Supabase `funding_rounds` table (`lib/supabase.ts`)

### Key Design Decisions

**Two Supabase clients**: `supabase` (anon key, respects RLS) for frontend; `supabaseAdmin` (service role, bypasses RLS) for API routes. Use `getSupabaseAdmin()` in any write path.

**Three-layer deduplication** (in order):
1. In-batch URL deduplication (Set)
2. Database check by source URL (`fundingRoundExistsByUrl`)
3. Database check by company+date (`fundingRoundExists`) and company+amount+round (`fundingRoundExistsByDetails`)

**Claude extraction returns `null`** for non-funding articles. The prompt is strict — only primary-focus funding announcements pass (not product launches that mention funding, not cumulative funding totals, not private placements).

**`scrape_progress` table** tracks VCNewsDaily batch scraping by month/year with `pending|in_progress|completed|failed` status.

### File Map

| File | Purpose |
|------|---------|
| `lib/types.ts` | All shared TypeScript interfaces (`FundingRound`, `ExtractedFunding`, `RSSItem`, `ScrapeProgress`) |
| `lib/scraper.ts` | RSS feed fetching + cheerio article extraction |
| `lib/claude.ts` | Claude 3.5 Haiku integration, extraction prompt, response parsing |
| `lib/supabase.ts` | Both Supabase clients, all DB operations, deduplication helpers, `normalizeCompanyName` |
| `lib/config.ts` | Feature flags (`showSourceLinks` from `NEXT_PUBLIC_SHOW_SOURCE_LINKS`) |
| `lib/resend.ts` | Email sending via Resend |
| `app/api/scrape/route.ts` | Main daily scraper endpoint |
| `app/api/scrape-vcnews/route.ts` | VCNewsDaily single-month scraper |
| `app/api/scrape-vcnews-batch/route.ts` | VCNewsDaily multi-month batch scraper |
| `app/api/scrape-historical/route.ts` | Historical data backfill |
| `app/api/send-digest/route.ts` | Email digest sender (currently disabled in cron) |
| `app/page.tsx` | Main UI with table, search, filters |
| `.github/workflows/scrape.yml` | GitHub Actions cron job (runs daily at 14:00 UTC) |

### Authorization

API routes check for `CRON_SECRET` env var. If unset, all requests are allowed (dev mode). Production requests from GitHub Actions pass `Authorization: Bearer $CRON_SECRET`.

## Environment Variables

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
ANTHROPIC_API_KEY=
RESEND_API_KEY=
DIGEST_EMAIL_TO=
NEXT_PUBLIC_SHOW_SOURCE_LINKS=true   # false hides source article links
CRON_SECRET=                          # If unset, auth is disabled
```

## Database Schema (Supabase)

```sql
-- Main table
funding_rounds (
  id UUID PK, company_name TEXT NOT NULL, funding_amount BIGINT,
  funding_round TEXT, investors TEXT[], lead_investor TEXT,
  product_description TEXT, industry TEXT, source_url TEXT NOT NULL,
  source_name TEXT, published_at TIMESTAMPTZ, created_at TIMESTAMPTZ,
  UNIQUE(company_name, published_at::date)
)

-- Batch scraping progress
scrape_progress (
  id UUID PK, source TEXT, month INT, year INT,
  status TEXT, articles_found INT, articles_saved INT,
  error_message TEXT, started_at TIMESTAMPTZ, completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ, UNIQUE(source, month, year)
)
```

RLS: Public read on `funding_rounds`. All writes use the service role key.

## Triggering Scrapers Manually

```bash
# RSS scraper (no auth in dev)
curl http://localhost:3000/api/scrape

# VCNewsDaily for a specific month
curl "http://localhost:3000/api/scrape-vcnews?month=1&year=2025"

# Production with auth
curl -H "Authorization: Bearer $CRON_SECRET" https://startup-funding-tracker.vercel.app/api/scrape
```

The email digest is intentionally disabled in the GitHub Actions workflow (commented out). To re-enable, uncomment the digest step in `.github/workflows/scrape.yml`.
