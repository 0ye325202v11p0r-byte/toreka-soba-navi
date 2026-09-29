"use server";

import { revalidatePath } from "next/cache";
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

export interface ManageServiceState {
  error?: string;
}

// Owner-only: take a listing down (draft = hidden from everyone but its
// craftsman, per services_select_published_or_own) or put it back up.
export async function setServiceStatus(
  _prevState: ManageServiceState,
  formData: FormData
): Promise<ManageServiceState> {
  const serviceId = String(formData.get("service_id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!serviceId || (status !== "draft" && status !== "published")) return { error: "不正なリクエストです。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: updated, error } = await supabase
    .from("services")
    .update({ status })
    .eq("id", serviceId)
    .eq("craftsman_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!updated) return { error: "この操作を行う権限がありません。" };

  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/dashboard");
  return {};
}

// Owner-only. Past orders keep their own title/price and only lose the
// link back to the listing (orders.service_id is ON DELETE SET NULL). That
// SET NULL is an UPDATE on orders, which orders_guard_update (Phase 29)
// rejects for signed-in users — so the delete itself runs on the service-role
// client, after ownership is checked here.
export async function deleteService(
  _prevState: ManageServiceState,
  formData: FormData
): Promise<ManageServiceState> {
  const serviceId = String(formData.get("service_id") ?? "");
  if (!serviceId) return { error: "不正なリクエストです。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: owned } = await supabase
    .from("services")
    .select("id")
    .eq("id", serviceId)
    .eq("craftsman_id", user.id)
    .maybeSingle();
  if (!owned) return { error: "この操作を行う権限がありません。" };

  const { data: deleted, error } = await adminClient()
    .from("services")
    .delete()
    .eq("id", serviceId)
    .eq("craftsman_id", user.id)
    .select("id")
    .maybeSingle();
  if (error) return { error: error.message };
  if (!deleted) return { error: "この操作を行う権限がありません。" };

  revalidatePath("/dashboard");
  redirect("/dashboard");
}
