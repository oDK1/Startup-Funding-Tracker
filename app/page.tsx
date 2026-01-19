import FundingTable from "@/components/FundingTable";
import SearchBar from "@/components/SearchBar";
import Filters from "@/components/Filters";

export default function Home() {
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
          <SearchBar />
          <Filters />
        </div>

        <FundingTable />
      </main>
    </div>
  );
}
