import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import PortfolioClient from "@/components/PortfolioClient";
import SetupNotice from "@/components/SetupNotice";

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

  const [{ data: items }, { data: cards }] = await Promise.all([
    supabase
      .from("portfolio_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("cards").select("id, name, rarity, set_name, current_price").order("name"),
  ]);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ポートフォリオ</h1>
      <p className="mb-6 text-sm text-ink-muted">
        ここに表示される内容はあなた専用です（Row Level Securityにより他のユーザーからは見えません）。
      </p>
      <PortfolioClient initialItems={items ?? []} cards={cards ?? []} />
    </div>
  );
}
