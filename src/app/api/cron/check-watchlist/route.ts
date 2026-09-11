import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import type { WatchlistAlertRule } from "@/lib/types";

// This route only reads/writes Supabase (no external HTTP fetches like
// refresh-prices does), so it should finish in well under a minute even
// with a large watchlist — no special time-boxing needed here.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 10_000;

function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

// Same shape as the equivalent helper in refresh-prices/route.ts — kept
// duplicated rather than shared for now, since these two routes were built
// independently and neither is large enough yet to justify a shared
// lib/cron-helpers.ts module.
function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}

function conditionMet(rule: WatchlistAlertRule, pctVsAvg30: number | null): boolean {
  // partial-quality cards (single-shop reference price, no tracked
  // history) never have a pct_vs_avg30 — there is nothing to evaluate the
  // condition against, so it simply never fires for those. This mirrors
  // the warning already shown in WatchlistClient when registering one.
  if (pctVsAvg30 === null) return false;
  if (rule.type !== "pct_vs_avg30") return false;
  return rule.op === "lte" ? pctVsAvg30 <= rule.value : pctVsAvg30 >= rule.value;
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();

  // Supabase/PostgREST caps a single select() at 1000 rows by default (see
  // README.md "カードデータの収録範囲" for the full story on this bug
  // class) — page through watchlist_items rather than assume the whole
  // table fits in one request.
  let items: { id: string; card_id: string; alert_rule: WatchlistAlertRule }[] = [];
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
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
  const pctByCardId = new Map<string, number | null>();
  {
    const pageSize = 1000; // cardIds is a Set of unique watchlist targets — chunk .in() calls at the same page size for consistency, even though it will rarely exceed one page in practice
    for (let i = 0; i < cardIds.length; i += pageSize) {
      const chunk = cardIds.slice(i, i + pageSize);
      const { data, error } = await supabase
        .from("cards")
        .select("id, pct_vs_avg30")
        .in("id", chunk)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
      for (const c of data ?? []) {
        pctByCardId.set(c.id, c.pct_vs_avg30 === null ? null : Number(c.pct_vs_avg30));
      }
    }
  }

  const now = new Date().toISOString();
  let triggered = 0;
  let updateFailed = 0;
  for (const item of items) {
    const pct = pctByCardId.get(item.card_id) ?? null;
    if (!conditionMet(item.alert_rule, pct)) continue;

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
    totalItems: items.length,
    triggered,
    updateFailed,
    checkedAt: now,
  });
}
