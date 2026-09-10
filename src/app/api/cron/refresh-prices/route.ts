import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export const maxDuration = 300; // seconds — 345 cards at ~1 req/sec needs headroom
export const dynamic = "force-dynamic";

// Server-only client with the service_role key (bypasses RLS). Never import
// this file from client code — it must only run in this route handler.
function adminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

const PRICE_PATTERN = /本日の販売平均額は([\d,]+)円です/;
const USER_AGENT =
  "TorekaSobaNaviBot/1.0 (+https://github.com/; daily price sync for a personal One Piece TCG tracker; respects robots.txt)";

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchCurrentPrice(url: string): Promise<number | null> {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
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

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const startedAt = new Date().toISOString();

  const url = new URL(request.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? Number(limitParam) : null;

  let query = supabase.from("cards").select("id, source_url").not("source_url", "is", null);
  if (limit) query = query.limit(limit);
  const { data: cards, error: cardsErr } = await query;

  if (cardsErr || !cards) {
    return NextResponse.json({ error: cardsErr?.message ?? "no cards" }, { status: 500 });
  }

  const today = new Date().toISOString().slice(0, 10);
  let successCount = 0;
  let failCount = 0;
  const errorSamples: string[] = [];

  for (const card of cards) {
    try {
      const price = await fetchCurrentPrice(card.source_url as string);
      if (price === null) throw new Error("price pattern not found");

      const { error: snapErr } = await supabase
        .from("price_snapshots")
        .upsert(
          { card_id: card.id, snapshot_date: today, price },
          { onConflict: "card_id,snapshot_date" }
        );
      if (snapErr) throw snapErr;

      const { data: history } = await supabase
        .from("price_snapshots")
        .select("snapshot_date, price")
        .eq("card_id", card.id)
        .order("snapshot_date", { ascending: false })
        .limit(90);

      if (history && history.length > 0) {
        const stats = computeStats(history);
        await supabase
          .from("cards")
          .update({ ...stats, updated_at: new Date().toISOString() })
          .eq("id", card.id);
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

  await supabase.from("sync_runs").insert({
    started_at: startedAt,
    finished_at: new Date().toISOString(),
    total_count: cards.length,
    success_count: successCount,
    fail_count: failCount,
    error_sample: errorSamples.join("\n") || null,
  });

  return NextResponse.json({
    total: cards.length,
    success: successCount,
    failed: failCount,
    errorSamples,
  });
}
