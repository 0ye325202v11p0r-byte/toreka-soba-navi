import type { SupabaseClient } from "@supabase/supabase-js";
import { AUTO_COMPLETE_AFTER_DAYS } from "@/lib/escrow";

// The pre-payment disclosures 特定商取引法12条の6 asks for on the final
// confirmation screen (quantity, price, payment method/timing, when the
// service is provided, cancellation terms, and which click places the
// order). Shown on-site next to every button that leads to Stripe Checkout
// (PrePaymentSummary) and again on Checkout itself next to its pay button
// (checkoutSubmitMessage), so both screens say the same thing.

export function deliveryNote({
  deliveryDays,
  desiredBy,
}: {
  deliveryDays?: number | null;
  desiredBy?: string | null;
}): string {
  if (deliveryDays) {
    return `納期目安は約${deliveryDays}日です（和裁士の表示。着物・反物が和裁士に届く日などにより前後します）。具体的な日程は取引メッセージで和裁士と調整します。`;
  }
  if (desiredBy) {
    return `ご依頼時の希望納期（${desiredBy}）と和裁士の提案内容を目安に、具体的な日程は取引メッセージで和裁士と調整します。`;
  }
  return "和裁士の提案内容を目安に、具体的な日程は取引メッセージで和裁士と調整します。";
}

export const CANCELLATION_SUMMARY = `お支払い前はいつでも取りやめられます（代金は発生しません）。お支払い後も、依頼者が完了を確認するまではキャンセルでき、代金は全額返金されます（和裁士の納品操作から${AUTO_COMPLETE_AFTER_DAYS}日たつと自動的に完了となり、それ以降はキャンセルできません）。作業の一部が済んでいた場合の費用や着物の返送は、和裁士と話し合って決めていただきます。`;

export const ORDER_CONFIRMATION_POINT =
  "このボタンを押しても代金は発生しません。次に表示される決済画面（決済代行会社Stripeの画面）で「支払う」を押し、決済が完了した時点でお申込みが確定します。";

export function checkoutSubmitMessage(delivery: string): string {
  return [
    "「支払う」を押して決済が完了した時点で、お申込み（和裁士との取引）が確定します。",
    "数量：1件。お支払いは上記の金額のみで、手数料などを別に請求することはありません（着物の送料は和裁士との取り決めによります）。",
    `提供時期：${delivery}`,
    `キャンセル：${CANCELLATION_SUMMARY}`,
  ].join("\n");
}

// Service orders carry the listing's 納期目安; orders from a proposal only
// have the request's desired date. A listing hidden since (draft) isn't
// readable by the client under RLS — fall back to the desired date then.
export async function loadDeliveryNote(
  supabase: SupabaseClient,
  order: { service_id?: string | null; desired_by?: string | null }
): Promise<string> {
  let deliveryDays: number | null = null;
  if (order.service_id) {
    const { data: service } = await supabase
      .from("services")
      .select("delivery_days")
      .eq("id", order.service_id)
      .maybeSingle();
    deliveryDays = service?.delivery_days ?? null;
  }
  return deliveryNote({ deliveryDays, desiredBy: order.desired_by });
}
