"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isStripeConfigured } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";

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

  const { data: craftsmanProfile } = await supabase
    .from("craftsman_profiles")
    .select("is_accepting_orders")
    .eq("profile_id", service.craftsman_id)
    .maybeSingle();
  if (craftsmanProfile?.is_accepting_orders === false) {
    return { error: "この和裁士は現在、新規受注を停止しています。" };
  }

  const { data: order, error } = await supabase
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
