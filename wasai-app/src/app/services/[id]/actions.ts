"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface OrderFromServiceState {
  error?: string;
}

export async function orderService(
  _prevState: OrderFromServiceState,
  formData: FormData
): Promise<OrderFromServiceState> {
  const serviceId = String(formData.get("service_id") ?? "");
  if (!serviceId) return { error: "サービスが見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/services/${serviceId}`);

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, craftsman_id, title, price, status")
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError || !service || service.status !== "published") {
    return { error: "このサービスは現在依頼できません。" };
  }
  if (service.craftsman_id === user.id) {
    return { error: "自分自身のサービスには依頼できません。" };
  }

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      client_id: user.id,
      craftsman_id: service.craftsman_id,
      service_id: service.id,
      title: service.title,
      price: service.price,
      status: "in_progress",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/orders/${order.id}`);
}
