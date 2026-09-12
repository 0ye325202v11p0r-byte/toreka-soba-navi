import { NextResponse } from "next/server";
import { computeStats } from "@/lib/priceStats";
import { buildVerdictText } from "@/lib/ai-verdict";
import { parseSetPage, ALL_YUYUTEI_SETS, YUYUTEI_USER_AGENT } from "@/lib/yuyuteiParser";
import { readYuyuteiSourceState } from "@/lib/appSettings";
import { errorMessage } from "@/lib/errorMessage";
import { adminClient } from "@/lib/supabase/admin";
import { sleep } from "@/lib/sleep";

// Daily price tracking for the 2,426 yuyu-tei-sourced (data_quality='partial')
// cards added by migration/scrape_yuyutei.mjs. Until this route existed,
// those cards were inserted with exactly one snapshot (the day they were
// added) and never touched again — current_price frozen forever, avg30/
// avg90/judgment permanently null. This route re-scrapes the same yuyu-tei
// set-list pages daily and accumulates real, calendar-day-based history for
// them via the same computeStats() (and buildVerdictText()) the primary
// "real" cron uses, so a tracked yuyu-tei card gets the same avg30/90,
// judgment, and AI verdict comment a 'real' card does.
//
// data_quality stays 'partial' even once a card is tracked by this route —
// it describes single-shop vs multi-shop provenance (an axis that never
// changes for these cards: yuyu-tei is always one shop), not whether a card
// is currently auto-updated. See isAutoTracked() in src/lib/format.ts for
// that separate axis, which this route's existence is why it now includes
// 'partial' too.
//
// Built 2026-09-12 following the user's explicit legal-risk acceptance for
// the yuyu-tei source (see README.md "遊々亭ソースの法務リスクについて" /
// COORDINATION.md). NOT deployed as of this commit — see
// migration/README.md and COORDINATION.md for the manual steps (Supabase
// SQL Editor: create the yuyutei_sync_runs table; Vercel: this needs an
// actual `git push` + the vercel.json cron entry to take effect) required
// before this runs for real. Written and tested locally/via mocks only.
export const maxDuration = 290; // seconds — stay under Vercel Hobby+Fluid Compute's 300s ceiling
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 270_000; // leave ~20s headroom under maxDuration for the final DB writes
const SET_FETCH_TIMEOUT_MS = 15_000; // a single stalled set-page fetch must never eat the whole run
const DB_TIMEOUT_MS = 10_000; // a single stalled Supabase call must never eat the whole run either
const FINAL_LOG_TIMEOUT_MS = 15_000; // fixed (not budget-relative) — runs after the budget is already spent
// Same politeness interval as migration/scrape_yuyutei.mjs's per-set fetch
// loop — one request per SET (not per card), so ~57 sets total is cheap
// even with this spacing (unlike the primary cron's per-CARD external
// fetches, there is no external HTTP call at all in this route's per-card
// phase below — it's pure Supabase I/O, so no sleep is added there).
const SET_FETCH_SLEEP_MS = 1500;

