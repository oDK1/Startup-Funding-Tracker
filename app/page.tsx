"use client";

import { useState, useMemo, useCallback } from "react";
import FundingTable from "@/components/FundingTable";
import SearchBar from "@/components/SearchBar";
import Filters from "@/components/Filters";
import type { FundingRound } from "@/lib/types";

// Placeholder data for development until Supabase is connected
const PLACEHOLDER_DATA: FundingRound[] = [
  {
    id: "1",
    company_name: "Acme AI",
    funding_amount: 50_000_000,
    funding_round: "Series B",
    investors: ["Sequoia", "Andreessen Horowitz", "Y Combinator"],
    lead_investor: "Sequoia",
    product_description: "AI-powered code review for enterprises",
    industry: "AI/ML",
    source_url: "https://techcrunch.com/example-1",
    source_name: "TechCrunch",
    published_at: "2025-01-18T10:00:00Z",
    created_at: "2025-01-18T10:00:00Z",
  },
  {
    id: "2",
    company_name: "HealthFlow",
    funding_amount: 25_000_000,
    funding_round: "Series A",
    investors: ["Andreessen Horowitz", "General Catalyst", "Khosla Ventures"],
    lead_investor: "Andreessen Horowitz",
    product_description:
      "Healthcare billing automation platform that streamlines medical claims processing",
    industry: "Healthcare",
    source_url: "https://forbes.com/example-2",
    source_name: "Forbes",
    published_at: "2025-01-18T08:00:00Z",
    created_at: "2025-01-18T08:00:00Z",
  },
  {
    id: "3",
    company_name: "GreenTech Solutions",
    funding_amount: 1_500_000_000,
    funding_round: "Series D",
    investors: ["SoftBank Vision Fund", "Tiger Global"],
    lead_investor: "SoftBank Vision Fund",
    product_description: "Renewable energy infrastructure platform",
    industry: "CleanTech",
    source_url: "https://bloomberg.com/example-3",
    source_name: "Bloomberg",
    published_at: "2025-01-17T14:00:00Z",
    created_at: "2025-01-17T14:00:00Z",
  },
  {
    id: "4",
    company_name: "FinanceBot",
    funding_amount: null,
    funding_round: "Seed",
    investors: ["Accel"],
    lead_investor: "Accel",
    product_description: "AI financial advisor chatbot for retail investors",
    industry: "FinTech",
    source_url: "https://crunchbase.com/example-4",
    source_name: "Crunchbase News",
    published_at: "2025-01-17T12:00:00Z",
    created_at: "2025-01-17T12:00:00Z",
  },
  {
    id: "5",
    company_name: "DataVault",
    funding_amount: 75_000_000,
    funding_round: "Series C",
    investors: ["Insight Partners", "Index Ventures", "Greylock", "Benchmark"],
    lead_investor: "Insight Partners",
    product_description: "Enterprise data security and compliance platform",
    industry: "Security",
    source_url: "https://techfundingnews.com/example-5",
    source_name: "Tech Funding News",
    published_at: "2025-01-16T16:00:00Z",
    created_at: "2025-01-16T16:00:00Z",
  },
];

// Available filter options
const ROUND_OPTIONS = [
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D",
  "Series D+",
];

const INDUSTRY_OPTIONS = [
  "AI/ML",
  "FinTech",
  "Healthcare",
  "CleanTech",
  "Security",
  "SaaS",
  "E-commerce",
  "Other",
];

/**
 * Sort funding rounds by field and direction
 */
function sortData(
  items: FundingRound[],
  field: string,
  direction: "asc" | "desc"
): FundingRound[] {
  return [...items].sort((a, b) => {
    let aValue: string | number | null = null;
    let bValue: string | number | null = null;

    switch (field) {
      case "company_name":
        aValue = a.company_name.toLowerCase();
        bValue = b.company_name.toLowerCase();
        break;
      case "funding_amount":
        aValue = a.funding_amount ?? -1; // null values go to end
        bValue = b.funding_amount ?? -1;
        break;
      case "published_at":
        aValue = a.published_at ? new Date(a.published_at).getTime() : 0;
        bValue = b.published_at ? new Date(b.published_at).getTime() : 0;
        break;
      default:
        return 0;
    }

    if (aValue < bValue) return direction === "asc" ? -1 : 1;
    if (aValue > bValue) return direction === "asc" ? 1 : -1;
    return 0;
  });
}

/**
 * Filter funding rounds by search query and filters
 */
function filterData(
  items: FundingRound[],
  searchQuery: string,
  roundFilter: string | null,
  industryFilter: string | null
): FundingRound[] {
  return items.filter((item) => {
    // Search filter - matches company name or product description
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchesCompany = item.company_name.toLowerCase().includes(query);
      const matchesDescription = item.product_description
        ?.toLowerCase()
        .includes(query);
      if (!matchesCompany && !matchesDescription) {
        return false;
      }
    }

    // Round filter
    if (roundFilter && item.funding_round !== roundFilter) {
      return false;
    }

    // Industry filter
    if (industryFilter && item.industry !== industryFilter) {
      return false;
    }

    return true;
  });
}

export default function Home() {
  const [sortField, setSortField] = useState<string>("published_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [roundFilter, setRoundFilter] = useState<string | null>(null);
  const [industryFilter, setIndustryFilter] = useState<string | null>(null);

  // TODO: Replace with Supabase fetch
  // For now, use placeholder data and compute filtered + sorted data
  const data = useMemo(() => {
    const filtered = filterData(
      PLACEHOLDER_DATA,
      searchQuery,
      roundFilter,
      industryFilter
    );
    return sortData(filtered, sortField, sortDirection);
  }, [searchQuery, roundFilter, industryFilter, sortField, sortDirection]);

  // Handle sort change from table
  const handleSort = useCallback(
    (field: string, direction: "asc" | "desc") => {
      setSortField(field);
      setSortDirection(direction);
    },
    []
  );

  // Handle search change (debounced from SearchBar)
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  // Handle filter changes
  const handleRoundChange = useCallback((value: string | null) => {
    setRoundFilter(value);
  }, []);

  const handleIndustryChange = useCallback((value: string | null) => {
    setIndustryFilter(value);
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="container mx-auto px-4 py-8">
        <header className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Startup Funding Tracker
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Track the latest startup funding rounds from top tech media sources
          </p>
        </header>

        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <SearchBar
            value={searchQuery}
            onChange={handleSearchChange}
            placeholder="Search companies or descriptions..."
          />
          <Filters
            roundFilter={roundFilter}
            industryFilter={industryFilter}
            onRoundChange={handleRoundChange}
            onIndustryChange={handleIndustryChange}
            rounds={ROUND_OPTIONS}
            industries={INDUSTRY_OPTIONS}
          />
        </div>

        {/* Results count */}
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {data.length === PLACEHOLDER_DATA.length
            ? `Showing all ${data.length} funding rounds`
            : `Showing ${data.length} of ${PLACEHOLDER_DATA.length} funding rounds`}
        </div>

        <FundingTable
          data={data}
          onSort={handleSort}
          sortField={sortField}
          sortDirection={sortDirection}
        />
      </main>
    </div>
  );
}
