"use client";

/**
 * Filter dropdowns component
 *
 * Filters:
 * - Round type (Seed, Series A, Series B, etc.)
 * - Industry
 */

import { useState } from "react";

const ROUND_OPTIONS = [
  "All Rounds",
  "Pre-Seed",
  "Seed",
  "Series A",
  "Series B",
  "Series C",
  "Series D+",
  "Unknown",
];

const INDUSTRY_OPTIONS = [
  "All Industries",
  "AI/ML",
  "Fintech",
  "Healthcare",
  "SaaS",
  "E-commerce",
  "Climate",
  "Other",
];

export default function Filters() {
  const [selectedRound, setSelectedRound] = useState("All Rounds");
  const [selectedIndustry, setSelectedIndustry] = useState("All Industries");

  // TODO: Implement filter functionality
  // - Update table results based on selection
  // - Use URL params for shareable filter state

  return (
    <div className="flex gap-2">
      <select
        value={selectedRound}
        onChange={(e) => setSelectedRound(e.target.value)}
        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {ROUND_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>

      <select
        value={selectedIndustry}
        onChange={(e) => setSelectedIndustry(e.target.value)}
        className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      >
        {INDUSTRY_OPTIONS.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}
