"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured, platformFeeAmount, stripeClient } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";

async function loadOrderForParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  userId: string
) {
  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, craftsman_id, title, price, status, payment_status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || (order.client_id !== userId && order.craftsman_id !== userId)) return null;
  return order;
}

export interface CheckoutRetryState {
  error?: string;
}

// Re-derives a Checkout session for an order that's still pending_payment —
// used when the client landed back on the order page without finishing the
// original redirect (closed the tab, hit back, the link expired, ...).
export async function createCheckoutForOrder(
  _prevState: CheckoutRetryState,
  formData: FormData
): Promise<CheckoutRetryState> {
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "取引が見つかりません。" };
  if (!isStripeConfigured()) return { error: "決済機能は準備中です。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const order = await loadOrderForParticipant(supabase, orderId, user.id);
  if (!order || order.client_id !== user.id) return { error: "この操作を行う権限がありません。" };
  if (order.status !== "pending_payment") return { error: "この取引はすでに支払い済みです。" };

  const checkoutUrl = await createCheckoutSessionUrl(supabase, order);
  redirect(checkoutUrl);
}

export interface MessageFormState {
  error?: string;
}

export async function postMessage(
  _prevState: MessageFormState,
  formData: FormData
): Promise<MessageFormState> {
  const orderId = String(formData.get("order_id") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!orderId) return { error: "取引が見つかりません。" };
  if (!body) return { error: "メッセージを入力してください。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const order = await loadOrderForParticipant(supabase, orderId, user.id);
  if (!order) return { error: "この取引にアクセスできません。" };

  const { error } = await supabase.from("messages").insert({
    order_id: orderId,
    sender_id: user.id,
    body,
  });
  if (error) return { error: error.message };

  revalidatePath(`/orders/${orderId}`);
  return {};
}

export interface StatusFormState {
  error?: string;
}

const ALLOWED_TRANSITIONS: Record<string, { by: "client" | "craftsman"; to: string }[]> = {
  pending_payment: [{ by: "client", to: "cancelled" }],
  in_progress: [
    { by: "craftsman", to: "delivered" },
    { by: "client", to: "cancelled" },
  ],
  delivered: [
    { by: "client", to: "completed" },
    { by: "client", to: "cancelled" },
  ],
};

export async function updateOrderStatus(
  _prevState: StatusFormState,
  formData: FormData
): Promise<StatusFormState> {
  const orderId = String(formData.get("order_id") ?? "");
  const nextStatus = String(formData.get("next_status") ?? "");
  if (!orderId || !nextStatus) return { error: "不正なリクエストです。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const order = await loadOrderForParticipant(supabase, orderId, user.id);
  if (!order) return { error: "この取引にアクセスできません。" };

  const actorRole = order.client_id === user.id ? "client" : "craftsman";
  const allowed = ALLOWED_TRANSITIONS[order.status] ?? [];
  const transition = allowed.find((t) => t.by === actorRole && t.to === nextStatus);
  if (!transition) return { error: "この操作は現在の状態では行えません。" };

  const { error } = await supabase
    .from("orders")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", orderId);
  if (error) return { error: error.message };

  if (nextStatus === "completed") {
    await releaseEscrowPayout(supabase, order);
  }

  revalidatePath(`/orders/${orderId}`);
  return {};
}

// Moves the held payment to the craftsman once the client confirms
// completion — a separate Stripe Transfer, not part of the original charge
// (see src/lib/orderPayment.ts), so this is the one place funds actually
// leave the platform's account. Best-effort: if the craftsman hasn't
// finished Stripe onboarding yet, this silently leaves payment_status at
// "paid" rather than blocking the client's "completed" action — there's
// nothing the client can do about the craftsman's account setup, and the
// payout can be retried later once payouts are set up (not yet automated;
// see README).
async function releaseEscrowPayout(
  supabase: Awaited<ReturnType<typeof createClient>>,
  order: { id: string; craftsman_id: string; price: number; payment_status: string }
) {
  if (!isStripeConfigured() || order.payment_status !== "paid") return;

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("stripe_account_id, stripe_transfers_enabled")
    .eq("profile_id", order.craftsman_id)
    .maybeSingle();

  if (!craftsmanProfile?.stripe_account_id || !craftsmanProfile.stripe_transfers_enabled) return;

  const fee = platformFeeAmount(order.price);
  const transferAmount = order.price - fee;
  if (transferAmount <= 0) return;

  const stripe = stripeClient();
  const transfer = await stripe.transfers.create({
    amount: transferAmount,
    currency: "jpy",
    destination: craftsmanProfile.stripe_account_id,
    transfer_group: order.id,
  });

  await supabase
    .from("orders")
    .update({
      payment_status: "transferred",
      stripe_transfer_id: transfer.id,
      platform_fee_amount: fee,
    })
    .eq("id", order.id);
}

export interface ReviewFormState {
  error?: string;
}

export async function submitReview(
  _prevState: ReviewFormState,
  formData: FormData
): Promise<ReviewFormState> {
  const orderId = String(formData.get("order_id") ?? "");
  const rating = Number(formData.get("rating"));
  const comment = String(formData.get("comment") ?? "").trim();

  if (!orderId) return { error: "取引が見つかりません。" };
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return { error: "評価は1〜5の数値で選択してください。" };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, craftsman_id, status")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.client_id !== user.id) return { error: "この操作を行う権限がありません。" };
  if (order.status !== "completed") return { error: "取引完了後にレビューできます。" };

  const { error } = await supabase.from("reviews").insert({
    order_id: orderId,
    reviewer_id: user.id,
    craftsman_id: order.craftsman_id,
    rating,
    comment: comment || null,
  });
  if (error) return { error: error.message };

  revalidatePath(`/orders/${orderId}`);
  return {};
}
