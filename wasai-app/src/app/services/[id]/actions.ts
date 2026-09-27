"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";
import { checkCraftsmanCanAcceptWork } from "@/lib/capacity";

export interface OrderFromServiceState {
  error?: string;
}

export async function orderService(
  _prevState: OrderFromServiceState,
  formData: FormData
): Promise<OrderFromServiceState> {
  const serviceId = String(formData.get("service_id") ?? "");
  const desiredBy = String(formData.get("desired_by") ?? "").trim();
  if (!serviceId) return { error: "サービスが見つかりません。" };
  if (!isStripeConfigured()) return { error: "決済機能は準備中です。しばらくお待ちください。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/services/${serviceId}`);

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, craftsman_id, title, price, garment_type, status")
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError || !service || service.status !== "published") {
    return { error: "このサービスは現在依頼できません。" };
  }
  if (service.craftsman_id === user.id) {
    return { error: "自分自身のサービスには依頼できません。" };
  }

  const capacityCheck = await checkCraftsmanCanAcceptWork(supabase, service.craftsman_id);
  if (!capacityCheck.ok) return { error: capacityCheck.reason };

  // Created with the service-role client: clients can no longer INSERT
  // orders directly (see Phase 29 in supabase/schema.sql — a direct insert
  // could set price/status/payment_status to anything). Everything written
  // here comes from the service row or the session, never the form.
  const { data: order, error } = await adminClient()
    .from("orders")
    .insert({
      client_id: user.id,
      craftsman_id: service.craftsman_id,
      service_id: service.id,
      title: service.title,
      garment_type: service.garment_type,
      price: service.price,
      status: "pending_payment",
      desired_by: desiredBy || null,
    })
    .select("id, title, price")
    .single();

  if (error) return { error: error.message };

  const checkoutUrl = await createCheckoutSessionUrl(supabase, order);
  redirect(checkoutUrl);
}
