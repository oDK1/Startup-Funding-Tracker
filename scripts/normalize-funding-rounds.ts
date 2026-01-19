/**
 * Script to normalize funding round values in the database
 *
 * Maps variations like "Series A1", "Series A-1", "Series A Extension"
 * to standard categories: Pre-Seed, Seed, Series A-L, Etc.
 *
 * Usage: npx tsx scripts/normalize-funding-rounds.ts
 */

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

// Mapping of funding round variations to normalized values
const fundingRoundMapping: Record<string, string> = {
  // Pre-Seed variations
  "pre-seed": "Pre-Seed",
  "pre seed": "Pre-Seed",
  "preseed": "Pre-Seed",
  "pre-seed extension": "Pre-Seed",
  "pre-seed & seed": "Pre-Seed",
  "pre-seed and seed": "Pre-Seed",
  "pre-product": "Pre-Seed",
  "friends and family": "Pre-Seed",

  // Seed variations
  "seed": "Seed",
  "seed+": "Seed",
  "seed plus": "Seed",
  "seed extension": "Seed",
  "seed ii": "Seed",
  "seed 1": "Seed",
  "seed 2": "Seed",
  "seed expansion": "Seed",
  "seed and seed+": "Seed",
  "series seed 2": "Seed",
  "seed and series a": "Seed",
  "seed & series a": "Seed",
  "seed/series a": "Seed",

  // Series A variations
  "series a": "Series A",
  "series a1": "Series A",
  "series a2": "Series A",
  "series a3": "Series A",
  "series a-1": "Series A",
  "series a-2": "Series A",
  "series a-3": "Series A",
  "series a+": "Series A",
  "series a plus": "Series A",
  "series a prime": "Series A",
  "series a extension": "Series A",
  "series aa": "Series A",
  "series a and seed": "Series A",
  "series a and b": "Series A",
  "pre-series a": "Series A",
  "pre-series a-2": "Series A",
  "pre-a": "Series A",

  // Series B variations
  "series b": "Series B",
  "series b1": "Series B",
  "series b2": "Series B",
  "series b3": "Series B",
  "series b-1": "Series B",
  "series b-2": "Series B",
  "series b+": "Series B",
  "series b extension": "Series B",
  "series b-prime": "Series B",
  "b-2": "Series B",
  "b-ext": "Series B",

  // Series C variations
  "series c": "Series C",
  "series c1": "Series C",
  "series c2": "Series C",
  "series c-1": "Series C",
  "series c-2": "Series C",
  "series c+": "Series C",
  "series c extension": "Series C",
  "c-1": "Series C",
  "series c and d": "Series C",
  "series c & d": "Series C",

  // Series D variations
  "series d": "Series D",
  "series d1": "Series D",
  "series d-1": "Series D",
  "series d-2": "Series D",
  "series d and d-1": "Series D",

  // Series E
  "series e": "Series E",

  // Series F variations
  "series f": "Series F",
  "series f-1": "Series F",

  // Series G
  "series g": "Series G",

  // Series H
  "series h": "Series H",

  // Series I
  "series i": "Series I",

  // Series J
  "series j": "Series J",

  // Series L
  "series l": "Series L",

  // Series 3 and 4 (likely late stage)
  "series 3": "Etc.",
  "series 4": "Etc.",

  // Growth/Late Stage -> Etc.
  "growth": "Etc.",
  "growth equity": "Etc.",
  "growth investment": "Etc.",
  "growth capital": "Etc.",
  "growth round": "Etc.",
  "growth financing": "Etc.",
  "growth recapitalization": "Etc.",
  "strategic growth": "Etc.",
  "strategic growth round": "Etc.",
  "early growth": "Etc.",
  "pre-growth": "Etc.",
  "late stage": "Etc.",
  "pre-ipo": "Etc.",

  // Strategic -> Etc.
  "strategic": "Etc.",
  "strategic funding": "Etc.",
  "strategic investment": "Etc.",
  "strategic round": "Etc.",
  "strategic financing": "Etc.",

  // Bridge/Venture/Other -> Etc.
  "bridge": "Etc.",
  "venture": "Etc.",
  "venture debt": "Etc.",
  "equity": "Etc.",
  "equity financing": "Etc.",
  "equity investment": "Etc.",
  "equity round": "Etc.",
  "convertible note": "Etc.",
  "convertible note round 3": "Etc.",
  "safe": "Etc.",
  "debt financing": "Etc.",
  "follow-on investment": "Etc.",
  "initial": "Etc.",
  "first round": "Etc.",
  "preferred round": "Etc.",
  "majority investment": "Etc.",
  "secondary": "Etc.",
  "interim": "Etc.",
  "private placement": "Etc.",
  "private funding": "Etc.",
  "crowdfunding": "Etc.",
  "community round": "Etc.",
  "regulation a+ growth": "Etc.",
  "regulation cf": "Etc.",
};

