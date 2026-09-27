"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";
import { notify } from "@/lib/notifications";
import { releaseEscrowPayout, refundIfPaid } from "@/lib/escrow";
import { containsContactInfo, CONTACT_INFO_ERROR } from "@/lib/contactInfoFilter";
import { validateUploadedFile, uploadUserFile, publicUrlFor } from "@/lib/storage";

async function loadOrderForParticipant(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string,
  userId: string
) {
  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, client_id, craftsman_id, title, price, status, payment_status, stripe_payment_intent_id, platform_fee_amount, fabric_check_completed_at, fabric_check_approved_at, spec_confirmed_at, spec_approved_at"
    )
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

  // Contact info is blocked only until money has actually moved — once
  // payment_status leaves "unpaid" it's often legitimately needed (a
  // delivery address, a phone number for a courier), and the platform has
  // already captured this transaction either way.
  if (order.payment_status === "unpaid" && containsContactInfo(body)) {
    return { error: CONTACT_INFO_ERROR };
  }

  const { error } = await supabase.from("messages").insert({
    order_id: orderId,
    sender_id: user.id,
    body,
  });
  if (error) return { error: error.message };

  const recipientId = order.client_id === user.id ? order.craftsman_id : order.client_id;
  await notify(supabase, {
    userId: recipientId,
    type: "new_message",
    title: "新しいメッセージが届きました",
    body: order.title,
    link: `/orders/${orderId}`,
  });

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
    // A craftsman who can't continue (illness, etc.) needs their own way
    // out too — previously only the client could cancel, which left a
    // craftsman with no self-service option but to simply never deliver.
    { by: "craftsman", to: "cancelled" },
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

  // Cut-before-lock: once a fabric check has been recorded, delivering
  // (implying cutting/work has proceeded) is blocked until the client has
  // signed off on it — enforced here too, not just hidden in the UI, since
  // a disabled button is not a real guarantee.
  if (nextStatus === "delivered" && order.fabric_check_completed_at && !order.fabric_check_approved_at) {
    return { error: "依頼者が反物チェックの内容を承認するまで、納品操作はできません。" };
  }
  if (nextStatus === "delivered" && order.spec_confirmed_at && !order.spec_approved_at) {
    return { error: "依頼者が仕様の最終確認を承認するまで、納品操作はできません。" };
  }

  // Optional, only meaningful on the "delivered" transition — no carrier
  // integration, just a free-text paper trail so "納品する" isn't purely
  // the craftsman's word with nothing to point to if the client disputes
  // it later.
  const shippingMethod = String(formData.get("shipping_method") ?? "").trim();
  const trackingNumber = String(formData.get("tracking_number") ?? "").trim();
  const declaredValueRaw = String(formData.get("declared_value") ?? "").trim();
  const declaredValue = declaredValueRaw && Number.isFinite(Number(declaredValueRaw))
    ? Number(declaredValueRaw)
    : null;

  const { error } = await supabase
    .from("orders")
    .update({
      status: nextStatus,
      completed_at: nextStatus === "completed" ? new Date().toISOString() : null,
      delivered_at: nextStatus === "delivered" ? new Date().toISOString() : undefined,
      shipping_method: nextStatus === "delivered" ? shippingMethod || null : undefined,
      tracking_number: nextStatus === "delivered" ? trackingNumber || null : undefined,
      declared_value: nextStatus === "delivered" ? declaredValue : undefined,
    })
    .eq("id", orderId);
  if (error) return { error: error.message };

  // Service-role client: payment_status/stripe_transfer_id are writable only
  // by service role (Phase 29 in supabase/schema.sql). The status change
  // above already went through the user's own client and the DB-side
  // transition check, so this only runs for a legitimate transition.
  if (nextStatus === "completed") {
    await releaseEscrowPayout(adminClient(), order);
  }
  if (nextStatus === "cancelled") {
    await refundIfPaid(adminClient(), order);
  }

  // cancelled can now come from either side (see ALLOWED_TRANSITIONS above)
  // — notify whichever party didn't do the cancelling.
  const counterpartId = actorRole === "client" ? order.craftsman_id : order.client_id;
  const STATUS_NOTIFICATIONS: Record<string, { userId: string; title: string }> = {
    delivered: { userId: order.client_id, title: "納品されました" },
    completed: { userId: order.craftsman_id, title: "取引が完了しました" },
    cancelled: { userId: counterpartId, title: "取引がキャンセルされました" },
  };
  const statusNotification = STATUS_NOTIFICATIONS[nextStatus];
  if (statusNotification) {
    await notify(supabase, {
      userId: statusNotification.userId,
      type: `order_${nextStatus}`,
      title: statusNotification.title,
      body: order.title,
      link: `/orders/${orderId}`,
    });
  }

  revalidatePath(`/orders/${orderId}`);
  return {};
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
  if (!order || (order.client_id !== user.id && order.craftsman_id !== user.id)) {
    return { error: "この操作を行う権限がありません。" };
  }
  if (order.status !== "completed") return { error: "取引完了後にレビューできます。" };

  const revieweeId = order.client_id === user.id ? order.craftsman_id : order.client_id;

  const { error } = await supabase.from("reviews").insert({
    order_id: orderId,
    reviewer_id: user.id,
    reviewee_id: revieweeId,
    rating,
    comment: comment || null,
  });
  if (error) {
    if (error.code === "23505") return { error: "この取引には既にレビュー済みです。" };
    return { error: error.message };
  }

  revalidatePath(`/orders/${orderId}`);
  return {};
}

