import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import PortfolioClient from "@/components/PortfolioClient";
import PortfolioValueChart from "@/components/PortfolioValueChart";
import HoldingsBreakdownPanel from "@/components/HoldingsBreakdownPanel";
import AnnualRealizedReport from "@/components/AnnualRealizedReport";
import SetupNotice from "@/components/SetupNotice";
import { computePnl } from "@/lib/pnl";
import { buildPortfolioValueHistory } from "@/lib/portfolioHistory";
import { buildHoldingsBreakdown } from "@/lib/holdingsBreakdown";
import { buildAnnualRealizedReport } from "@/lib/taxReport";
import type { Transaction, DataQuality, PriceSnapshot } from "@/lib/types";

export const metadata: Metadata = {
  title: "ポートフォリオ",
  description: "保有カードの含み損益・実現損益を自動計算します。",
};

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ card?: string }>;
}) {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">ポートフォリオ</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: { user } }, { card: requestedCardId }] = await Promise.all([
    supabase.auth.getUser(),
    searchParams,
  ]);

  // Forward ?card=ID through the login redirect (Codex independent review,
  // 2026-09-13 — see the identical fix/comment in watchlist/page.tsx). A
  // first-time visitor arriving via a card's "＋ 取引を記録" link was being
  // sent to a bare /login?next=/portfolio, losing which card they picked
  // and forcing them to search for and re-select it after logging in.
  if (!user) {
    const next = requestedCardId ? `/portfolio?card=${encodeURIComponent(requestedCardId)}` : "/portfolio";
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  const userId = user.id; // narrow once, outside the closures below — TS
  // can't carry the `user` non-null narrowing through a nested function

  // Supabase/PostgREST caps a single select() at 1000 rows by default; the
  // catalog passed 1000 cards in the 2026-09-11 expansion (3,270 total), so
  // the cards list must page through results or the picker silently loses
  // roughly two-thirds of the catalog. `id` is appended as a tiebreaker
  // because range()-based pagination needs a fully deterministic ORDER BY —
  // ties on `name` alone aren't guaranteed to come back in the same order
  // across the separate page requests, which could skip or duplicate rows.
  // A mid-pagination DB error throws (caught by app/error.tsx) instead of
  // silently returning a truncated list, per independent review feedback
  // (2026-09-11) on the identical gap in the transactions fetch below.
  async function fetchAllCards() {
    let all: {
      id: string;
      name: string;
      rarity: string;
      set_name: string | null;
      current_price: number | null;
      data_quality: DataQuality | null;
      source_url: string | null;
    }[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("cards")
        .select("id, name, rarity, set_name, current_price, data_quality, source_url")
        .order("name")
        .order("id")
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all = all.concat(data ?? []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  // Same 1000-row PostgREST cap as fetchAllCards above. Missed here
  // originally (caught by an independent review, 2026-09-11) — an active
  // trader with 1000+ buy/sell records would silently lose their oldest
  // transactions past row 1000, which is exactly the FIFO cost-basis data
  // computePnl needs: a sell with no matching buy lot in view gets ignored
  // rather than realized, quietly corrupting 実現損益/含み損益.
  //
  // Two more things the same review caught:
  // - `id` as a secondary sort key: transaction_date alone can tie (same
  //   day), and range()-based pagination needs a fully deterministic order
  //   to avoid skipping/duplicating rows across page requests.
  // - throwing on a mid-pagination error instead of silently returning
  //   whatever was fetched so far: this data feeds computePnl, so a
  //   partial result wouldn't just be an incomplete list, it would render
  //   as a confidently-wrong 含み損益/実現損益 with no indication anything
  //   was missing. Throwing here is caught by app/error.tsx instead.
  async function fetchAllTransactions() {
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
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all = all.concat((data ?? []) as Transaction[]);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [transactions, cards] = await Promise.all([fetchAllTransactions(), fetchAllCards()]);
  // Quick-add from a card detail page's "＋ 取引を記録" link (?card=ID,
  // added 2026-09-13) — validated against the real fetched `cards` list,
  // never trusted as-is from the URL. See watchlist/page.tsx for the
  // identical pattern.
  const initialCardId = cards.some((c) => c.id === requestedCardId) ? requestedCardId : undefined;

  const pnl = computePnl(transactions);

  // Evaluated-value history (added 2026-09-13) needs price data for every
  // card this user has EVER transacted, not just currently-held ones — a
  // past evaluation date can need the price of a card that's since been
  // fully sold. Scoped to exactly this user's own transacted card ids
  // (never the full ~3,270-card catalog), same reasoning as the
  // dashboard's own targeted queries.
  const transactedCardIds = Array.from(new Set(transactions.map((t) => t.card_id)));
  const snapshotsByCard = new Map<string, PriceSnapshot[]>();
  if (transactedCardIds.length > 0) {
    // Standard 1000-row PostgREST pagination — a single popular card could
    // accumulate hundreds of daily snapshots over time, and this queries
    // ALL of them across potentially several cards at once.
    let from = 0;
    const pageSize = 1000;
    while (true) {
      const { data, error } = await supabase
        .from("price_snapshots")
        .select("*")
        .in("card_id", transactedCardIds)
        .order("snapshot_date", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      for (const row of (data ?? []) as PriceSnapshot[]) {
        const list = snapshotsByCard.get(row.card_id) ?? [];
        list.push(row);
        snapshotsByCard.set(row.card_id, list);
      }
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }
  const valueHistory = buildPortfolioValueHistory(transactions, snapshotsByCard);
  const breakdown = buildHoldingsBreakdown(pnl.holdings, cards);
  const annualReport = buildAnnualRealizedReport(pnl.realizedEvents);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ポートフォリオ</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ここに表示される内容はあなた専用です（Row Level Securityにより他のユーザーからは見えません）。売買を記録すると、確定損益（実現損益）として履歴に残り続けます。
      </p>
      {valueHistory.length > 1 && (
        <div className="mb-6">
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">評価額の推移</h2>
          <PortfolioValueChart points={valueHistory} />
        </div>
      )}
      {pnl.holdings.length > 0 && (
        <div>
          <h2 className="mb-2 text-sm font-semibold text-ink-muted">構成内訳</h2>
          <HoldingsBreakdownPanel byRarity={breakdown.byRarity} bySet={breakdown.bySet} />
        </div>
      )}
      <AnnualRealizedReport years={annualReport} />
      <PortfolioClient transactions={transactions} cards={cards} pnl={pnl} initialCardId={initialCardId} />
    </div>
  );
}
