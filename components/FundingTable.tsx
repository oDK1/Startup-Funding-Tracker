"use client";

import { useState } from "react";
import type { FundingRound } from "@/lib/types";
import { config } from "@/lib/config";

/**
 * Props for the FundingTable component
 */
interface FundingTableProps {
  /** Array of funding rounds to display */
  data: FundingRound[];
  /** Callback when user clicks a sortable column header */
  onSort: (field: string, direction: "asc" | "desc") => void;
  /** Currently active sort field */
  sortField?: string;
  /** Current sort direction */
  sortDirection?: "asc" | "desc";
}

/**
 * Column configuration
 */
interface ColumnConfig {
  key: keyof FundingRound;
  label: string;
  sortable: boolean;
}

const COLUMNS: ColumnConfig[] = [
  { key: "company_name", label: "Company", sortable: true },
  { key: "funding_amount", label: "Amount", sortable: true },
  { key: "funding_round", label: "Round", sortable: false },
  { key: "lead_investor", label: "Lead Investor", sortable: false },
  { key: "product_description", label: "Description", sortable: false },
  { key: "published_at", label: "Date", sortable: true },
];

/**
 * Format funding amount to human-readable format
 * Examples: $50M, $1.5B, Undisclosed
 */
function formatAmount(amount: number | null): string {
  if (amount === null) return "Undisclosed";
  if (amount >= 1_000_000_000) {
    const billions = amount / 1_000_000_000;
    return `$${billions % 1 === 0 ? billions.toFixed(0) : billions.toFixed(1)}B`;
  }
  if (amount >= 1_000_000) {
    const millions = amount / 1_000_000;
    return `$${millions % 1 === 0 ? millions.toFixed(0) : millions.toFixed(1)}M`;
  }
  return `$${amount.toLocaleString()}`;
}

/**
 * Format date to MMM DD format
 * Example: Jan 18
 */
function formatDate(dateStr: string | null): string {
  if (!dateStr) return "-";
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/**
 * Truncate text with ellipsis if too long
 */
function truncateText(text: string | null, maxLength: number = 50): string {
  if (!text) return "-";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

/**
 * Main funding table component
 *
 * Features:
 * - Sortable columns (Company, Amount, Date)
 * - Click company name to open source article
 * - Click lead investor to expand full investor list
 * - Empty state when no data
 * - Responsive design with horizontal scroll
 */
export default function FundingTable({
  data,
  onSort,
  sortField,
  sortDirection,
}: FundingTableProps) {
  // Track which rows have expanded investor lists
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());

  /**
   * Toggle expanded state for a row's investor list
   */
  const toggleExpanded = (id: string) => {
    setExpandedRows((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /**
   * Handle column header click for sorting
   */
  const handleSort = (column: ColumnConfig) => {
    if (!column.sortable) return;

    const field = column.key;
    let newDirection: "asc" | "desc" = "desc";

    // If already sorting by this field, toggle direction
    if (sortField === field) {
      newDirection = sortDirection === "desc" ? "asc" : "desc";
    }

    onSort(field, newDirection);
  };

  /**
   * Render sort indicator for column header
   */
  const renderSortIndicator = (column: ColumnConfig) => {
    if (!column.sortable) return null;

    const isActive = sortField === column.key;
    const indicator = sortDirection === "asc" ? "▲" : "▼";

    return (
      <span
        className={`ml-1 text-xs ${
          isActive
            ? "text-blue-600 dark:text-blue-400"
            : "text-gray-400 dark:text-gray-500"
        }`}
      >
        {isActive ? indicator : "▼"}
      </span>
    );
  };

  /**
   * Render the investors cell with expand/collapse functionality
   */
  const renderInvestorsCell = (row: FundingRound) => {
    const isExpanded = expandedRows.has(row.id);
    const hasMultipleInvestors = row.investors && row.investors.length > 1;

    if (!row.lead_investor && (!row.investors || row.investors.length === 0)) {
      return <span className="text-gray-400 dark:text-gray-500">-</span>;
    }

    if (isExpanded && row.investors && row.investors.length > 0) {
      return (
        <div className="space-y-1">
          {row.investors.map((investor, index) => (
            <div key={index} className="text-sm">
              {index === 0 && (
                <span className="font-medium text-gray-900 dark:text-white">
                  {investor}
                </span>
              )}
              {index > 0 && (
                <span className="text-gray-600 dark:text-gray-300">
                  {investor}
                </span>
              )}
            </div>
          ))}
          {hasMultipleInvestors && (
            <button
              onClick={() => toggleExpanded(row.id)}
              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
            >
              Show less
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        <span className="text-gray-600 dark:text-gray-300">
          {row.lead_investor || (row.investors && row.investors[0]) || "-"}
        </span>
        {hasMultipleInvestors && (
          <button
            onClick={() => toggleExpanded(row.id)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline whitespace-nowrap"
          >
            +{row.investors.length - 1} more
          </button>
        )}
      </div>
    );
  };

  // Empty state
  if (!data || data.length === 0) {
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
            No funding rounds found
          </h3>
          <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
            Try adjusting your search or filter criteria.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              {COLUMNS.map((column) => (
                <th
                  key={column.key}
                  onClick={() => handleSort(column)}
                  className={`px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider ${
                    column.sortable
                      ? "cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 select-none"
                      : ""
                  }`}
                >
                  <div className="flex items-center">
                    {column.label}
                    {renderSortIndicator(column)}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {data.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {/* Company Name - Links to source (if enabled) */}
                <td className="px-6 py-4 whitespace-nowrap">
                  {config.showSourceLinks ? (
                    <a
                      href={row.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                    >
                      {row.company_name}
                    </a>
                  ) : (
                    <span className="font-medium text-gray-900 dark:text-white">
                      {row.company_name}
                    </span>
                  )}
                </td>

                {/* Funding Amount */}
                <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white font-semibold">
                  {formatAmount(row.funding_amount)}
                </td>

                {/* Funding Round */}
                <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {row.funding_round || "-"}
                </td>

                {/* Lead Investor with expand */}
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300">
                  {renderInvestorsCell(row)}
                </td>

                {/* Description - Truncated */}
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300 max-w-xs">
                  <span title={row.product_description || undefined}>
                    {truncateText(row.product_description, 60)}
                  </span>
                </td>

                {/* Date */}
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                  {formatDate(row.published_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