export interface FabricCheckState {
  error?: string;
}

// One-time record of the fabric's condition on receipt, filed by the
// craftsman before work starts — the point of it is to have a timestamped,
// both-parties-visible snapshot to point back to instead of a later
// "it was already damaged" / "you didn't send enough" argument. Deliberately
// write-once: allowing edits after the fact would defeat the purpose.
export async function submitFabricCheck(
  _prevState: FabricCheckState,
  formData: FormData
): Promise<FabricCheckState> {
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "取引が見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, craftsman_id, status, fabric_check_completed_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.craftsman_id !== user.id) return { error: "この操作を行う権限がありません。" };
  if (order.status !== "in_progress") return { error: "進行中の取引でのみ記録できます。" };
  if (order.fabric_check_completed_at) return { error: "すでに記録済みです。" };

  const damage = formData.get("damage") === "on";
  const shortage = formData.get("shortage") === "on";
  const odor = formData.get("odor") === "on";
  const notes = String(formData.get("notes") ?? "").trim();
  if (containsContactInfo(notes)) return { error: CONTACT_INFO_ERROR };

  const files = formData.getAll("photos").filter((f): f is File => f instanceof File && f.size > 0);
  for (const file of files) {
    const validationError = validateUploadedFile(file, "image");
    if (validationError) return { error: validationError };
  }

  const photoUrls: string[] = [];
  try {
    for (const file of files) {
      const path = await uploadUserFile(supabase, "fabric-checks", user.id, file);
      photoUrls.push(publicUrlFor(supabase, "fabric-checks", path));
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : "写真のアップロードに失敗しました。" };
  }

  const { error: updateError } = await supabase
    .from("orders")
    .update({
      fabric_check_damage: damage,
      fabric_check_shortage: shortage,
      fabric_check_odor: odor,
      fabric_check_notes: notes || null,
      fabric_check_photo_urls: photoUrls,
      fabric_check_completed_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .eq("status", "in_progress")
    .is("fabric_check_completed_at", null);
  if (updateError) return { error: updateError.message };

  revalidatePath(`/orders/${orderId}`);
  return {};
}

export interface FabricCheckApprovalState {
  error?: string;
}

// The client's sign-off that unblocks delivery (see the cut-before-lock
// check in updateOrderStatus above). Deliberately no separate "reject" —
// if something's off, that's exactly what the order chat is for; this isn't
// a dispute-resolution system, just the record of whether they've looked.
export async function approveFabricCheck(
  _prevState: FabricCheckApprovalState,
  formData: FormData
): Promise<FabricCheckApprovalState> {
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "取引が見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, craftsman_id, fabric_check_completed_at, fabric_check_approved_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.client_id !== user.id) return { error: "この操作を行う権限がありません。" };
  if (!order.fabric_check_completed_at) return { error: "まだ反物チェックが記録されていません。" };
  if (order.fabric_check_approved_at) return { error: "すでに承認済みです。" };

  const { error } = await supabase
    .from("orders")
    .update({ fabric_check_approved_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("fabric_check_approved_at", null);
  if (error) return { error: error.message };

  await notify(supabase, {
    userId: order.craftsman_id,
    type: "fabric_check_approved",
    title: "反物チェックが承認されました",
    body: "依頼者が反物の状態を確認しました。作業を進めてください。",
    link: `/orders/${orderId}`,
  });

  revalidatePath(`/orders/${orderId}`);
  return {};
}

export interface SpecConfirmationState {
  error?: string;
}

// The point of this isn't to add a step for its own sake — proposals and
// requests are just a price plus a free-text message, so the actual details
// (finish, special requests, whatever got hashed out in chat) usually never
// end up written down anywhere both sides can point back to. This is that
// write-once record, same idea as the fabric check. Price/delivery date
// changes after approval aren't handled here — that implies collecting
// additional payment, which needs its own design (see schema.sql comment).
export async function submitSpecConfirmation(
  _prevState: SpecConfirmationState,
  formData: FormData
): Promise<SpecConfirmationState> {
  const orderId = String(formData.get("order_id") ?? "");
  const specText = String(formData.get("spec_text") ?? "").trim();
  if (!orderId) return { error: "取引が見つかりません。" };
  if (!specText) return { error: "仕様の内容を入力してください。" };
  if (containsContactInfo(specText)) return { error: CONTACT_INFO_ERROR };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, craftsman_id, status, spec_confirmed_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.craftsman_id !== user.id) return { error: "この操作を行う権限がありません。" };
  if (order.status !== "in_progress") return { error: "進行中の取引でのみ記録できます。" };
  if (order.spec_confirmed_at) return { error: "すでに記録済みです。" };

  const { error } = await supabase
    .from("orders")
    .update({ spec_confirmation_text: specText, spec_confirmed_at: new Date().toISOString() })
    .eq("id", orderId)
    .eq("status", "in_progress")
    .is("spec_confirmed_at", null);
  if (error) return { error: error.message };

  await notify(supabase, {
    userId: order.client_id,
    type: "spec_confirmation_submitted",
    title: "仕様の最終確認が届いています",
    body: "内容をご確認のうえ、承認をお願いします。",
    link: `/orders/${orderId}`,
  });

  revalidatePath(`/orders/${orderId}`);
  return {};
}

export interface SpecApprovalState {
  error?: string;
}

export async function approveSpecConfirmation(
  _prevState: SpecApprovalState,
  formData: FormData
): Promise<SpecApprovalState> {
  const orderId = String(formData.get("order_id") ?? "");
  if (!orderId) return { error: "取引が見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: order } = await supabase
    .from("orders")
    .select("id, client_id, craftsman_id, spec_confirmed_at, spec_approved_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.client_id !== user.id) return { error: "この操作を行う権限がありません。" };
  if (!order.spec_confirmed_at) return { error: "まだ仕様確認が記録されていません。" };
  if (order.spec_approved_at) return { error: "すでに承認済みです。" };

  const { error } = await supabase
    .from("orders")
    .update({ spec_approved_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("spec_approved_at", null);
  if (error) return { error: error.message };

  await notify(supabase, {
    userId: order.craftsman_id,
    type: "spec_confirmation_approved",
    title: "仕様が承認されました",
    body: "依頼者が仕様内容を確認しました。作業を進めてください。",
    link: `/orders/${orderId}`,
  });

  revalidatePath(`/orders/${orderId}`);
  return {};
}
