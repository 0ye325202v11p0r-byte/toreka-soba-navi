import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { buildVerdictText } from "@/lib/ai-verdict";
import type { Judgment } from "@/lib/types";

// Vercel Hobby caps function duration at 60s by default (300s if Fluid
// Compute is enabled on the project) and Pro at up to 800s. 378 cards at
// ~1.2s/request takes ~450s, which exceeds even Hobby+Fluid Compute. Rather
// than assume a paid plan, this route time-boxes itself: it processes cards
// oldest-updated-first and stops safely before the deadline, so a Hobby
// deployment still runs correctly (just fewer cards per invocation, with
// the remainder picked up automatically on the next daily run since it
// always resumes with whichever cards have gone longest without an
// update). Bump SAFETY_MARGIN_MS down / maxDuration up once on Vercel Pro
// to cover more cards per run.
export const maxDuration = 290; // seconds — stay under Hobby+Fluid Compute's 300s ceiling
export const dynamic = "force-dynamic";

const TIME_BUDGET_MS = 270_000; // leave ~20s headroom under maxDuration for the final DB writes
const PER_REQUEST_TIMEOUT_MS = 15_000; // a single stalled fetch must never be able to eat the whole run

// Server-only client with the service_role key (bypasses RLS). Never import
// this file from client code — it must only run in this route handler.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const PRICE_PATTERN = /本日の販売平均額は([\d,]+)円です/;
const TRACKED_NOTE =
  "現在は日次でonepiece-card-atari.jpの実測価格を自動取得しています。過去の一部期間（自動追跡が始まる前）は約2週間おきの実測値を日次に補完した推定値を含みます。";
const USER_AGENT =
  "TorekaSobaNaviBot/1.0 (+https://github.com/; daily price sync for a personal One Piece TCG tracker; respects robots.txt)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCurrentPrice(url: string, timeoutMs: number): Promise<number | null> {
  // Without a signal, a single stalled connection could block past this
  // route's own time budget (the budget is only re-checked at the top of
  // each loop iteration) all the way to Vercel's hard maxDuration kill,
  // losing the final sync_runs write for the whole run — not just skipping
  // this one card. AbortSignal.timeout() covers both the connection and the
  // body read (res.text()), since the same signal stays attached to the
  // in-flight request.
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) return null;
  const html = await res.text();
  const match = html.match(PRICE_PATTERN);
  if (!match) return null;
  return Number(match[1].replace(/,/g, ""));
}

