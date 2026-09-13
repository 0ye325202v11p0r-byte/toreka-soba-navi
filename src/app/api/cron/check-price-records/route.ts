import { NextResponse } from "next/server";
import webpush, { pushConfigured } from "@/lib/webPushServer";
import { adminClient } from "@/lib/supabase/admin";
import { errorMessage } from "@/lib/errorMessage";
import { findPriceRecordAlerts } from "@/lib/priceRecordAlerts";
import { buildPriceRecordPushPayload } from "@/lib/priceRecordPush";
import type { Transaction, WatchlistItem, DashboardCardInfo } from "@/lib/types";

// "史上最高値・最安値更新" push (added 2026-09-13, differentiation feature
// #6) — a different retention TRIGGER than weekly-digest.ts's scheduled
// catch-up: this fires same-day, on the specific day a held/watched card
// actually sets a record. Deliberately its own cron (not folded into
// check-watchlist, which only ever looks at explicit user-configured
// alert_rule conditions, never at plain holdings) and its own schedule
// entry, scheduled a few minutes AFTER refresh-prices in vercel.json —
// record_status is only ever non-null for the SAME UTC calendar day
// refresh-prices last set it (recomputed to null on every run that isn't a
// genuinely new record — see priceRecord.ts), so running shortly after
// that daily cron is what makes "read record_status, push once" correct
// without needing a separate anti-spam/already-notified column the way
// check-watchlist's condition_was_met needs one for its longer-lived
// trigger state.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const DB_TIMEOUT_MS = 10_000;
const TIME_BUDGET_MS = 45_000;

// Same distinction as appSettings.ts's isMissingTableError.
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

  if (!pushConfigured) {
    return NextResponse.json({ skipped: true, reason: "vapid_not_configured" });
  }

  const supabase = adminClient();
  const startTime = Date.now();
  const budgetExceeded = () => Date.now() - startTime > TIME_BUDGET_MS;

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
    return NextResponse.json({ totalUsers: 0, pushSent: 0 });
  }

  let usersProcessed = 0;
  let usersSkippedForTime = 0;
  let usersWithRecords = 0;
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
      usersProcessed++;
      if (relevantCardIds.length === 0) continue;

      // select("*") — same reasoning as dashboard/page.tsx: record_status
      // may not exist in production yet, and select("*") degrades
      // gracefully where an explicit column list would error.
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .in("id", relevantCardIds)
        .abortSignal(AbortSignal.timeout(DB_TIMEOUT_MS));
      if (error) throw error;
      const cards: DashboardCardInfo[] = (data ?? []).map((c) => ({
        id: c.id,
        name: c.name,
        current_price: c.current_price,
        pct_vs_avg30: c.pct_vs_avg30,
        data_quality: c.data_quality,
        source_url: c.source_url,
        updated_at: c.updated_at,
        judgment: c.judgment,
        record_status: c.record_status ?? null,
      }));

      const alerts = findPriceRecordAlerts(cards);
      const payload = buildPriceRecordPushPayload(alerts);
      if (!payload) continue;
      usersWithRecords++;

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
      // One user's data read failing must not stop every other user's
      // check from running — same per-item isolation lesson this project
      // applies everywhere else (check-watchlist's isValidAlertRule,
      // weekly-digest's per-user try/catch).
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
    usersWithRecords,
    pushSent,
    pushFailed,
  });
}
