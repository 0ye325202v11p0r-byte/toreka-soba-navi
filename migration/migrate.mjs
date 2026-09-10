// One-time migration: Claude Artifact DB export -> Supabase
//
// Usage:
//   1. Create the Supabase project and run supabase/schema.sql in the SQL editor.
//   2. Set env vars (do NOT commit these):
//        SUPABASE_URL=https://xxxx.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...   (service role key, bypasses RLS -- keep secret)
//   3. node migration/migrate.mjs
//
// This script only needs to run once (plus again any time you want to re-seed).

import { createClient } from "@supabase/supabase-js";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CARDS_DIR = path.join(__dirname, "cards_export", "cards");

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY environment variables. See the comment at the top of this file."
  );
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

// history90[i] corresponds to (TODAY - (89 - i)) days, i.e. the array's last
// element is TODAY. This must match the TODAY constant used when the
// Artifact-side data was generated (build_real_history.py).
const TODAY = new Date("2026-09-10T00:00:00Z");

function dataQualityFromSourceNote(note) {
  if (!note) return "flat";
  if (note.includes("スナップショット")) return "real";
  if (note.includes("ランキング")) return "partial";
  return "flat";
}

function dateForHistoryIndex(index, length) {
  const offsetDays = length - 1 - index;
  const d = new Date(TODAY);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const files = readdirSync(CARDS_DIR).filter((f) => f.endsWith(".json"));
  console.log(`found ${files.length} card files`);

  const cardRows = [];
  const snapshotRows = [];

  for (const file of files) {
    const id = file.replace(/\.json$/, "");
    const raw = JSON.parse(readFileSync(path.join(CARDS_DIR, file), "utf-8"));

    cardRows.push({
      id,
      name: raw.name,
      rarity: raw.rarity,
      set_name: raw.setName ?? null,
      card_number: raw.cardNumber ?? null,
      source_url: raw.sourceUrl ?? null,
      current_price: raw.currentPrice ?? null,
      avg30: raw.avg30 ?? null,
      avg90: raw.avg90 ?? null,
      pct_vs_avg30: raw.pctVsAvg30 ?? null,
      pct_vs_avg90: raw.pctVsAvg90 ?? null,
      low30: raw.low30 ?? null,
      change_amt30: raw.changeAmt30 ?? null,
      judgment: raw.judgment ?? null,
      trend_direction: raw.trendDirection ?? null,
      data_quality: dataQualityFromSourceNote(raw.sourceNote),
      history_is_estimated: raw.historyIsEstimated ?? true,
      ai_verdict: raw.aiVerdict ?? null,
      ai_verdict_text: raw.aiVerdictText ?? null,
      ai_verdict_at: raw.aiVerdictAt ?? null,
      source_note: raw.sourceNote ?? null,
      updated_at: raw.updatedAt ? `${raw.updatedAt}T00:00:00Z` : new Date().toISOString(),
    });

    if (Array.isArray(raw.history90)) {
      raw.history90.forEach((price, i) => {
        if (price === null || price === undefined) return;
        snapshotRows.push({
          card_id: id,
          snapshot_date: dateForHistoryIndex(i, raw.history90.length),
          price,
        });
      });
    }
  }

  console.log(`upserting ${cardRows.length} cards...`);
  for (let i = 0; i < cardRows.length; i += 200) {
    const batch = cardRows.slice(i, i + 200);
    const { error } = await supabase.from("cards").upsert(batch, { onConflict: "id" });
    if (error) throw error;
    console.log(`  cards ${i + batch.length}/${cardRows.length}`);
  }

  console.log(`upserting ${snapshotRows.length} price snapshots...`);
  for (let i = 0; i < snapshotRows.length; i += 500) {
    const batch = snapshotRows.slice(i, i + 500);
    const { error } = await supabase
      .from("price_snapshots")
      .upsert(batch, { onConflict: "card_id,snapshot_date" });
    if (error) throw error;
    console.log(`  snapshots ${i + batch.length}/${snapshotRows.length}`);
  }

  console.log("done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
