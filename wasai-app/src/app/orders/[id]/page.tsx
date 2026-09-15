import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import SetupNotice from "@/components/SetupNotice";
import StatusControls from "./StatusControls";
import MessageForm from "./MessageForm";
import ReviewForm from "./ReviewForm";
import PaymentRetryButton from "./PaymentRetryButton";
import { platformFeeAmount, PLATFORM_FEE_RATE, REPEAT_PLATFORM_FEE_RATE } from "@/lib/stripe";
import { isRepeatCustomer } from "@/lib/escrow";
import type { Order, Message, Profile, Review } from "@/lib/types";

const STATUS_LABEL: Record<Order["status"], string> = {
  pending_payment: "支払い待ち",
  in_progress: "進行中",
  delivered: "納品済み・確認待ち",
  completed: "完了",
  cancelled: "キャンセル",
};

const PAYMENT_STATUS_LABEL: Record<Order["payment_status"], string> = {
  unpaid: "未払い",
  paid: "支払い済み（プラットフォームで保管中）",
  transferred: "和裁士へ送金済み",
  refunded: "返金済み",
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

  const { data: reviewsRaw } = await supabase
    .from("reviews")
    .select("*")
    .eq("order_id", id)
    .returns<Review[]>();
  const myReview = (reviewsRaw ?? []).find((r) => r.reviewer_id === current.id);
  const revieweeLabel = viewerRole === "client" ? "この和裁士" : "この依頼者";

  const feeIsFinal = order.platform_fee_amount != null;
  const estimatedIsRepeat = feeIsFinal
    ? false
    : await isRepeatCustomer(supabase, order.client_id, order.craftsman_id, order.id);
  const feeRatePercent = feeIsFinal
    ? Math.round((order.platform_fee_amount! / order.price) * 100)
    : Math.round((estimatedIsRepeat ? REPEAT_PLATFORM_FEE_RATE : PLATFORM_FEE_RATE) * 100);
  const feeAmount = order.platform_fee_amount ?? platformFeeAmount(order.price, estimatedIsRepeat);

  return (
    <div>
      <p className="text-xs text-ink-muted">
        取引相手: {counterpart?.display_name ?? "不明"} ・ ステータス: {STATUS_LABEL[order.status]}
      </p>
      <h1 className="mt-1 text-2xl font-bold">{order.title}</h1>
      <p className="mt-1 text-sm font-semibold">¥{order.price.toLocaleString()}</p>
      <p className="mt-1 text-xs text-ink-muted">
        決済状況: {PAYMENT_STATUS_LABEL[order.payment_status]}
        {viewerRole === "craftsman" && order.payment_status !== "unpaid" && (
          <>
            {" "}
            （{feeIsFinal ? "手数料" : "手数料（概算）"} {feeRatePercent}%
            ¥{feeAmount.toLocaleString()} 差引後 ¥{(order.price - feeAmount).toLocaleString()}
            が振込先口座へ
            {estimatedIsRepeat && !feeIsFinal ? "・リピート割引適用" : ""}）
          </>
        )}
      </p>
      {order.payment_status !== "unpaid" && (
        <p className="mt-1">
          <Link href={`/orders/${order.id}/receipt`} className="text-xs text-accent-strong underline">
            取引明細書を表示
          </Link>
        </p>
      )}

      {order.status === "pending_payment" && viewerRole === "client" && (
        <div className="mt-4 rounded-lg border border-warn bg-warn-soft p-4">
          <p className="text-sm text-ink">支払いが完了していません。支払いが完了すると和裁士に作業を依頼できます。</p>
          <div className="mt-3">
            <PaymentRetryButton orderId={order.id} />
          </div>
        </div>
      )}
      {order.status === "pending_payment" && viewerRole === "craftsman" && (
        <p className="mt-4 rounded-lg border border-border bg-bg-elevated p-4 text-sm text-ink-muted">
          依頼者の支払い完了後に作業を開始できます。
        </p>
      )}

      {(order.shipping_method || order.tracking_number) && (
        <p className="mt-2 text-xs text-ink-muted">
          配送方法: {order.shipping_method || "未入力"}
          {order.tracking_number ? ` ・ 追跡番号: ${order.tracking_number}` : ""}
        </p>
      )}

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

      {order.status === "completed" && (
        <section className="mt-6">{myReview ? (
          <p className="text-sm text-ink-muted">レビュー投稿済みです。ありがとうございました。</p>
        ) : (
          <ReviewForm orderId={order.id} revieweeLabel={revieweeLabel} />
        )}</section>
      )}
    </div>
  );
}
