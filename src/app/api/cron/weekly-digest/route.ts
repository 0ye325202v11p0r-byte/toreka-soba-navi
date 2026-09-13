import { NextResponse } from "next/server";
import webpush, { pushConfigured } from "@/lib/webPushServer";
import { adminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errorMessage";
import { buildDashboardSummary } from "@/lib/dashboardSummary";
import { buildWeeklyDigestPayload } from "@/lib/weeklyDigest";
import type { Transaction, WatchlistItem, DashboardCardInfo } from "@/lib/types";

// "週次サマリー通知" (added 2026-09-13) — a different retention lever than
// this session's dashboard-analysis features (market benchmark,
// concentration warning, tax report, profit-taking candidates all REWARD a
// visit the user already made; this one is the TRIGGER that proactively
// pulls them back). Reuses the exact push infrastructure built for
// check-watchlist's per-condition alerts, for a new, weekly-cadence
// purpose — see weeklyDigest.ts for why the opt-in copy (WatchlistClient.tsx)
// was updated to mention this alongside watchlist alerts rather than
// silently expanding what a user's existing opt-in covers.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 10_000;
const TIME_BUDGET_MS = 45_000;

// Same distinction as appSettings.ts's isMissingTableError — a missing
// TABLE (push_subscriptions not yet created in production) is a separate,
// narrower condition than any other read failure, and is the one case this
// route should report as "not configured yet" rather than a genuine error.
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

  // Nothing to do at all without VAPID keys — reported the same honest way
  // check-watchlist reports its own push phase being unconfigured, not as
  // an error (this is simply "not set up in this environment yet").
  if (!pushConfigured) {
    return NextResponse.json({ skipped: true, reason: "vapid_not_configured" });
  }

  const supabase = adminClient();
  const startTime = Date.now();
  const budgetExceeded = () => Date.now() - startTime > TIME_BUDGET_MS;

  // Every push subscription, grouped by user_id — fetched once up front
  // (not per-user) since this IS the "who should even be considered"
  // driving query. A user with zero subscriptions is a user who never
  // opted into push at all and has nothing to receive a digest through.
  const subsByUser = new Map<
    string,
    { id: string; endpoint: string; p256dh: string; auth_key: string }[]
  >();
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      if (budgetExceeded()) {
        return NextResponse.json({ incomplete: true, phase: "reading_push_subscriptions" });
      }
      const { data, error } = await supabase
        .from("push_subscriptions")
        .select("id, user_id, endpoint, p256dh, auth_key")
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) {
        if (isMissingTableError(error)) {
          return NextResponse.json({ skipped: true, reason: "push_subscriptions_table_missing" });
        }
        return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
      }
      for (const row of data ?? []) {
        const list = subsByUser.get(row.user_id) ?? [];
        list.push(row);
        subsByUser.set(row.user_id, list);
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  const userIds = [...subsByUser.keys()];
  if (userIds.length === 0) {
    return NextResponse.json({ totalUsers: 0, digestsSent: 0 });
  }

  // A catalog-wide sample for the benchmark comparison inside
  // buildDashboardSummary — the SAME sample for every user this run
  // (unlike each user's own transactions/watchlist/cards below), so it's
  // fetched once here rather than once per user. Best-effort: a read
  // failure here degrades every user's digest to "no market benchmark
  // this week" (buildDashboardSummary already treats an empty sample as
  // null, not a crash) rather than failing the whole run.
  let catalogPctValues: number[] = [];
  {
    const { data } = await supabase
      .from("cards")
      .select("pct_vs_avg30")
      .eq("data_quality", "real")
      .not("pct_vs_avg30", "is", null)
      .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
    catalogPctValues = (data ?? []).map((c) => Number(c.pct_vs_avg30));
  }

  let usersProcessed = 0;
  let usersSkippedForTime = 0;
  let digestsSent = 0;
  let digestsSkippedNothing = 0;
  let pushSent = 0;
  let pushFailed = 0;
  const staleSubscriptionIds: string[] = [];

  for (let i = 0; i < userIds.length; i++) {
    if (budgetExceeded()) {
      usersSkippedForTime = userIds.length - i;
      break;
    }
    const userId = userIds[i];
    try {
      // Same 1000-row PostgREST pagination this project applies everywhere
      // it reads one user's full transaction/watchlist history (see
      // dashboard/page.tsx) — a digest computed from a silently truncated
      // history would show a confidently wrong 合計損益 in a push
      // notification, which a user can't cross-check the way they could on
      // the dashboard page itself.
      async function fetchAllTransactions(): Promise<Transaction[]> {
        let all: Transaction[] = [];
        const pageSize = 1000;
        let from = 0;
        while (true) {
          const { data, error } = await supabase
            .from("transactions")
            .select("*")
            .eq("user_id", userId)
            .order("transaction_date", { ascending: false })
            .order("id", { ascending: false })
            .range(from, from + pageSize - 1)
            .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
          if (error) throw error;
          all = all.concat((data ?? []) as Transaction[]);
          if (!data || data.length < pageSize) break;
          from += pageSize;
        }
        return all;
      }

      const [transactions, { data: watchlistData, error: watchlistErr }] = await Promise.all([
        fetchAllTransactions(),
        supabase
          .from("watchlist_items")
          .select("*")
          .eq("user_id", userId)
          .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS)),
      ]);
      if (watchlistErr) throw watchlistErr;
      const watchlistItems = (watchlistData ?? []) as WatchlistItem[];

      const relevantCardIds = Array.from(
        new Set([...transactions.map((t) => t.card_id), ...watchlistItems.map((it) => it.card_id)])
      );
      let cards: DashboardCardInfo[] = [];
      if (relevantCardIds.length > 0) {
        const { data, error } = await supabase
          .from("cards")
          .select("id, name, current_price, pct_vs_avg30, data_quality, source_url, updated_at, judgment")
          .in("id", relevantCardIds)
          .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
        if (error) throw error;
        cards = (data ?? []) as DashboardCardInfo[];
      }

      const summary = buildDashboardSummary(transactions, watchlistItems, cards, new Date(), catalogPctValues);
      usersProcessed++;
      const payload = buildWeeklyDigestPayload(summary);
      if (!payload) {
        digestsSkippedNothing++;
        continue;
      }
      digestsSent++;
      for (const sub of subsByUser.get(userId) ?? []) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth_key } },
            JSON.stringify(payload)
          );
          pushSent++;
        } catch (e) {
          pushFailed++;
          const statusCode = (e as { statusCode?: number } | undefined)?.statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleSubscriptionIds.push(sub.id);
          }
        }
      }
    } catch {
      // One user's data read failing (timeout, malformed row, etc.) must
      // not stop every other user's digest from being computed and sent —
      // same "no per-item isolation was the bug" lesson check-watchlist's
      // isValidAlertRule() already applies, one level up (per-user instead
      // of per-item).
      continue;
    }
  }

  if (staleSubscriptionIds.length > 0) {
    await supabase.from("push_subscriptions").delete().in("id", staleSubscriptionIds);
  }

  return NextResponse.json({
    totalUsers: userIds.length,
    usersProcessed,
    usersSkippedForTime,
    digestsSent,
    digestsSkippedNothing,
    pushSent,
    pushFailed,
  });
}
