import { NextResponse } from "next/server";
import { adminClient } from "@/lib/supabase/admin";
import { AUTO_COMPLETE_AFTER_DAYS, releaseEscrowPayout, releasePendingPayouts } from "@/lib/escrow";
import { notify } from "@/lib/notifications";

// A "delivered" order can only be advanced by the client (see
// ALLOWED_TRANSITIONS in src/app/orders/[id]/actions.ts) — if the client
// goes silent, the craftsman has done the work but has no way to ever get
// paid. This daily job auto-completes anything left in "delivered" for
// AUTO_COMPLETE_AFTER_DAYS and releases the held payment, same as if the
// client had clicked "confirm". (The /terms page quotes the same number.)
export async function GET(request: Request) {
  // Fail closed if CRON_SECRET isn't configured — comparing against
  // `Bearer ${undefined}` would otherwise accept a literal
  // "Authorization: Bearer undefined" header from anyone.
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get("authorization");
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const supabase = adminClient();
  const cutoff = new Date(Date.now() - AUTO_COMPLETE_AFTER_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleOrders, error } = await supabase
    .from("orders")
    .select("id, client_id, craftsman_id, title, price, payment_status, stripe_payment_intent_id, platform_fee_amount")
    .eq("status", "delivered")
    // The client asked the operator to step in — wait for their decision.
    .is("disputed_at", null)
    .lt("delivered_at", cutoff);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let completedCount = 0;
  for (const order of staleOrders ?? []) {
    const { data: updated, error: updateError } = await supabase
      .from("orders")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", order.id)
      .eq("status", "delivered") // guard against a race with a client action in between
      .is("disputed_at", null) // ...including a dispute opened since the select above
      .select("id")
      .maybeSingle();
    // No row back = the client completed or cancelled it in the meantime;
    // that action already handled the payout/refund.
    if (updateError || !updated) continue;

    await releaseEscrowPayout(supabase, order);
    await notify(supabase, {
      userId: order.craftsman_id,
      type: "order_auto_completed",
      title: "取引が自動的に完了しました",
      body: `${order.title} — 納品から${AUTO_COMPLETE_AFTER_DAYS}日間、依頼者からの応答がなかったため自動的に完了扱いとなりました。`,
      link: `/orders/${order.id}`,
    });
    await notify(supabase, {
      userId: order.client_id,
      type: "order_auto_completed",
      title: "取引が自動的に完了しました",
      body: `${order.title} — 納品から${AUTO_COMPLETE_AFTER_DAYS}日間応答が無かったため、自動的に完了扱いとしました。`,
      link: `/orders/${order.id}`,
    });
    completedCount += 1;
  }

  // Sweep: completed orders whose payout didn't go out at completion time
  // (craftsman not yet onboarded then, or a failed transfer call).
  await releasePendingPayouts(supabase);

  return NextResponse.json({ checked: staleOrders?.length ?? 0, completed: completedCount });
}
