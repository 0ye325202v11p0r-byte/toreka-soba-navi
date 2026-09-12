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
  const startedAt = new Date().toISOString();
  // Captured before the kill-switch check below, not after — that check
  // itself does a DB read (readYuyuteiSourceState, with its own internal
  // up-to-5s timeout), so capturing startTime afterward would let that
  // read's latency sit entirely outside the time budget, undermining the
  // "TIME_BUDGET_MS + FINAL_LOG_TIMEOUT_MS stays under maxDuration"
  // guarantee by up to ~5s in the worst case (found via self-review after
  // the appSettings.ts redesign added this check ahead of the rest of the
  // route's work, 2026-09-12 — the exact "capture startTime before ANY
  // I/O" principle this project has emphasized since refresh-prices/
  // route.ts's original DB-budget-reuse bug, just not yet applied to this
  // newer check).
  const startTime = Date.now();
  const remainingMs = () => TIME_BUDGET_MS - (Date.now() - startTime);

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
  // Distinguishes "HTTP fetch succeeded" from "the page actually contained
  // parseable card listings" (Codex independent review, 2026-09-12,
  // reproduced by feeding the real route a 200-OK maintenance-page HTML —
  // every set "succeeds" as setsFetched++ while yielding zero prices, with
  // nothing anywhere distinguishing that from a genuinely low-inventory
  // set). A set landing here is not itself proof of a problem — see the
  // anomaly/diagnostic logic after Phase 2 below for how this is used.
  const setsWithNoCardsParsed: string[] = [];

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
      let pricesFoundThisSet = 0;
      for (const c of cards) {
        if (c.price > 0) {
          todayPriceByUrl.set(c.url, c.price);
          pricesFoundThisSet++;
        }
      }
      if (pricesFoundThisSet === 0) setsWithNoCardsParsed.push(setSlug);
      setsFetched++;
    } catch (err) {
      setsFailed++;
      if (setErrorSamples.length < 10) setErrorSamples.push(`${setSlug}: ${errorMessage(err)}`);
    }
    await sleep(SET_FETCH_SLEEP_MS);
  }

  // Plan C (2026-09-12, following a design discussion with Codex — see
  // COORDINATION.md for the full reasoning): rather than choosing between
  // "flag a run-wide anomaly only if literally every set came back empty"
  // (cheap, but misses a partial breakage affecting only some sets) or
  // "flag any set with known existing cards that came back empty" (needs
  // its own "unknown set" carve-out to avoid false alarms on genuinely
  // low-inventory sets), this does both cheaply with data already in hand:
  //   - allFetchedSetsEmpty: the simple, high-confidence run-wide signal
  //     (every set that returned HTTP 200 also parsed to zero cards) —
  //     computed right here, no dependency on Phase 2.
  //   - knownSetsWithNoCardsParsedToday (computed after Phase 2 below):
  //     a DIAGNOSTIC list only, not an auto-triggered anomaly — cross-
  //     references setsWithNoCardsParsed against the sets Phase 2's
  //     `cards` are actually known to belong to (derived from source_url,
  //     already in memory, no extra query), so a partial breakage is
  //     visible to a human reviewing /admin/sync-status without the
  //     system asserting "this run failed" over what might just be a
  //     legitimately empty set it hasn't learned about yet.
  //
  // Correction (Codex independent re-verification, 2026-09-12): the
  // original comment above claimed the "known-set" precision Plan B wanted
  // "requires reordering Phase 1/Phase 2 or an extra DB query" — that
  // framing was wrong. knownSetsWithNoCardsParsedToday below proves the
  // exact same precision is available for free, computed entirely AFTER
  // Phase 2 from data already in memory, no reordering or extra query
  // needed. The real, still-valid reason allFetchedSetsEmpty stays as a
  // SEPARATE run-wide signal (not replaced by the known-set diagnostic) is
  // scope, not cost: knownSetsWithNoCardsParsedToday can only ever flag a
  // set this project already has tracked cards for — a brand-new set with
  // zero existing rows would never appear there even if its fetch were
  // completely broken. allFetchedSetsEmpty is what still catches that case.
  const allFetchedSetsEmpty = setsFetched > 0 && todayPriceByUrl.size === 0;

  // allFetchedSetsEmpty is an OBSERVATION about the sets actually fetched,
  // not a confirmed site-wide failure — it says nothing by itself about
  // whether the fetch was complete (Codex independent review, 2026-09-12:
  // a run that times out after only 2-3 sets, all of which happen to be
  // genuinely thin/unreleased, could trip this flag despite the site being
  // completely healthy). The boolean's own true/false computation is
  // unchanged; this only makes the accompanying TEXT say so explicitly —
  // previously it read "every fetched set returned zero cards", technically
  // accurate but easy to misread as "the whole site is down" without
  // noticing how few sets that actually covers. Always states the sample
  // size (N/total) inline, and calls out explicitly when the run itself
  // was incomplete, so a reader never has to cross-reference setsFetched/
  // setsSkippedForTime separately to judge how much weight to give this.
  function allFetchedSetsEmptyMessage(): string | null {
    if (!allFetchedSetsEmpty) return null;
    const partialNote =
      setsSkippedForTime > 0
        ? ` — NOTE: this run itself was incomplete (${setsSkippedForTime} set(s) not yet fetched due to the time budget), so this reflects a partial sample, not full site coverage`
        : "";
    return `ANOMALY: every set actually fetched so far (${setsFetched}/${ALL_YUYUTEI_SETS.length}) returned zero cards (possible site block or page structure change)${partialNote}`;
  }

  // ---- Phase 2: read existing yuyu-tei cards, oldest-updated-first ----
  // Same "1000-row PostgREST cap" pagination this project has hit
  // repeatedly elsewhere. The budget IS checked before every DB call in
  // this read loop (not just the processing loop after it) — but until
  // this fix, hitting that check mid-pagination just `break`d silently,
  // falling through to Phase 3 with whatever partial `cards` list had
  // been read so far. Phase 3 then reported `total: cards.length` as if
  // that were the true count and `skippedForTime` against that same
  // undercounted total — the rows on unread pages vanished from the
  // response and log entirely, never counted as read, skipped, or
  // anything else (Codex independent review, second bug found by
  // constructing a real 1500-row/mid-first-page-timeout case against the
  // actual route, 2026-09-12). Fixed by returning immediately here,
  // exactly like check-watchlist/route.ts's identical read loops already
  // do — no Phase 3, no fabricated `total`, just an honest
  // `itemsReadSoFar`.
  let cards: { id: string; name: string; source_url: string | null; history_is_estimated: boolean | null }[] = [];
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      if (remainingMs() <= 0) {
        const { error: logErr } = await supabase
          .from("yuyutei_sync_runs")
          .insert({
            started_at: startedAt,
            finished_at: new Date().toISOString(),
            sets_total: ALL_YUYUTEI_SETS.length,
            sets_fetched: setsFetched,
            sets_failed: setsFailed,
            total_count: 0,
            success_count: 0,
            fail_count: 0,
            not_found_count: 0,
            error_sample: [
              `incomplete: reading_cards, itemsReadSoFar=${cards.length}`,
              setsSkippedForTime > 0 ? `(${setsSkippedForTime} set(s) were also not fetched this run)` : null,
              allFetchedSetsEmptyMessage(),
            ]
              .filter(Boolean)
              .join(" "),
          })
          .abortSignal(AbortSignal.timeout(FINAL_LOG_TIMEOUT_MS));
        return NextResponse.json({
          incomplete: true,
          phase: "reading_cards",
          itemsReadSoFar: cards.length,
          setsTotal: ALL_YUYUTEI_SETS.length,
          setsFetched,
          setsFailed,
          setsSkippedForTime,
          allFetchedSetsEmpty,
          syncRunLogged: !logErr,
          ...(logErr ? { syncRunLogError: errorMessage(logErr) } : {}),
        });
      }
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

  // Diagnostic only (see the Plan C comment above Phase 1) — cross-
  // references setsWithNoCardsParsed against the set each already-tracked
  // card actually belongs to (derived from source_url, which Phase 2 just
  // read — no extra query). A set showing up here has EXISTING cards in
  // the catalog yet produced zero prices today despite its HTTP fetch
  // succeeding — worth a human glancing at /admin/sync-status, but
  // deliberately NOT auto-classified as a failure (a card can be the only
  // one this project tracks from an otherwise-thin set, and one card
  // going temporarily out of stock on yuyu-tei is not evidence of a
  // scraper problem).
  const setSlugFromSourceUrl = (url: string | null): string | null =>
    url?.match(/\/card\/([a-z0-9]+)\//)?.[1] ?? null;
  const knownSetSlugs = new Set(
    cards.map((c) => setSlugFromSourceUrl(c.source_url)).filter((s): s is string => s !== null)
  );
  const knownSetsWithNoCardsParsedToday = setsWithNoCardsParsed.filter((slug) => knownSetSlugs.has(slug));

  // ---- Phase 3: for each card, upsert today's snapshot + recompute stats ----
  // Deliberately UTC, not JST — see the snapshot_date comment in
  // supabase/schema.sql (raised by Codex, 2026-09-12) for why this stays
  // UTC-based for now and what a future migration to JST would require.
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
    allFetchedSetsEmptyMessage(),
    knownSetsWithNoCardsParsedToday.length > 0
      ? `sets with known tracked cards but zero parsed today (not auto-flagged as a failure, review manually): ${knownSetsWithNoCardsParsedToday.join(", ")}`
      : null,
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
    // Plan C fields (design discussion with Codex, 2026-09-12 — see
    // COORDINATION.md): allFetchedSetsEmpty is the high-confidence,
    // run-wide anomaly signal; knownSetsWithNoCardsParsedToday is a
    // diagnostic-only list (not an auto-flagged failure) of sets with
    // existing tracked cards that nonetheless parsed to zero today.
    allFetchedSetsEmpty,
    setsWithNoCardsParsed,
    knownSetsWithNoCardsParsedToday,
    // Explicit marker (Codex independent review, 2026-09-12) so a log
    // reader never has to infer from the absence of an earlier
    // `incomplete: true, phase: "reading_cards"` response that Phase 2
    // actually finished — this field says so directly. Always `true` on
    // this success path (an incomplete Phase 2 returns earlier, above,
    // and never reaches this response at all).
    cardsReadComplete: true,
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
