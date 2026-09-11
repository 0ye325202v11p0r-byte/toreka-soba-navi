// One-time backfill: regenerate ai_verdict_text for every data_quality='real'
// card using the corrected buildVerdictText() in src/lib/ai-verdict.ts.
//
// Why: the 90-day trend sentence used to pick its verb (切り上がって/
// 落ち着いて/安定して) from the 30-day-based `judgment`, not from
// pctVsAvg90's own magnitude. A card can be judgment='適正' (30-day change
// under the ±15% threshold) while pctVsAvg90 is e.g. +44.7% — the old text
// said "価格が安定してきた可能性があります" (has stabilized) right next to
// a number showing a real 90-day rise. Numbers themselves were never wrong;
// only the generated commentary's word choice was. This regenerates that
// text from each card's current (already-correct, post
// fix_avg_window_bug.mjs) stored stats — no price refetch, no other column
// touched.
//
// Run: node --experimental-strip-types migration/fix_verdict_wording.mjs [--apply]
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { buildVerdictText } from "../src/lib/ai-verdict.ts";

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

const { data: cards, error } = await supabase
  .from("cards")
  .select("id, name, current_price, avg30, avg90, pct_vs_avg30, pct_vs_avg90, judgment, ai_verdict_text")
  .eq("data_quality", "real")
  .order("id");
if (error) throw error;
console.log(`checking ${cards.length} data_quality='real' cards (dry run: ${!APPLY})`);

let changed = 0;
for (const card of cards) {
  const newText = buildVerdictText({
    name: card.name,
    currentPrice: card.current_price,
    avg30: card.avg30,
    avg90: card.avg90,
    pctVsAvg30: card.pct_vs_avg30,
    pctVsAvg90: card.pct_vs_avg90,
    judgment: card.judgment,
  });
  if (newText === card.ai_verdict_text) continue;

  changed++;
  console.log(`\n${card.id} ${card.name}:\n  old: ${card.ai_verdict_text}\n  new: ${newText}`);

  if (APPLY) {
    const { error: updErr } = await supabase
      .from("cards")
      .update({ ai_verdict_text: newText })
      .eq("id", card.id);
    if (updErr) throw updErr;
  }
}

console.log(`\ndone. changed: ${changed} / ${cards.length}`);
if (!APPLY) console.log("dry run only — re-run with --apply to write changes");
