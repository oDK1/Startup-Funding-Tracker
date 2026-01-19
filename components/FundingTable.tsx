"use client";

/**
 * Main funding table component
 *
 * Features:
 * - Sortable columns (Amount, Date, Company)
 * - Click company name to open source article
 * - Click lead investor to expand full investor list
 * - Load more pagination
 */

export default function FundingTable() {
  // TODO: Implement table with:
  // - Fetch data from Supabase
  // - Column sorting
  // - Pagination
  // - Expandable investor list

  // Placeholder data for UI development
  const placeholderData = [
    {
      id: "1",
      company_name: "Acme AI",
      funding_amount: 50_000_000,
      funding_round: "Series B",
      lead_investor: "Sequoia",
      product_description: "AI-powered code review for enterprises",
      published_at: "2025-01-18",
      source_url: "https://example.com/article-1",
    },
    {
      id: "2",
      company_name: "HealthFlow",
      funding_amount: 25_000_000,
      funding_round: "Series A",
      lead_investor: "Andreessen Horowitz",
      product_description: "Healthcare billing automation platform",
      published_at: "2025-01-18",
      source_url: "https://example.com/article-2",
    },
  ];

  const formatAmount = (amount: number | null) => {
    if (amount === null) return "Undisclosed";
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(0)}M`;
    return `$${amount.toLocaleString()}`;
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
          <thead className="bg-gray-50 dark:bg-gray-900">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">
                Company
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Round
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Lead Investor
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Description
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800">
                Date
              </th>
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
            {placeholderData.map((row) => (
              <tr
                key={row.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                <td className="px-6 py-4 whitespace-nowrap">
                  <a
                    href={row.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
                  >
                    {row.company_name}
                  </a>
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-900 dark:text-white font-semibold">
                  {formatAmount(row.funding_amount)}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {row.funding_round}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-600 dark:text-gray-300">
                  {row.lead_investor}
                </td>
                <td className="px-6 py-4 text-gray-600 dark:text-gray-300 max-w-xs truncate">
                  {row.product_description}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-gray-500 dark:text-gray-400">
                  {formatDate(row.published_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
        <button className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
          Load More
        </button>
      </div>
    </div>
  );
}
