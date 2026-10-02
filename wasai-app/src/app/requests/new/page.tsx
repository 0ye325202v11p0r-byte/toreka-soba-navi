import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import RequestForm, { type ConsultMenu } from "./RequestForm";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "依頼を投稿する" };

export default async function NewRequestPage({
  searchParams,
}: {
  searchParams: Promise<{ to?: string; menu?: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { to, menu: menuId } = await searchParams;
  const current = await getCurrentUser();
  if (!current?.profile) {
    const qs = new URLSearchParams();
    if (to) qs.set("to", to);
    if (menuId) qs.set("menu", menuId);
    const here = "/requests/new" + (qs.size ? `?${qs}` : "");
    redirect(`/login?next=${encodeURIComponent(here)}`);
  }
  if (current.profile.role !== "client") {
    redirect("/dashboard");
  }

  // ?to=<craftsman id> from a craftsman's page: 「この和裁士に相談する」.
  // ?menu=<service id> as well from a 仕立てメニュー: 「このメニューで相談する」
  // (only when the menu is that craftsman's and still published).
  const supabase = await createClient();
  let directed: { id: string; name: string } | null = null;
  if (to) {
    const { data: target } = await supabase
      .from("profiles")
      .select("id, display_name")
      .eq("id", to)
      .eq("role", "craftsman")
      .maybeSingle();
    if (target) directed = { id: target.id, name: target.display_name };
  }
  let menu: ConsultMenu | undefined;
  if (directed && menuId) {
    const { data: service } = await supabase
      .from("services")
      .select("title, garment_type, price, delivery_days")
      .eq("id", menuId)
      .eq("craftsman_id", directed.id)
      .eq("status", "published")
      .maybeSingle();
    if (service) {
      menu = { title: service.title, garmentType: service.garment_type, price: service.price, deliveryDays: service.delivery_days };
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-bold">{directed ? `${directed.name}さんに相談する` : "依頼を投稿する"}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {directed
          ? "仕立てたいものや気になっていることを書いて送ってください。和裁士から見積り（提案）が届きます。"
          : "和裁士からの提案を待ちます。"}
      </p>
      <RequestForm directedTo={directed?.id} directedName={directed?.name} menu={menu} />
    </div>
  );
}
