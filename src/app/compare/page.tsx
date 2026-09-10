import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import CompareClient from "@/components/CompareClient";

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
  const { data: cards } = await supabase
    .from("cards")
    .select("id, name, rarity, set_name, current_price, pct_vs_avg30, judgment")
    .order("name");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">複数カード比較</h1>
      <p className="mb-6 text-sm text-ink-muted">最大5枚まで選んで、価格推移を重ねて比較できます。</p>
      <CompareClient cards={cards ?? []} />
    </div>
  );
}
