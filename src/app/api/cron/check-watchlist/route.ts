import { NextResponse } from "next/server";
import type { WatchlistAlertRule } from "@/lib/types";
import { errorMessage } from "@/lib/errorMessage";
import { adminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 10_000;
// Per-call timeouts alone don't bound the total run time: this route
// updates one row per triggered item, sequentially, and a large enough
// batch of triggers (e.g. a market-wide move tripping many rules at once)
// could add up past maxDuration even with no single call ever timing out.
// Leaves ~15s headroom under maxDuration=60s for whatever's mid-flight when
// the budget check fires, plus the final response (found via independent
// review, 2026-09-11/12 — see COORDINATION.md).
const TIME_BUDGET_MS = 45_000;

// alert_rule is stored as JSONB with no schema-level constraint — the
// WatchlistAlertRule TypeScript type is only a compile-time promise, not a
// DB-enforced one. A single row with a malformed/null value (JSON null is
// valid JSONB) would otherwise reach conditionMet() below and throw
// (`Cannot read properties of null`) with no per-item isolation in the
// loop, taking down the whole run — every other user's watchlist item in
// that batch — over one bad row (found via independent review, 2026-09-12).
function isValidAlertRule(rule: unknown): rule is WatchlistAlertRule {
  if (!rule || typeof rule !== "object") return false;
  const r = rule as Record<string, unknown>;
  if (r.type !== "pct_vs_avg30" && r.type !== "price") return false;
  if (r.op !== "lte" && r.op !== "gte") return false;
  if (typeof r.value !== "number" || !Number.isFinite(r.value)) return false;
  return true;
}

function conditionMet(
  rule: WatchlistAlertRule,
  card: { pctVsAvg30: number | null; currentPrice: number | null }
): boolean {
  if (rule.type === "pct_vs_avg30") {
    // Cards the daily refresh-prices cron doesn't auto-track (data_quality
    // 'partial' or 'flat' — see isAutoTracked() in src/lib/format.ts) never
    // have a pct_vs_avg30 computed, regardless of which of those two
    // applies. Checking the actual value's nullness here (rather than
    // re-deriving "is this trackable" from data_quality) means this
    // doesn't need to enumerate every quality tier to stay correct — there
    // is simply nothing to evaluate the condition against, so it never
    // fires. This mirrors the warning already shown in WatchlistClient
    // when registering one.
    if (card.pctVsAvg30 === null) return false;
    return rule.op === "lte" ? card.pctVsAvg30 <= rule.value : card.pctVsAvg30 >= rule.value;
  }
  // "price": works for every card regardless of data_quality, since
  // current_price is always populated (even partial-quality cards have a
  // single reference price) — unlike pct_vs_avg30 this doesn't need
  // tracked history.
  if (card.currentPrice === null) return false;
  return rule.op === "lte" ? card.currentPrice <= rule.value : card.currentPrice >= rule.value;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const startTime = Date.now();
  const budgetExceeded = () => Date.now() - startTime > TIME_BUDGET_MS;

  // Supabase/PostgREST caps a single select() at 1000 rows by default (see
  // README.md "カードデータの収録範囲" for the full story on this bug
  // class) — page through watchlist_items rather than assume the whole
  // table fits in one request.
  //
  // alert_rule is typed `unknown` here (not WatchlistAlertRule) on purpose:
  // it's untrusted JSONB from the DB, validated per-item via
  // isValidAlertRule() below before anything reads its fields.
  //
  // Both read loops below check the time budget before each DB call, not
  // just the processing loop after them — a large enough watchlist_items
  // table or cardIds set could otherwise burn the whole maxDuration just
  // paging through reads, before the per-item budget check even starts
  // (found via independent review, 2026-09-12). On a mid-read timeout, this
  // returns immediately (no further DB calls of any kind — not the next
  // page/chunk, not cards, not updates) with `incomplete: true` and a
  // `phase`, rather than proceeding with a partial list while still
  // reporting `totalItems`/success as though everything was read.
  let items: { id: string; card_id: string; alert_rule: unknown }[] = [];
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      if (budgetExceeded()) {
        return NextResponse.json({
          incomplete: true,
          phase: "reading_watchlist_items",
          itemsReadSoFar: items.length,
        });
      }
      const { data, error } = await supabase
        .from("watchlist_items")
        .select("id, card_id, alert_rule")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
      items = items.concat((data ?? []) as typeof items);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ totalItems: 0, triggered: 0 });
  }

  // Batch-fetch just the cards these items actually reference, rather than
  // the whole cards table — a watchlist realistically references far fewer
  // cards than the full catalog.
  const cardIds = Array.from(new Set(items.map((i) => i.card_id)));
  const cardById = new Map<string, { pctVsAvg30: number | null; currentPrice: number | null }>();
  {
    const pageSize = 1000; // cardIds is a Set of unique watchlist targets — chunk .in() calls at the same page size for consistency, even though it will rarely exceed one page in practice
    for (let i = 0; i < cardIds.length; i += pageSize) {
      if (budgetExceeded()) {
        return NextResponse.json({
          incomplete: true,
          phase: "reading_cards",
          totalItems: items.length,
          cardsReadSoFar: cardById.size,
          cardsNeeded: cardIds.length,
        });
      }
      const chunk = cardIds.slice(i, i + pageSize);
      const { data, error } = await supabase
        .from("cards")
        .select("id, pct_vs_avg30, current_price")
        .in("id", chunk)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
      for (const c of data ?? []) {
        cardById.set(c.id, {
          pctVsAvg30: c.pct_vs_avg30 === null ? null : Number(c.pct_vs_avg30),
          currentPrice: c.current_price === null ? null : Number(c.current_price),
        });
      }
    }
  }

  const now = new Date().toISOString();
  let triggered = 0;
  let updateFailed = 0;
  let invalidRule = 0;
  let skippedForTime = 0;
  for (let i = 0; i < items.length; i++) {
    if (budgetExceeded()) {
      skippedForTime = items.length - i;
      break;
    }
    const item = items[i];

    if (!isValidAlertRule(item.alert_rule)) {
      invalidRule++;
      continue;
    }

    const card = cardById.get(item.card_id) ?? { pctVsAvg30: null, currentPrice: null };
    if (!conditionMet(item.alert_rule, card)) continue;

    // Records "this condition was true as of this check" — kept simple
    // (no transition/dedup tracking) since there's no notification step
    // consuming this yet (Phase 4 / email is still unbuilt, see
    // README.md). Whatever eventually reads this to decide "is this worth
    // emailing about" can apply its own throttling; this route's only job
    // is to honestly record when the condition held.
    const { error: updErr } = await supabase
      .from("watchlist_items")
      .update({ last_triggered_at: now })
      .eq("id", item.id)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    if (updErr) {
      updateFailed++;
      continue;
    }
    triggered++;
  }

  return NextResponse.json({
    incomplete: skippedForTime > 0,
    ...(skippedForTime > 0 ? { phase: "processing" } : {}),
    totalItems: items.length,
    triggered,
    updateFailed,
    invalidRule,
    skippedForTime,
    checkedAt: now,
  });
}
