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

  // Supabase/PostgREST caps a single select() at 1000 rows by default; the
  // catalog passed 1000 cards in the 2026-09-11 expansion (3,270 total), so
  // the cards list must page through results or the picker silently loses
  // roughly two-thirds of the catalog.
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
      const { data } = await supabase
        .from("cards")
        .select("id, name, rarity, set_name, current_price, data_quality")
        .order("name")
        .range(from, from + pageSize - 1);
      all = all.concat(data ?? []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [{ data: transactions }, cards] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .eq("user_id", user.id)
      .order("transaction_date", { ascending: false }),
    fetchAllCards(),
  ]);

  const pnl = computePnl((transactions ?? []) as Transaction[]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ポートフォリオ</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ここに表示される内容はあなた専用です（Row Level Securityにより他のユーザーからは見えません）。売買を記録すると、確定損益（実現損益）として履歴に残り続けます。
      </p>
      <PortfolioClient
        transactions={(transactions ?? []) as Transaction[]}
        cards={cards ?? []}
        pnl={pnl}
      />
    </div>
  );
}