function computeStats(history: { snapshot_date: string; price: number }[]) {
  const sorted = [...history].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const prices = sorted.map((h) => h.price);
  const last30 = prices.slice(-30);
  const last90 = prices.slice(-90);
  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const avg30 = avg(last30);
  const avg90 = avg(last90);
  const current = prices[prices.length - 1];
  const pctVsAvg30 = Math.round(((current - avg30) / avg30) * 1000) / 10;
  const pctVsAvg90 = Math.round(((current - avg90) / avg90) * 1000) / 10;
  const low30 = Math.min(...last30);
  const judgment: Judgment = pctVsAvg30 > 15 ? "割高" : pctVsAvg30 < -15 ? "割安" : "適正";
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

export async function GET(request: Request) {
  // Fail closed if CRON_SECRET isn't configured — comparing against
  // `Bearer ${undefined}` would otherwise accept a literal
  // "Authorization: Bearer undefined" header from anyone.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const startedAt = new Date().toISOString();
  const startTime = Date.now(); // before any DB/network I/O, so the budget covers all of it

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : null;

  // oldest-updated-first: if a single run can't cover every card within
  // the time budget, the cards it skips this time are exactly the ones
  // that'll be picked up first on the next run
  //
  // data_quality='real' only: the 2026-09-11 yuyu-tei expansion added 2,423
  // 'partial' cards that also carry a non-null source_url (pointing at
  // yuyu-tei.jp, not onepiece-card-atari.jp), which this route's
  // PRICE_PATTERN regex can never match. Without this filter every cron run
  // was quietly burning its time budget attempting ~2,400 fetches destined
  // to fail (each logged as a real fetch failure in sync_runs, and each a
  // real HTTP request against yuyu-tei.jp with no benefit), starving the
  // 844 cards this route can actually update. Tracking yuyu-tei prices on a
  // recurring daily basis is a separate, not-yet-decided project (see
  // COORDINATION.md / README.md "遊々亭ソースの法務リスクについて" — running
  // a permanent daily scraper against a live third-party shop is a bigger
  // commitment than the one-time bulk import already done, and needs the
  // user's own sign-off given the unresolved legal-risk question there).
  let query = supabase
    .from("cards")
    .select("id, name, source_url, history_is_estimated")
    .not("source_url", "is", null)
    .eq("data_quality", "real")
    .order("updated_at", { ascending: true });
  if (limit) query = query.limit(limit);
  const { data: cards, error: cardsErr } = await query;

  if (cardsErr || !cards) {
    return NextResponse.json({ error: cardsErr?.message ?? "no cards" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let successCount = 0;
  let failCount = 0;
  let skippedForTime = 0;
  const errorSamples: string[] = [];

  for (const card of cards) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIME_BUDGET_MS) {
      skippedForTime = cards.length - successCount - failCount;
      break;
    }
    try {
      const remainingMs = TIME_BUDGET_MS - elapsed;
      const timeoutMs = Math.max(1000, Math.min(PER_REQUEST_TIMEOUT_MS, remainingMs));
      const price = await fetchCurrentPrice(card.source_url as string, timeoutMs);
      if (price === null) throw new Error("price pattern not found");

      const { error: snapErr } = await supabase
        .from("price_snapshots")
        .upsert(
          { card_id: card.id, snapshot_date: today, price },
          { onConflict: "card_id,snapshot_date" }
        );
      if (snapErr) throw snapErr;

      const { data: history, error: historyErr } = await supabase
        .from("price_snapshots")
        .select("snapshot_date, price")
        .eq("card_id", card.id)
        .order("snapshot_date", { ascending: false })
        .limit(90);
      if (historyErr) throw historyErr;

      if (history && history.length > 0) {
        const stats = computeStats(history);
        // regenerate the verdict text from the SAME numbers being saved,
        // so it can never drift out of sync the way it would if left
        // untouched from card creation time
        const verdictText = buildVerdictText({
          name: card.name as string,
          currentPrice: stats.current_price,
          avg30: stats.avg30,
          avg90: stats.avg90,
          pctVsAvg30: stats.pct_vs_avg30,
          pctVsAvg90: stats.pct_vs_avg90,
          judgment: stats.judgment,
        });
        // history_is_estimated/source_note describe the OLD migration-era
        // methodology (2-week-interval snapshots interpolated to daily).
        // Once this card has a real cron-fetched price, that description is
        // stale — without this, cards kept showing a "推定値" disclaimer
        // forever even after weeks of genuine daily tracking, understating
        // the site's own data quality to users.
        const estimationFields = card.history_is_estimated
          ? { history_is_estimated: false, source_note: TRACKED_NOTE }
          : {};

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
          .eq("id", card.id);
        // without checking this, a failed update (RLS, network, whatever)
        // still fell through to successCount++ below — the card's own
        // stats/judgment/verdict would silently stay stale while the run
        // reported 100% success
        if (updateErr) throw updateErr;
      }

      successCount++;
    } catch (err) {
      failCount++;
      if (errorSamples.length < 10) {
        errorSamples.push(`${card.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    // polite rate limit — matches the plan's "1-2 seconds per request" commitment
    await sleep(1200);
  }

  const errorSample = [
    ...errorSamples,
    skippedForTime > 0
      ? `(time budget reached — ${skippedForTime} card(s) deferred to the next run)`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  const { error: syncRunErr } = await supabase.from("sync_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_count: cards.length,
    success_count: successCount,
    fail_count: failCount,
    error_sample: errorSample || null,
  });
  // The actual price-refresh work above already happened regardless of
  // whether this log write succeeds, so this still returns 200 (a Vercel
  // Cron retry wouldn't fix a logging failure, and treating the whole run
  // as failed would be misleading). But silently swallowing this error
  // meant /admin/sync-status could go dark with zero indication anywhere
  // that monitoring itself broke — surface it in the response instead.
  const syncRunLogged = !syncRunErr;

  return NextResponse.json({
    total: cards.length,
    success: successCount,
    failed: failCount,
    skippedForTime,
    errorSamples,
    syncRunLogged,
    ...(syncRunErr ? { syncRunLogError: syncRunErr.message } : {}),
  });
}
