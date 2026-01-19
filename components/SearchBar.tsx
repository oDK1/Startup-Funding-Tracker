"use client";

/**
 * Search bar component
 *
 * Searches by company name and product description
 */

import { useState } from "react";

export default function SearchBar() {
  const [query, setQuery] = useState("");

  // TODO: Implement search functionality
  // - Debounce input
  // - Filter table results by company name OR product description
  // - Use URL params for shareable search state

  return (
    <div className="relative flex-1">
      <input
        type="text"
        placeholder="Search companies or descriptions..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="w-full px-4 py-2 pl-10 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <svg
        className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    </div>
  );
}