const YUYUTEI_TRACKED_NOTE =
  "現在は日次で遊々亭（1店舗）の店頭販売価格を自動取得しています。onepiece-card-atari.jpの実測データとは異なり、複数店舗の平均ではなく単一店舗の価格の推移です。";

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();

  // Emergency kill-switch (see src/lib/appSettings.ts) — checked before
  // ANY request to yuyu-tei.jp, including the very first one. This is the
  // "stop sending them traffic" half of complying with a takedown request;
  // src/app/page.tsx and src/app/cards/[id]/page.tsx handle the "stop
  // republishing their data" half separately.
  //
  // Reads the tri-state result directly (rather than the boolean
  // canScrapeYuyutei() helper) so the gate and the reported reason come
  // from the SAME read — calling a boolean check and then a second,
  // separate read to explain it risks the two reads disagreeing under a
  // transient condition. Only a confirmed "enabled" or "unconfigured"
  // (table/row genuinely doesn't exist yet — no takedown request could
  // have been issued through a switch that isn't set up) permits
  // scraping; "disabled" and "unknown" (read failure, timeout, exception,
  // unrecognized value) both fail CLOSED here — a settings-read failure
  // must never be indistinguishable from "still enabled" (Codex
  // independent review, 2026-09-12): a genuinely disabled switch must stay
  // disabled even if a later run's read of it merely times out or errors,
  // not silently resume scraping. This is deliberately stricter than the
  // display pages' isYuyuteiSourceEnabled(), which fails open on
  // "unknown" since it isn't deciding whether to send external traffic.
  const settingsState = await readYuyuteiSourceState(supabase);
  if (settingsState === "disabled" || settingsState === "unknown") {
    return NextResponse.json({
      disabled: true,
      reason:
        settingsState === "disabled"
          ? "yuyutei_source_enabled is false in app_settings"
          : "could not confirm yuyutei_source_enabled is true (failing closed — no request was sent to yuyu-tei.jp)",
      settingsState,
    });
  }

  const startedAt = new Date().toISOString();
  const startTime = Date.now(); // before any network/DB I/O, so the budget covers all of it
  const remainingMs = () => TIME_BUDGET_MS - (Date.now() - startTime);

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : null;

  // ---- Phase 1: fetch every yuyu-tei set-list page, build today's prices ----
  // One request per SET returns every card in it (rarity + price) in a
  // single page — ~57 sets total for the whole catalog this project has
  // ever scraped from yuyu-tei, vastly cheaper than a per-card fetch would
  // be for ~2,426 cards. Keyed by source_url (already stored on each card
  // from insert time), which is a simpler, more direct join key than
  // reconstructing (card_number, rarity) matching here too.
  const todayPriceByUrl = new Map<string, number>();
  let setsFetched = 0;
  let setsFailed = 0;
  let setsSkippedForTime = 0;
  const setErrorSamples: string[] = [];

  for (const setSlug of ALL_YUYUTEI_SETS) {
    if (remainingMs() <= 0) {
      setsSkippedForTime = ALL_YUYUTEI_SETS.length - setsFetched - setsFailed;
      break;
    }
    try {
      const fetchTimeoutMs = Math.max(1000, Math.min(SET_FETCH_TIMEOUT_MS, remainingMs()));
      const res = await fetch(`https://yuyu-tei.jp/sell/opc/s/${setSlug}`, {
        headers: { "User-Agent": YUYUTEI_USER_AGENT },
        signal: AbortSignal.timeout(fetchTimeoutMs),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = await res.text();
      const { cards } = parseSetPage(html);
      for (const c of cards) {
        if (c.price > 0) todayPriceByUrl.set(c.url, c.price);
      }
      setsFetched++;
    } catch (err) {
      setsFailed++;
      if (setErrorSamples.length < 10) setErrorSamples.push(`${setSlug}: ${errorMessage(err)}`);
    }
    await sleep(SET_FETCH_SLEEP_MS);
  }

  // ---- Phase 2: read existing yuyu-tei cards, oldest-updated-first ----
  // Same "1000-row PostgREST cap" pagination this project has hit
  // repeatedly elsewhere, and the same "check the time budget before every
  // DB call in a read loop, not just the processing loop after it" lesson
  // from check-watchlist/route.ts (an independent review finding,
  // 2026-09-12) — a large enough cards table could otherwise burn the
  // whole budget just paging through reads before any card gets updated.
  let cards: { id: string; name: string; source_url: string | null; history_is_estimated: boolean | null }[] = [];
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      if (remainingMs() <= 0) break;
      let query = supabase
        .from("cards")
        .select("id, name, source_url, history_is_estimated")
        .eq("data_quality", "partial")
        .not("source_url", "is", null)
        .order("updated_at", { ascending: true })
        .range(from, from + pageSize - 1)
        .abortSignal(AbortSignal.timeout(Math.max(1000, Math.min(DB_TIMEOUT_MS, remainingMs()))));
      if (limit) query = query.limit(limit);
      const { data, error } = await query;
      if (error) {
        return NextResponse.json({ error: errorMessage(error), phase: "reading_cards" }, { status: 500 });
      }
      cards = cards.concat(data ?? []);
      if (limit || !data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  // ---- Phase 3: for each card, upsert today's snapshot + recompute stats ----
  const today = new Date().toISOString().slice(0, 10);
  let successCount = 0;
  let failCount = 0;
  let notFoundInFetch = 0; // card's set wasn't reached this run, or it's no longer listed
  let skippedForTime = 0;
  const errorSamples: string[] = [];

  for (const card of cards) {
    if (remainingMs() <= 0) {
      skippedForTime = cards.length - successCount - failCount - notFoundInFetch;
      break;
    }
    const price = card.source_url ? todayPriceByUrl.get(card.source_url) : undefined;
    if (price === undefined) {
      notFoundInFetch++;
      continue;
    }
    try {
      if (remainingMs() <= 0) throw new Error("time budget exhausted before DB writes");
      const { error: snapErr } = await supabase
        .from("price_snapshots")
        .upsert(
          { card_id: card.id, snapshot_date: today, price },
          { onConflict: "card_id,snapshot_date" }
        )
        .abortSignal(AbortSignal.timeout(Math.max(1000, Math.min(DB_TIMEOUT_MS, remainingMs()))));
      if (snapErr) throw snapErr;

      if (remainingMs() <= 0) throw new Error("time budget exhausted before history read");
      const { data: history, error: historyErr } = await supabase
        .from("price_snapshots")
        .select("snapshot_date, price")
        .eq("card_id", card.id)
        .order("snapshot_date", { ascending: false })
        .limit(90)
        .abortSignal(AbortSignal.timeout(Math.max(1000, Math.min(DB_TIMEOUT_MS, remainingMs()))));
      if (historyErr) throw historyErr;
      if (!history || history.length === 0) {
        throw new Error("price_snapshots history came back empty after a successful upsert");
      }

      const stats = computeStats(history);
      // Same regenerate-from-the-same-numbers approach as refresh-prices/
      // route.ts, so the verdict text can never drift out of sync with the
      // avg30/pct_vs_avg30/judgment shown next to it — including for a
      // card on day one of tracking (a single snapshot), which is the same
      // "not very informative yet, but not wrong either" state a newly
      // added 'real' card already starts in.
      const verdictText = buildVerdictText({
        name: card.name,
        currentPrice: stats.current_price,
        avg30: stats.avg30,
        avg90: stats.avg90,
        pctVsAvg30: stats.pct_vs_avg30,
        pctVsAvg90: stats.pct_vs_avg90,
        judgment: stats.judgment,
      });
      const estimationFields = card.history_is_estimated
        ? { history_is_estimated: false, source_note: YUYUTEI_TRACKED_NOTE }
        : {};

      if (remainingMs() <= 0) throw new Error("time budget exhausted before card update");
      const { error: updateErr } = await supabase
        .from("cards")
        .update({
          ...stats,
          ...estimationFields,
          ai_verdict: stats.judgment,
          ai_verdict_text: verdictText,
          ai_verdict_at: today,
          updated_at: new Date().toISOString(),
        })
        .eq("id", card.id)
        .abortSignal(AbortSignal.timeout(Math.max(1000, Math.min(DB_TIMEOUT_MS, remainingMs()))));
      if (updateErr) throw updateErr;

      successCount++;
    } catch (err) {
      failCount++;
      if (errorSamples.length < 10) errorSamples.push(`${card.id}: ${errorMessage(err)}`);
    }
  }

  const errorSample = [
    ...setErrorSamples.map((s) => `[set fetch] ${s}`),
    ...errorSamples,
    setsSkippedForTime > 0 ? `(time budget reached during set fetch — ${setsSkippedForTime} set(s) not fetched this run)` : null,
    skippedForTime > 0 ? `(time budget reached — ${skippedForTime} card(s) deferred to the next run)` : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Separate table from sync_runs (which is documented/scoped specifically
  // to refresh-prices) rather than overloading it with a second cron's
  // rows under an ambiguous schema — see supabase/schema.sql. NOT YET
  // CREATED in production; this insert is expected to fail with a "relation
  // does not exist" error until the user runs the CREATE TABLE statement
  // there (see migration/README.md). That failure is surfaced below rather
  // than crashing the route — the actual price-refresh work above already
  // happened regardless.
  const { error: syncRunErr } = await supabase
    .from("yuyutei_sync_runs")
    .insert({
      started_at: startedAt,
      finished_at: new Date().toISOString(),
      sets_total: ALL_YUYUTEI_SETS.length,
      sets_fetched: setsFetched,
      sets_failed: setsFailed,
      total_count: cards.length,
      success_count: successCount,
      fail_count: failCount,
      not_found_count: notFoundInFetch,
      error_sample: errorSample || null,
    })
    .abortSignal(AbortSignal.timeout(FINAL_LOG_TIMEOUT_MS));
  const syncRunLogged = !syncRunErr;

  return NextResponse.json({
    setsTotal: ALL_YUYUTEI_SETS.length,
    setsFetched,
    setsFailed,
    setsSkippedForTime,
    total: cards.length,
    success: successCount,
    failed: failCount,
    notFoundInFetch,
    skippedForTime,
    errorSamples,
    syncRunLogged,
    ...(syncRunErr ? { syncRunLogError: errorMessage(syncRunErr) } : {}),
  });
}
