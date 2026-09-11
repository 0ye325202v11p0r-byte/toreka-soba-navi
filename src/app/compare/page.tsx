import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import CompareClient from "@/components/CompareClient";
import type { Judgment, DataQuality } from "@/lib/types";

export const metadata: Metadata = {
  title: "比較",
  description: "最大5枚のONE PIECEカードを選んで、価格推移を重ねて比較できます。",
};

export default async function ComparePage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">比較</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();

  // Supabase/PostgREST caps a single select() at 1000 rows by default; the
  // catalog passed 1000 cards in the 2026-09-11 expansion (3,270 total), so
  // this must page through results or the comparison picker silently loses
  // roughly two-thirds of the catalog.
  let cards: {
    id: string;
    name: string;
    rarity: string;
    set_name: string | null;
    current_price: number | null;
    pct_vs_avg30: number | null;
    judgment: Judgment | null;
    data_quality: DataQuality | null;
  }[] = [];
  {
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data } = await supabase
        .from("cards")
        .select("id, name, rarity, set_name, current_price, pct_vs_avg30, judgment, data_quality")
        .order("name")
        .range(from, from + pageSize - 1);
      cards = cards.concat(data ?? []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">複数カード比較</h1>
      <p className="mb-6 text-sm text-ink-muted">最大5枚まで選んで、価格推移を重ねて比較できます。</p>
      <CompareClient cards={cards ?? []} />
    </div>
  );
}
