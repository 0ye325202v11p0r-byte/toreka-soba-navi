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

function computeStats(history) {
  const sorted = [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const prices = sorted.map((h) => h.price);
  const last30 = prices.slice(-30);
  const last90 = prices.slice(-90);
  const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const avg30 = avg(last30);
  const avg90 = avg(last90);
  const current = prices[prices.length - 1];
  const pctVsAvg30 = Math.round(((current - avg30) / avg30) * 1000) / 10;
  const pctVsAvg90 = Math.round(((current - avg90) / avg90) * 1000) / 10;
  const low30 = Math.min(...last30);
  const judgment = pctVsAvg30 > 15 ? "割高" : pctVsAvg30 < -15 ? "割安" : "適正";
  const trend = pctVsAvg30 > 3 ? "rising" : pctVsAvg30 < -3 ? "declining" : "flat";
  return {
    current_price: current,
    avg30: Math.round(avg30),
    avg90: Math.round(avg90),
    pct_vs_avg30: pctVsAvg30,
    pct_vs_avg90: pctVsAvg90,
    low30,
    change_amt30: current - low30,
    judgment,
    trend_direction: trend,
  };
}

function buildVerdictText({ currentPrice, avg30, pctVsAvg30, pctVsAvg90, judgment }) {
  const direction = judgment === "割安" ? "下回る" : judgment === "割高" ? "上回る" : "近い";
  const magnitude = Math.abs(pctVsAvg30) > 40 ? "大きく" : Math.abs(pctVsAvg30) > 20 ? "やや" : "";
  const moveVerb = judgment === "割安" ? "下がっています" : judgment === "割高" ? "上がっています" : "推移しています";
  const sameDirection = (pctVsAvg30 >= 0 && pctVsAvg90 >= 0) || (pctVsAvg30 <= 0 && pctVsAvg90 <= 0);
  const trendSentence = sameDirection
    ? `90日平均比でも${pctVsAvg90 > 0 ? "+" : ""}${pctVsAvg90.toFixed(1)}%と同様に${pctVsAvg90 >= 0 ? "プラス" : "マイナス"}方向で推移しており、短期的な一時的な動きというより、ある程度の期間をかけて価格が${judgment === "割高" ? "切り上がって" : judgment === "割安" ? "落ち着いて" : "安定して"}きた可能性があります。`
    : `一方で90日平均比では${pctVsAvg90 > 0 ? "+" : ""}${pctVsAvg90.toFixed(1)}%と逆方向になっており、直近の値動きと中期的なトレンドの方向感が一致していません。短期的な変動の可能性もあるため注意が必要です。`;
  const advice =
    judgment === "割高"
      ? "高値掴みを避けるため、急いで購入せず値動きが落ち着くタイミングも選択肢に入れるとよさそうです。"
      : judgment === "割安"
        ? "店舗仕入れ状況などで短期的に価格が動くこともあるため、購入を検討する際は複数店舗の掲載も確認したうえで判断することをおすすめします。"
        : "目立った過熱・冷え込みは見られず、現時点では急いで判断する必要は薄いと考えられます。";
  const openLine =
    direction === "近い"
      ? `30日平均${Math.round(avg30).toLocaleString("ja-JP")}円に対し現在の店舗掲載価格が${Math.round(currentPrice).toLocaleString("ja-JP")}円（${pctVsAvg30 > 0 ? "+" : ""}${pctVsAvg30.toFixed(1)}%）。平均から大きくは乖離しておらず、比較的落ち着いた値動きです。`
      : `30日平均${Math.round(avg30).toLocaleString("ja-JP")}円に対し現在の店舗掲載価格が${Math.round(currentPrice).toLocaleString("ja-JP")}円（${pctVsAvg30 > 0 ? "+" : ""}${pctVsAvg30.toFixed(1)}%）。平均を${magnitude}${direction}水準まで${moveVerb}。`;
  return `${openLine}${trendSentence}${advice}`;
}

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

async function main() {
  const raw = readFileSync(new URL("./new_candidates.json", import.meta.url), "utf-8").replace(/^﻿/, "");
  const allCandidates = JSON.parse(raw);
  const candidates = allCandidates.slice(START, START + LIMIT);
  log(`starting run: ${candidates.length} candidates (start=${START}, limit=${LIMIT}), total in file=${allCandidates.length}`);

  const { data: existing, error: idErr } = await supabase.from("cards").select("id, card_number, rarity");
  if (idErr) throw idErr;
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
      currentPrice: stats.current_price,
      avg30: stats.avg30,
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
