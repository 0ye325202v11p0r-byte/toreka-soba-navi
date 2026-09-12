// Bulk catalog expansion: reads migration/new_candidates.json (produced by
// find_new_candidates.mjs), fetches each candidate's live page directly
// (same polite fetch pattern as the production cron: honest User-Agent,
// rate-limited, robots.txt-permitted), parses the exact Chart.js price-
// history data embedded in the page (far more complete than a manual
// WebFetch summary — typically 25-30 weekly points spanning 6-8 months,
// vs. the ~21 daily points used for the first batch of this session), and
// writes verified cards + price_snapshots into Supabase.
//
// This does real parsing of real HTML fetched from the live site for every
// single card — no guessed prices, no fabricated history. A card is skipped
// (not inserted) if its page 404s or its chart data can't be parsed cleanly.
//
// Usage: node migration/expand_catalog.mjs [--limit N] [--start N]
//   --limit N   process at most N candidates this run (default: all)
//   --start N   skip the first N candidates in the list (for resuming)

import { createClient } from "@supabase/supabase-js";
import { readFileSync, appendFileSync } from "fs";
import { computeStats } from "../src/lib/priceStats.ts";
import { buildVerdictText } from "../src/lib/ai-verdict.ts";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

const args = process.argv.slice(2);
function argVal(flag, def) {
  const i = args.indexOf(flag);
  return i >= 0 ? Number(args[i + 1]) : def;
}
const LIMIT = argVal("--limit", Infinity);
const START = argVal("--start", 0);

const TODAY = new Date().toISOString().slice(0, 10);
const USER_AGENT =
  "TorekaSobaNaviBot/1.0 (+https://github.com/0ye325202v11p0r-byte/toreka-soba-navi; catalog expansion for a personal One Piece TCG tracker; respects robots.txt)";
