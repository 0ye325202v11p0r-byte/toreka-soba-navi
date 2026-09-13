import { NextResponse } from "next/server";
import webpush, { pushConfigured } from "@/lib/webPushServer";
import type { WatchlistAlertRule } from "@/lib/types";
import { errorMessage } from "@/lib/errorMessage";
import { adminClient } from "@/lib/supabase/admin";
import { conditionMet } from "@/lib/watchlistRule";
import { isNewlyTriggered, buildWatchlistPushPayload } from "@/lib/watchlistPush";

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

// A missing TABLE (push_subscriptions not yet created in production) is a
// different, separate error code from a missing column — see
// appSettings.ts's isMissingTableError for the same distinction applied to
// app_settings.
function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = "code" in error ? String((error as { code: unknown }).code) : "";
  return code === "42P01" || code === "PGRST205";
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
  // Selects `*` rather than an explicit column list specifically so
  // condition_was_met (may not exist in production yet — see
  // retrofit_add_watchlist_condition_was_met.sql) never causes a query
  // error: PostgREST's `*` simply omits a column that doesn't exist rather
  // than rejecting the request the way naming it explicitly would. Every
  // item then defaults its `condition_was_met` to `false` via
  // `Boolean(r.condition_was_met)` when the column (and so the field)
  // isn't present — an honest "not previously known to be met", matching
  // the retrofit migration's own backfill default.
  let items: { id: string; card_id: string; alert_rule: unknown; user_id: string; condition_was_met: boolean }[] =
    [];
  // Whether condition_was_met actually exists on production's
  // watchlist_items table right now — inferred from whether the raw JSON
  // key was present on the first row read (select("*") includes every
  // EXISTING column's key always, even when its value is falsy; a column
  // that doesn't exist in the table at all is simply absent as a key, not
  // present-with-null). Determines whether the per-item update calls below
  // may safely include this field — including it in an update payload when
  // the column doesn't exist would fail the update outright (unlike
  // select("*"), UPDATE must name real columns), exactly the deploy-before-
  // migration hazard this project already fixed once for transactions.fee.
  let hasConditionWasMet = false;
  {
    const pageSize = 1000;
    let from = 0;
    let sawFirstRow = false;
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
        .select("*")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
      const rawRows = (data ?? []) as { id: string; card_id: string; alert_rule: unknown; user_id: string; condition_was_met?: boolean }[];
      if (!sawFirstRow && rawRows.length > 0) {
        sawFirstRow = true;
        hasConditionWasMet = "condition_was_met" in rawRows[0];
      }
      items = items.concat(rawRows.map((r) => ({ ...r, condition_was_met: Boolean(r.condition_was_met) })));
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  if (items.length === 0) {
    return NextResponse.json({ totalItems: 0, triggered: 0 });
  }

  // Batch-fetch just the cards these items actually reference, rather than
  // the whole cards table — a watchlist realistically references far fewer
  // cards than the full catalog. `name` is new here (added for push
  // notification text — see buildWatchlistPushPayload) alongside the two
  // fields conditionMet() already needed.
  const cardIds = Array.from(new Set(items.map((i) => i.card_id)));
  const cardById = new Map<string, { name: string; pctVsAvg30: number | null; currentPrice: number | null }>();
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
        .select("id, name, pct_vs_avg30, current_price")
        .in("id", chunk)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) {
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
      for (const c of data ?? []) {
        cardById.set(c.id, {
          name: c.name,
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
  // Collected across the loop, sent in one batch afterward (see below) —
  // keeps the per-item loop's own time-budget accounting simple and
  // unchanged from before this feature, and lets push-sending have its own
  // separate, honestly-reported budget phase rather than silently eating
  // into the per-item processing budget.
  const newlyTriggered: { userId: string; cardId: string; cardName: string }[] = [];

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

    const card = cardById.get(item.card_id) ?? { name: item.card_id, pctVsAvg30: null, currentPrice: null };
    const met = conditionMet(item.alert_rule, card);
    const wasNewlyTriggered = isNewlyTriggered(item.condition_was_met, met);

    if (met) {
      // Records "this condition was true as of this check" — the timestamp
      // display in WatchlistClient.tsx reads this as "confirmed met as
      // recently as". condition_was_met is written alongside it (when the
      // column exists) purely for the NEXT run's newly-triggered detection.
      const updatePayload: Record<string, unknown> = { last_triggered_at: now };
      if (hasConditionWasMet) updatePayload.condition_was_met = true;
      const { error: updErr } = await supabase
        .from("watchlist_items")
        .update(updatePayload)
        .eq("id", item.id)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (updErr) {
        updateFailed++;
        continue;
      }
      triggered++;
    } else if (hasConditionWasMet && item.condition_was_met) {
      // Transition true -> false: reset condition_was_met so a future
      // re-trigger is correctly detected as newly-triggered again, rather
      // than silently never pushing again for this item. Items that stay
      // continuously NOT met (the common case) get no write at all, same
      // as before this feature existed.
      const { error: updErr } = await supabase
        .from("watchlist_items")
        .update({ condition_was_met: false })
        .eq("id", item.id)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (updErr) {
        updateFailed++;
        continue;
      }
    }

    if (wasNewlyTriggered) {
      newlyTriggered.push({ userId: item.user_id, cardId: item.card_id, cardName: card.name });
    }
  }

  // ---- Push notifications (best-effort, additive — never fails the run) ----
  let pushSent = 0;
  let pushFailed = 0;
  let pushSkippedForTime = 0;
  let pushSkippedReason: string | null = null;
  if (newlyTriggered.length === 0) {
    pushSkippedReason = "no_newly_triggered_items";
  } else if (!pushConfigured) {
    pushSkippedReason = "vapid_not_configured";
  } else {
    const userIds = Array.from(new Set(newlyTriggered.map((n) => n.userId)));
    const subsByUser = new Map<string, { id: string; endpoint: string; p256dh: string; auth_key: string }[]>();
    let pushSubscriptionsTableMissing = false;
    {
      const pageSize = 1000;
      for (let i = 0; i < userIds.length; i += pageSize) {
        if (budgetExceeded()) {
          pushSkippedForTime = newlyTriggered.length;
          break;
        }
        const chunk = userIds.slice(i, i + pageSize);
        const { data, error } = await supabase
          .from("push_subscriptions")
          .select("id, user_id, endpoint, p256dh, auth_key")
          .in("user_id", chunk)
          .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
        if (error) {
          if (isMissingTableError(error)) {
            pushSubscriptionsTableMissing = true;
            break;
          }
          // An unexpected read error here must not fail the whole cron
          // run — the core watchlist-checking job above already succeeded
          // and its response has already been shaped; just skip pushing.
          pushSkippedReason = "push_subscriptions_read_error";
          break;
        }
        for (const row of data ?? []) {
          const list = subsByUser.get(row.user_id) ?? [];
          list.push(row);
          subsByUser.set(row.user_id, list);
        }
      }
    }

    if (pushSubscriptionsTableMissing) {
      pushSkippedReason = "push_subscriptions_table_missing";
    } else if (pushSkippedForTime === 0 && !pushSkippedReason) {
      const staleSubscriptionIds: string[] = [];
      for (const n of newlyTriggered) {
        if (budgetExceeded()) {
          pushSkippedForTime++;
          continue;
        }
        const subs = subsByUser.get(n.userId) ?? [];
        const payload = buildWatchlistPushPayload(n.cardName, n.cardId);
        for (const sub of subs) {
          try {
            await webpush.sendNotification(
              { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
              JSON.stringify(payload)
            );
            pushSent++;
          } catch (e) {
            pushFailed++;
            // 404/410 means the push service itself says this subscription
            // is gone for good (browser data cleared, unsubscribed, etc.) —
            // queue it for deletion rather than retrying it forever on
            // every future trigger.
            const statusCode = (e as { statusCode?: number } | undefined)?.statusCode;
            if (statusCode === 404 || statusCode === 410) {
              staleSubscriptionIds.push(sub.id);
            }
          }
        }
      }
      if (staleSubscriptionIds.length > 0) {
        // Best-effort cleanup — failing to delete a stale row just means
        // it's retried (and fails again) next run, not a correctness issue.
        await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
      }
    }
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
    push: {
      newlyTriggered: newlyTriggered.length,
      sent: pushSent,
      failed: pushFailed,
      skippedForTime: pushSkippedForTime,
      ...(pushSkippedReason ? { skippedReason: pushSkippedReason } : {}),
    },
  });
}
