// One-time backfill: recompute avg30/avg90/pct_vs_avg30/pct_vs_avg90/low30/
// change_amt30/judgment/trend_direction/ai_verdict/ai_verdict_text for every
// data_quality='real' card, using the corrected calendar-date-based
// computeStats() in src/lib/priceStats.ts.
//
// Why this is needed: the previous computeStats() (in
// src/app/api/cron/refresh-prices/route.ts, now replaced) took "the last 30
// price_snapshots ROWS" as a stand-in for "the last 30 DAYS". That's only
// correct for cards with a true daily snapshot cadence. Cards whose history
// was bulk-imported at ~2-week intervals (common for cards added outside the
// original 379-card migration — see add_worlds_strongest_warriors.mjs /
// expand_catalog.mjs) have far fewer than 30 rows, so the "last 30 rows"
// window silently spanned months or years of history while still being
// labeled "30日平均比" and used to derive the 割安/割高 judgment. Confirmed
// via audit: 467 of 844 (55%) data_quality='real' cards have fewer than 30
// price_snapshots rows.
//
// Run: node --experimental-strip-types migration/fix_avg_window_bug.mjs [--apply]
// Without --apply, this only prints what WOULD change (dry run).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { computeStats } from "../src/lib/priceStats.ts";

const env = Object.fromEntries(
  readFileSync(new URL("../.env.local", import.meta.url), "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const APPLY = process.argv.includes("--apply");

const { data: cards, error: cardsErr } = await supabase
  .from("cards")
  .select("id, name, avg30, avg90, pct_vs_avg30, pct_vs_avg90, judgment, current_price")
  .eq("data_quality", "real")
  .order("id");
if (cardsErr) throw cardsErr;
console.log(`checking ${cards.length} data_quality='real' cards (dry run: ${!APPLY})`);

let changed = 0;
let judgmentChanged = 0;
let unchanged = 0;
let skippedNoHistory = 0;

for (const card of cards) {
  const { data: history, error: histErr } = await supabase
    .from("price_snapshots")
    .select("snapshot_date, price")
    .eq("card_id", card.id)
    .order("snapshot_date", { ascending: false })
    .limit(1000);
  if (histErr) throw histErr;
  if (!history || history.length === 0) {
    skippedNoHistory++;
    continue;
  }

  const stats = computeStats(history);

  const meaningfullyDifferent =
    stats.avg30 !== card.avg30 ||
    stats.avg90 !== card.avg90 ||
    Math.abs(stats.pct_vs_avg30 - card.pct_vs_avg30) > 0.05 ||
    stats.judgment !== card.judgment;

  if (!meaningfullyDifferent) {
    unchanged++;
    continue;
  }

  changed++;
  if (stats.judgment !== card.judgment) judgmentChanged++;
  console.log(
    `${card.id} ${card.name}: avg30 ${card.avg30}->${stats.avg30}, pct30 ${card.pct_vs_avg30}%->${stats.pct_vs_avg30}%, judgment ${card.judgment}->${stats.judgment}`
  );

  if (APPLY) {
    const today = new Date().toISOString().slice(0, 10);
    const { buildVerdictText } = await import("../src/lib/ai-verdict.ts");
    const verdictText = buildVerdictText({
      name: card.name,
      currentPrice: stats.current_price,
      avg30: stats.avg30,
      avg90: stats.avg90,
      pctVsAvg30: stats.pct_vs_avg30,
      pctVsAvg90: stats.pct_vs_avg90,
      judgment: stats.judgment,
    });
    const { error: updErr } = await supabase
      .from("cards")
      .update({
        avg30: stats.avg30,
        avg90: stats.avg90,
        pct_vs_avg30: stats.pct_vs_avg30,
        pct_vs_avg90: stats.pct_vs_avg90,
        low30: stats.low30,
        change_amt30: stats.change_amt30,
        judgment: stats.judgment,
        trend_direction: stats.trend_direction,
        ai_verdict: stats.judgment,
        ai_verdict_text: verdictText,
        ai_verdict_at: today,
        // current_price / updated_at intentionally left untouched — this is
        // a stats recomputation from existing history, not a fresh price
        // fetch.
      })
      .eq("id", card.id);
    if (updErr) throw updErr;
  }
}

console.log(
  `\ndone. changed: ${changed} (judgment changed: ${judgmentChanged}), unchanged: ${unchanged}, skipped (no history): ${skippedNoHistory}`
);
if (!APPLY) console.log("dry run only — re-run with --apply to write changes");
