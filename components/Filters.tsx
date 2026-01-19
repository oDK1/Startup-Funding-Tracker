"use client";

/**
 * Filter dropdowns component
 *
 * Filters:
 * - Round type (Seed, Series A, Series B, etc.)
 * - Industry
 */

interface FiltersProps {
  roundFilter: string | null;
  industryFilter: string | null;
  onRoundChange: (value: string | null) => void;
  onIndustryChange: (value: string | null) => void;
  rounds: string[];
  industries: string[];
}

export default function Filters({
  roundFilter,
  industryFilter,
  onRoundChange,
  onIndustryChange,
  rounds,
  industries,
}: FiltersProps) {
  const hasActiveFilters = roundFilter !== null || industryFilter !== null;

  const handleRoundChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onRoundChange(value === "" ? null : value);
  };

  const handleIndustryChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    onIndustryChange(value === "" ? null : value);
  };

  const handleClearFilters = () => {
    onRoundChange(null);
    onIndustryChange(null);
  };

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {/* Round filter dropdown */}
      <div className="relative">
        <select
          value={roundFilter ?? ""}
          onChange={handleRoundChange}
          className="appearance-none px-4 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-colors"
          aria-label="Filter by funding round"
        >
          <option value="">All Rounds</option>
          {rounds.map((round) => (
            <option key={round} value={round}>
              {round}
            </option>
          ))}
        </select>
        {/* Dropdown arrow icon */}
        <svg
          className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {/* Industry filter dropdown */}
      <div className="relative">
        <select
          value={industryFilter ?? ""}
          onChange={handleIndustryChange}
          className="appearance-none px-4 py-2 pr-8 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent cursor-pointer transition-colors"
          aria-label="Filter by industry"
        >
          <option value="">All Industries</option>
          {industries.map((industry) => (
            <option key={industry} value={industry}>
              {industry}
            </option>
          ))}
        </select>
        {/* Dropdown arrow icon */}
        <svg
          className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>

      {/* Clear filters button - only show when filters are active */}
      {hasActiveFilters && (
        <button
          type="button"
          onClick={handleClearFilters}
          className="px-3 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1"
          aria-label="Clear all filters"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
          Clear filters
        </button>
      )}
    </div>
  );
}
