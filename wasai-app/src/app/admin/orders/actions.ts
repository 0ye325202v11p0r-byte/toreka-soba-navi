"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isAdminUser } from "@/lib/adminAuth";
import { releaseEscrowPayout, refundIfPaid } from "@/lib/escrow";
import { notify } from "@/lib/notifications";

export interface ResolveDisputeState {
  error?: string;
}

// The operator's decision on a disputed delivered order (Phase 30): pay the
// craftsman (complete) or refund the client (cancel). Runs on the
// service-role client — orders_guard_update deliberately lets neither party
// make these moves on a disputed order — after checking the caller is the
// admin via their own session, same shape as setGradeVerified.
export async function resolveDispute(
  _prevState: ResolveDisputeState,
  formData: FormData
): Promise<ResolveDisputeState> {
  const orderId = String(formData.get("order_id") ?? "");
  const decision = String(formData.get("decision") ?? "");
  if (!orderId || (decision !== "completed" && decision !== "cancelled")) return { error: "不正なリクエストです。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!isAdminUser(user?.email)) return { error: "権限がありません。" };

  const admin = adminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, client_id, craftsman_id, title, price, status, payment_status, stripe_payment_intent_id, platform_fee_amount, disputed_at")
    .eq("id", orderId)
    .maybeSingle();
  if (!order || order.status !== "delivered" || !order.disputed_at) {
    return { error: "相談中の納品済み取引ではありません（すでに解決済みかもしれません）。" };
  }

  // Conditional on still being delivered, so a client completing it at the
  // same moment can't lead to both a payout and a refund.
  const { data: updated, error } = await admin
    .from("orders")
    .update({
      status: decision,
      completed_at: decision === "completed" ? new Date().toISOString() : null,
    })
    .eq("id", orderId)
    .eq("status", "delivered")
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "取引の状態が変わっています。画面を更新してください。" };

  if (decision === "completed") await releaseEscrowPayout(admin, order);
  else await refundIfPaid(admin, order);

  const title = decision === "completed" ? "運営の判断により取引が完了しました" : "運営の判断により取引がキャンセル（返金）されました";
  for (const userId of [order.client_id, order.craftsman_id]) {
    await notify({ userId, type: `order_dispute_${decision}`, title, body: order.title, link: `/orders/${orderId}` });
  }

  revalidatePath("/admin/orders");
  return {};
}
