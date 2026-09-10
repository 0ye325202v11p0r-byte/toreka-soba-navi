import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import WatchlistClient from "@/components/WatchlistClient";
import SetupNotice from "@/components/SetupNotice";

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

  const [{ data: items }, { data: cards }] = await Promise.all([
    supabase
      .from("watchlist_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("cards").select("id, name, rarity, set_name, pct_vs_avg30").order("name"),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ウォッチリスト</h1>
      <p className="mb-6 text-sm text-ink-muted">
        条件を登録すると、価格自動更新（Phase 2）稼働後は毎日チェックされ、条件成立時にメール通知（Phase 4）が届くようになります。
      </p>
      <WatchlistClient initialItems={items ?? []} cards={cards ?? []} />
    </div>
  );
}