async function main() {
  console.log("Fetching all funding rounds...\n");

  // Fetch ALL records (paginate past 1000 limit)
  let allData: { id: string; funding_round: string }[] = [];
  let offset = 0;
  const batchSize = 1000;

  while (true) {
    const { data, error } = await supabase
      .from("funding_rounds")
      .select("id, funding_round")
      .not("funding_round", "is", null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error(error);
      return;
    }

    if (!data || data.length === 0) break;
    allData = allData.concat(data as { id: string; funding_round: string }[]);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  console.log(`Total records with funding_round: ${allData.length}\n`);

  // Group records by their normalized value
  const updates: { id: string; original: string; normalized: string }[] = [];
  const unmapped = new Map<string, number>();

  for (const row of allData) {
    const original = row.funding_round;
    const key = original.toLowerCase().trim();
    const normalized = fundingRoundMapping[key];

    if (normalized && normalized !== original) {
      updates.push({ id: row.id, original, normalized });
    } else if (!normalized) {
      unmapped.set(original, (unmapped.get(original) || 0) + 1);
    }
  }

  // Show unmapped values
  if (unmapped.size > 0) {
    console.log("Unmapped funding rounds (will not be changed):");
    console.log("==============================================");
    const sortedUnmapped = [...unmapped.entries()].sort((a, b) => b[1] - a[1]);
    for (const [round, count] of sortedUnmapped) {
      console.log(`${count.toString().padStart(4)} | ${round}`);
    }
    console.log("");
  }

  // Show what will be updated
  const updatesByNormalized = new Map<string, number>();
  for (const u of updates) {
    updatesByNormalized.set(
      u.normalized,
      (updatesByNormalized.get(u.normalized) || 0) + 1
    );
  }

  console.log("Updates to be made:");
  console.log("====================");
  for (const [normalized, count] of [...updatesByNormalized.entries()].sort()) {
    console.log(`${count.toString().padStart(4)} records -> ${normalized}`);
  }
  console.log(`\nTotal records to update: ${updates.length}`);

  // Perform updates in batches
  console.log("\nUpdating records...");
  let updated = 0;
  const updateBatchSize = 100;

  for (let i = 0; i < updates.length; i += updateBatchSize) {
    const batch = updates.slice(i, i + updateBatchSize);

    // Update each record individually (Supabase doesn't support bulk conditional updates)
    for (const { id, normalized } of batch) {
      const { error } = await supabase
        .from("funding_rounds")
        .update({ funding_round: normalized })
        .eq("id", id);

      if (error) {
        console.error(`Error updating ${id}:`, error);
        continue;
      }
      updated++;
    }

    console.log(`Updated ${updated}/${updates.length} records...`);
  }

  console.log(`\nDone! Updated ${updated} records.`);

  // Show final counts
  console.log("\nFetching final funding round distribution...\n");

  let finalData: { funding_round: string }[] = [];
  offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("funding_rounds")
      .select("funding_round")
      .not("funding_round", "is", null)
      .range(offset, offset + batchSize - 1);

    if (error) {
      console.error(error);
      return;
    }

    if (!data || data.length === 0) break;
    finalData = finalData.concat(data as { funding_round: string }[]);
    if (data.length < batchSize) break;
    offset += batchSize;
  }

  const finalCounts = new Map<string, number>();
  for (const row of finalData) {
    const round = row.funding_round;
    finalCounts.set(round, (finalCounts.get(round) || 0) + 1);
  }

  console.log("Final funding round distribution:");
  console.log("==================================");
  const sortedFinal = [...finalCounts.entries()].sort((a, b) => b[1] - a[1]);
  for (const [round, count] of sortedFinal) {
    console.log(`${count.toString().padStart(4)} | ${round}`);
  }
  console.log(`\nTotal unique funding rounds: ${sortedFinal.length}`);
}

main().catch(console.error);
