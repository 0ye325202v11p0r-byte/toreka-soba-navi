import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { isAdminUser } from "@/lib/adminAuth";
import SetupNotice from "@/components/SetupNotice";
import ResolveButtons from "./ResolveButtons";
import type { Message, Order, Profile } from "@/lib/types";

export const metadata = { title: "相談中の取引（管理）" };

// Delivered orders whose client asked the operator to step in (Phase 30).
// The operator isn't a party to these orders, so everything — including the
// messages they need to judge it — is read with the service-role client
// after the admin check.
export default async function AdminOrdersPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin/orders");
  if (!isAdminUser(user.email)) notFound();

  const admin = adminClient();
  const { data } = await admin
    .from("orders")
    .select("*")
    .eq("status", "delivered")
    .not("disputed_at", "is", null)
    .order("disputed_at", { ascending: true });
  const orders = (data ?? []) as Order[];

  const ids = orders.flatMap((o) => [o.client_id, o.craftsman_id]);
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as Pick<Profile, "id" | "display_name">[] };
  const nameOf = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));

  const { data: messagesRaw } = orders.length
    ? await admin
        .from("messages")
        .select("*")
        .in("order_id", orders.map((o) => o.id))
        .order("created_at", { ascending: true })
    : { data: [] as Message[] };
  const messages = (messagesRaw ?? []) as Message[];

  return (
    <div>
      <h1 className="text-2xl font-bold">相談中の取引</h1>
      <p className="mt-1 text-sm text-ink-muted">
        納品後に依頼者が「運営に相談する」を押した取引です。相談中は自動で完了しません。メッセージや反物チェック・仕様確認の記録を見て、必要なら双方に事情を聞いたうえで、和裁士に支払うか依頼者に返金するかを決めてください。
      </p>

      <ul className="mt-6 space-y-4">
        {orders.map((o) => (
          <li key={o.id} data-order-id={o.id} className="rounded-lg border border-border bg-bg-elevated p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-semibold">{o.title}</p>
              <p className="text-sm font-bold">¥{o.price.toLocaleString()}</p>
            </div>
            <p className="mt-1 text-xs text-ink-muted">
              依頼者: {nameOf.get(o.client_id) ?? "不明"} ・ 和裁士: {nameOf.get(o.craftsman_id) ?? "不明"} ・ 納品:{" "}
              {o.delivered_at?.slice(0, 10) ?? "-"} ・ 相談: {o.disputed_at?.slice(0, 10)} ・ 修正依頼: {o.revision_requests_used}/
              {o.revision_limit}回
            </p>
            {(o.fabric_check_notes || o.spec_confirmation_text) && (
              <div className="mt-2 space-y-1 text-xs">
                {o.fabric_check_notes && <p>反物チェックのメモ: {o.fabric_check_notes}</p>}
                {o.spec_confirmation_text && <p className="whitespace-pre-wrap">仕様確認: {o.spec_confirmation_text}</p>}
              </div>
            )}
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-link">取引メッセージを見る</summary>
              <ul className="mt-2 space-y-1">
                {messages
                  .filter((m) => m.order_id === o.id)
                  .map((m) => (
                    <li key={m.id} className="rounded bg-bg p-2 text-xs">
                      <span className="font-semibold">{nameOf.get(m.sender_id) ?? "不明"}</span>{" "}
                      <span className="text-ink-faint">{m.created_at.slice(0, 16).replace("T", " ")}</span>
                      <p className="mt-0.5 whitespace-pre-wrap">{m.body}</p>
                    </li>
                  ))}
              </ul>
            </details>
            <div className="mt-3">
              <ResolveButtons orderId={o.id} />
            </div>
          </li>
        ))}
        {orders.length === 0 && <p className="text-sm text-ink-muted">相談中の取引はありません。</p>}
      </ul>
    </div>
  );
}
