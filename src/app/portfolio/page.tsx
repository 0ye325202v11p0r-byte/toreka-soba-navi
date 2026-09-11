import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import PortfolioClient from "@/components/PortfolioClient";
import SetupNotice from "@/components/SetupNotice";
import { computePnl } from "@/lib/pnl";
import type { Transaction, DataQuality } from "@/lib/types";

export const metadata: Metadata = {
  title: "ポートフォリオ",
  description: "保有カードの含み損益・実現損益を自動計算します。",
};

export default async function PortfolioPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">ポートフォリオ</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
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
    }[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("cards")
        .select("id, name, rarity, set_name, current_price, data_quality")
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

  const pnl = computePnl(transactions);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ポートフォリオ</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ここに表示される内容はあなた専用です（Row Level Securityにより他のユーザーからは見えません）。売買を記録すると、確定損益（実現損益）として履歴に残り続けます。
      </p>
      <PortfolioClient transactions={transactions} cards={cards} pnl={pnl} />
    </div>
  );
}