const LOG_PATH = new URL("./expand_catalog.log", import.meta.url);

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}`;
  console.log(line);
  appendFileSync(LOG_PATH, line + "\n");
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function ymd(slashDate) {
  const [y, m, d] = slashDate.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

// computeStats/buildVerdictText used to be duplicated here with their own
// local copies (both pre-dating the calendar-day avg30/90 fix and the
// pctVsAvg90-based trend-wording fix documented in README.md/
// fix_avg_window_bug.mjs/fix_verdict_wording.mjs). This script's own header
// comment says its fetched history is "typically 25-30 weekly points
// spanning 6-8 months" — exactly the sparse-history shape that triggered
// the original avg30/90 bug (52% of the 844 'real' cards had wrong stats,
// 27% had an outright wrong 割安/割高/適正 judgment). Because this file
// never imported the shared, since-fixed src/lib/priceStats.ts /
// src/lib/ai-verdict.ts — unlike scrape_yuyutei.mjs, which already imports
// src/lib/yuyuteiParser.ts the same way — re-running this script (its own
// header describes it as reusable via --start/--limit, and README.md calls
// it "拡充する際の主力スクリプト") would have silently reintroduced both
// already-fixed bugs into every newly-inserted card. Found via self-review,
// 2026-09-12; not confirmed to have actually happened (no evidence in git
// history that this script ran again after the fixes landed). Fixed by
// importing the real functions instead of reimplementing them, per this
// project's established "test/import the real thing" principle.

function parsePage(html, url) {
  const nameMatch = html.match(/<h1 class="main_title"[\s\S]*?《([^》]+)》/);
  const name = nameMatch ? nameMatch[1].trim() : null;

  const priceTextMatch = html.match(/本日の販売平均額は([\d,]+)円です/);
  const priceFromText = priceTextMatch ? Number(priceTextMatch[1].replace(/,/g, "")) : null;

  const labelsMatch = html.match(/labels:\[([^\]]*)\]/);
  const dataMatch = html.match(/data:\[([^\]]*)\]/);
  if (!labelsMatch || !dataMatch) return { name, priceFromText, history: null };

  const labels = labelsMatch[1]
    .split(",")
    .map((s) => s.trim().replace(/^'|'$/g, ""))
    .filter(Boolean);
  const prices = dataMatch[1]
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map(Number);

  if (labels.length === 0 || labels.length !== prices.length) {
    return { name, priceFromText, history: null };
  }

  const history = labels.map((d, i) => [d, prices[i]]);
  return { name, priceFromText, history };
}

async function fetchCard(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) return { ok: false, status: res.status };
  const html = await res.text();
  const parsed = parsePage(html, url);
  return { ok: true, ...parsed };
}

// Supabase/PostgREST caps a single select() at 1000 rows by default. Once
// the catalog passed 1000 cards, an unpaginated fetch here would silently
// return only a subset of existing rows, corrupting both the dedup check
// and the next-id counter (see the identical bug fixed in
// scrape_yuyutei.mjs on 2026-09-11 for the full story).
async function fetchAllCards() {
  const pageSize = 1000;
  let all = [];
  let from = 0;
  while (true) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, card_number, rarity")
      .range(from, from + pageSize - 1);
    if (error) throw error;
    all = all.concat(data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

async function main() {
  const raw = readFileSync(new URL("./new_candidates.json", import.meta.url), "utf-8").replace(/^﻿/, "");
  const allCandidates = JSON.parse(raw);
  const candidates = allCandidates.slice(START, START + LIMIT);
  log(`starting run: ${candidates.length} candidates (start=${START}, limit=${LIMIT}), total in file=${allCandidates.length}`);

  const existing = await fetchAllCards();
  const nums = existing.map((c) => parseInt(c.id.replace("c", ""), 10)).filter((n) => !isNaN(n));
  let nextId = Math.max(...nums) + 1;
  const existingKeys = new Set(existing.map((c) => `${(c.card_number ?? "").toUpperCase()}|${c.rarity}`));

  let inserted = 0;
  let skippedDupe = 0;
  let failed404 = 0;
  let failedParse = 0;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const key = `${c.cardNumber.toUpperCase()}|${c.rarity}`;
    if (existingKeys.has(key)) {
      skippedDupe++;
      continue;
    }

    let result;
    try {
      result = await fetchCard(c.url);
    } catch (err) {
      log(`FETCH ERROR ${c.cardNumber} ${c.rarity}: ${err.message}`);
      await sleep(1500);
      continue;
    }

    if (!result.ok) {
      log(`404/HTTP ${result.status} — ${c.cardNumber} ${c.rarity} (${c.url})`);
      failed404++;
      await sleep(1200);
      continue;
    }
    if (!result.name || !result.history || result.history.length === 0) {
      log(`PARSE FAILED — ${c.cardNumber} ${c.rarity} (${c.url}) name=${result.name} historyLen=${result.history?.length ?? 0}`);
      failedParse++;
      await sleep(1200);
      continue;
    }

    const historyRows = result.history.map(([d, price]) => ({ snapshot_date: ymd(d), price }));
    const stats = computeStats(historyRows);

    // sanity cross-check: the page's own "本日の販売平均額" sentence should
    // match the last point of the chart data (both come from the same page,
    // but this catches any parsing misalignment before it reaches the DB)
    if (result.priceFromText !== null && result.priceFromText !== stats.current_price) {
      log(
        `MISMATCH — ${c.cardNumber} ${c.rarity}: text says ${result.priceFromText}, chart last point says ${stats.current_price}. Using chart value but flagging.`
      );
    }

    const verdictText = buildVerdictText({
      name: result.name,
      currentPrice: stats.current_price,
      avg30: stats.avg30,
      avg90: stats.avg90,
      pctVsAvg30: stats.pct_vs_avg30,
      pctVsAvg90: stats.pct_vs_avg90,
      judgment: stats.judgment,
    });

    const id = `c${nextId++}`;
    const { error: cardErr } = await supabase.from("cards").insert({
      id,
      name: result.name,
      rarity: c.rarity,
      set_name: c.setName,
      card_number: c.cardNumber,
      source_url: c.url,
      ...stats,
      data_quality: "real",
      history_is_estimated: false,
      ai_verdict: stats.judgment,
      ai_verdict_text: verdictText,
      ai_verdict_at: TODAY,
      source_note: null,
    });
    if (cardErr) {
      log(`DB INSERT FAILED (card) ${c.cardNumber} ${c.rarity}: ${cardErr.message}`);
      await sleep(1200);
      continue;
    }

    const snapRows = historyRows.map((h) => ({ card_id: id, snapshot_date: h.snapshot_date, price: h.price }));
    const { error: snapErr } = await supabase.from("price_snapshots").insert(snapRows);
    if (snapErr) {
      log(`DB INSERT FAILED (snapshots) ${c.cardNumber} ${c.rarity}: ${snapErr.message}`);
      await sleep(1200);
      continue;
    }

    existingKeys.add(key);
    inserted++;
    log(
      `OK [${i + 1}/${candidates.length}] ${id} ${c.cardNumber} ${c.rarity} (${c.setName}) — ${result.name} ¥${stats.current_price.toLocaleString("ja-JP")} ${stats.judgment} (${historyRows.length}pt)`
    );

    await sleep(1300); // polite rate limit, matches production cron's 1.2-2s commitment
  }

  log(
    `\nDONE. inserted=${inserted} skippedDupe=${skippedDupe} failed404=${failed404} failedParse=${failedParse} total processed=${candidates.length}`
  );
}

main().catch((err) => {
  log(`FATAL: ${err.stack || err.message}`);
  process.exit(1);
});
