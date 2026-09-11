import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import WatchlistClient from "@/components/WatchlistClient";
import SetupNotice from "@/components/SetupNotice";
import type { DataQuality } from "@/lib/types";

export const metadata: Metadata = {
  title: "ウォッチリスト",
  description: "価格が指定の条件を満たしたら知らせる、監視リストです。",
};

export default async function WatchlistPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">ウォッチリスト</h1>
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
      pct_vs_avg30: number | null;
      current_price: number | null;
      data_quality: DataQuality | null;
    }[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("cards")
        .select("id, name, rarity, set_name, pct_vs_avg30, current_price, data_quality")
        .order("name")
        .order("id") // deterministic tiebreak for range() pagination
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all = all.concat(data ?? []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [{ data: items }, cards] = await Promise.all([
    supabase
      .from("watchlist_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    fetchAllCards(),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ウォッチリスト</h1>
      <p className="mb-6 text-sm text-ink-muted">
        条件を登録すると、毎日の価格更新後に自動でチェックされ、成立していればこのページに表示されます。メール通知（Phase 4）は未実装のため、今のところこのページを見に来る必要があります。
      </p>
      <WatchlistClient initialItems={items ?? []} cards={cards ?? []} />
    </div>
  );
}
