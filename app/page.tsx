"use client";

import { useState, useMemo, useCallback, useEffect } from "react";
import FundingTable from "@/components/FundingTable";
import SearchBar from "@/components/SearchBar";
import Filters from "@/components/Filters";
import { getFundingRounds } from "@/lib/supabase";
import type { FundingRound } from "@/lib/types";

/** Number of items to load per page */
const PAGE_SIZE = 20;

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

/**
 * Extract unique values from data for filter dropdowns
 */
function extractUniqueValues(data: FundingRound[]) {
  const rounds = new Set<string>();
  const industries = new Set<string>();

  data.forEach((item) => {
    if (item.funding_round) rounds.add(item.funding_round);
    if (item.industry) industries.add(item.industry);
  });

  return {
    rounds: Array.from(rounds).sort(),
    industries: Array.from(industries).sort(),
  };
}

/**
 * Loading skeleton component for the table
 */
function TableSkeleton() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden animate-pulse">
      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {["Company", "Amount", "Round", "Lead Investor", "Description", "Date"].map(
                (header) => (
                  <th
                    key={header}
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider"
                  >
                    {header}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {[...Array(5)].map((_, i) => (
              <tr key={i}>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-24"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-16"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-32"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-48"></div>
                </td>
                <td className="px-6 py-4">
                  <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-12"></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Error message component
 */
function ErrorMessage({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="px-6 py-16 text-center">
        <svg
          className="mx-auto h-12 w-12 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
          Failed to load funding rounds
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">{message}</p>
        <button
          onClick={onRetry}
          className="mt-4 inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

/**
 * Empty state component for when there's no data
 */
function EmptyState() {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="px-6 py-16 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
          />
        </svg>
        <h3 className="mt-4 text-lg font-medium text-gray-900 dark:text-white">
          No funding rounds yet
        </h3>
        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
          Funding data will appear here once the scraper runs.
        </p>
      </div>
    </div>
  );
}

export default function Home() {
  // Data state
  const [allData, setAllData] = useState<FundingRound[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  // UI state
  const [sortField, setSortField] = useState<string>("published_at");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [searchQuery, setSearchQuery] = useState("");
  const [roundFilter, setRoundFilter] = useState<string | null>(null);
  const [industryFilter, setIndustryFilter] = useState<string | null>(null);

  /**
   * Fetch initial data from Supabase
   */
  const fetchInitialData = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const data = await getFundingRounds({
        limit: PAGE_SIZE,
        offset: 0,
        orderBy: "published_at",
        ascending: false,
      });

      setAllData(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (err) {
      console.error("Error fetching funding rounds:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while loading data."
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  /**
   * Load more data (pagination)
   */
  const loadMore = useCallback(async () => {
    if (isLoadingMore || !hasMore) return;

    setIsLoadingMore(true);

    try {
      const data = await getFundingRounds({
        limit: PAGE_SIZE,
        offset: allData.length,
        orderBy: "published_at",
        ascending: false,
      });

      if (data.length === 0) {
        setHasMore(false);
      } else {
        setAllData((prev) => [...prev, ...data]);
        setHasMore(data.length === PAGE_SIZE);
      }
    } catch (err) {
      console.error("Error loading more funding rounds:", err);
      // Don't set error state - just log it and let user try again
    } finally {
      setIsLoadingMore(false);
    }
  }, [allData.length, hasMore, isLoadingMore]);

  // Fetch data on mount
  useEffect(() => {
    fetchInitialData();
  }, [fetchInitialData]);

  // Extract unique filter options from loaded data
  const filterOptions = useMemo(() => extractUniqueValues(allData), [allData]);

  // Apply filters and sorting to data
  const displayData = useMemo(() => {
    const filtered = filterData(allData, searchQuery, roundFilter, industryFilter);
    return sortData(filtered, sortField, sortDirection);
  }, [allData, searchQuery, roundFilter, industryFilter, sortField, sortDirection]);

  // Handle sort change from table
  const handleSort = useCallback((field: string, direction: "asc" | "desc") => {
    setSortField(field);
    setSortDirection(direction);
  }, []);

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

  // Render loading state
  if (isLoading) {
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
            <div className="flex-1 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            <div className="flex gap-2">
              <div className="w-32 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
              <div className="w-36 h-10 bg-gray-200 dark:bg-gray-700 rounded-lg animate-pulse"></div>
            </div>
          </div>

          <div className="mb-4 h-5 w-48 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>

          <TableSkeleton />
        </main>
      </div>
    );
  }

  // Render error state
  if (error) {
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

          <ErrorMessage message={error} onRetry={fetchInitialData} />
        </main>
      </div>
    );
  }

  // Render empty state (no data in database yet)
  if (allData.length === 0) {
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

          <EmptyState />
        </main>
      </div>
    );
  }

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
            rounds={filterOptions.rounds}
            industries={filterOptions.industries}
          />
        </div>

        {/* Results count */}
        <div className="mb-4 text-sm text-gray-600 dark:text-gray-400">
          {displayData.length === allData.length
            ? `Showing all ${displayData.length} funding rounds`
            : `Showing ${displayData.length} of ${allData.length} funding rounds`}
        </div>

        <FundingTable
          data={displayData}
          onSort={handleSort}
          sortField={sortField}
          sortDirection={sortDirection}
        />

        {/* Load More button */}
        {hasMore && displayData.length === allData.length && (
          <div className="mt-6 flex justify-center">
            <button
              onClick={loadMore}
              disabled={isLoadingMore}
              className="inline-flex items-center px-6 py-3 border border-gray-300 dark:border-gray-600 text-sm font-medium rounded-lg text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoadingMore ? (
                <>
                  <svg
                    className="animate-spin -ml-1 mr-2 h-4 w-4 text-gray-600 dark:text-gray-300"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    ></circle>
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Loading...
                </>
              ) : (
                "Load More"
              )}
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
