import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import SetupNotice from "@/components/SetupNotice";
import StatusControls from "./StatusControls";
import MessageForm from "./MessageForm";
import ReviewForm from "./ReviewForm";
import type { Order, Message, Profile, Review } from "@/lib/types";

const STATUS_LABEL: Record<Order["status"], string> = {
  in_progress: "進行中",
  delivered: "納品済み・確認待ち",
  completed: "完了",
  cancelled: "キャンセル",
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const { id } = await params;
  const current = await getCurrentUser();
  if (!current) redirect(`/login?next=/orders/${id}`);

  const supabase = await createClient();

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", id)
    .maybeSingle<Order>();

  if (!order) notFound();

  const viewerRole = order.client_id === current.id ? "client" : "craftsman";
  const counterpartId = viewerRole === "client" ? order.craftsman_id : order.client_id;

  const { data: counterpart } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", counterpartId)
    .maybeSingle<Profile>();

  const { data: messagesRaw } = await supabase
    .from("messages")
    .select("*")
    .eq("order_id", id)
    .order("created_at", { ascending: true });
  const messages = (messagesRaw ?? []) as Message[];

  const { data: review } = await supabase
    .from("reviews")
    .select("*")
    .eq("order_id", id)
    .maybeSingle<Review>();

  return (
    <div>
      <p className="text-xs text-ink-muted">
        取引相手: {counterpart?.display_name ?? "不明"} ・ ステータス: {STATUS_LABEL[order.status]}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{order.title}</h1>
      <p className="mt-1 text-sm font-semibold">¥{order.price.toLocaleString()}</p>

      <div className="mt-4">
        <StatusControls orderId={order.id} status={order.status} viewerRole={viewerRole} />
      </div>

      <section className="mt-6">
        <h2 className="text-lg font-bold">メッセージ</h2>
        <div className="mt-3 max-h-96 space-y-3 overflow-y-auto rounded-lg border border-border bg-bg-elevated p-4">
          {messages.map((m) => (
            <div
              key={m.id}
              className={m.sender_id === current.id ? "ml-auto max-w-[80%] text-right" : "mr-auto max-w-[80%]"}
            >
              <p
                className={
                  m.sender_id === current.id
                    ? "inline-block rounded-lg bg-accent px-3 py-2 text-sm text-bg-elevated"
                    : "inline-block rounded-lg bg-bg-sunken px-3 py-2 text-sm"
                }
              >
                {m.body}
              </p>
            </div>
          ))}
          {messages.length === 0 && (
            <p className="text-sm text-ink-muted">まだメッセージはありません。</p>
          )}
        </div>
        <MessageForm orderId={order.id} />
      </section>

      {order.status === "completed" && viewerRole === "client" && (
        <section className="mt-6">{review ? (
          <p className="text-sm text-ink-muted">レビュー投稿済みです。ありがとうございました。</p>
        ) : (
          <ReviewForm orderId={order.id} />
        )}</section>
      )}
    </div>
  );
}
