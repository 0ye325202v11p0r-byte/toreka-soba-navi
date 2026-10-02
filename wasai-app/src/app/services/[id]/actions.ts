"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { adminClient } from "@/lib/supabase/admin";
import { isStripeConfigured } from "@/lib/stripe";
import { createCheckoutSessionUrl } from "@/lib/orderPayment";
import { checkCraftsmanCanAcceptWork } from "@/lib/capacity";
import { validateUploadedFile, uploadUserFile, publicUrlFor } from "@/lib/storage";
import type { UploadState } from "@/app/dashboard/profile/uploadActions";

export interface OrderFromServiceState {
  error?: string;
}

export async function orderService(
  _prevState: OrderFromServiceState,
  formData: FormData
): Promise<OrderFromServiceState> {
  const serviceId = String(formData.get("service_id") ?? "");
  const desiredBy = String(formData.get("desired_by") ?? "").trim();
  if (!serviceId) return { error: "メニューが見つかりません。" };
  if (!isStripeConfigured()) return { error: "決済機能は準備中です。しばらくお待ちください。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/services/${serviceId}`);

  const { data: service, error: serviceError } = await supabase
    .from("services")
    .select("id, craftsman_id, title, price, garment_type, status, revision_count")
    .eq("id", serviceId)
    .maybeSingle();

  if (serviceError || !service || service.status !== "published") {
    return { error: "このメニューは現在申し込めません。" };
  }
  if (service.craftsman_id === user.id) {
    return { error: "自分のメニューには申し込めません。" };
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
      // The listing's 修正回数, fixed at order time (Phase 30).
      revision_limit: service.revision_count,
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

// メニューの写真 (Phase 34, services.image_url). Only the menu's own
// craftsman — checked here for a clear message, and by services RLS.
export async function setServiceImage(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const serviceId = String(formData.get("service_id") ?? "");
  const file = formData.get("file");
  if (!serviceId) return { error: "メニューが見つかりません。" };
  if (!(file instanceof File) || file.size === 0) return { error: "写真を選択してください。" };
  const validationError = validateUploadedFile(file, "image");
  if (validationError) return { error: validationError };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };
  const { data: service } = await supabase.from("services").select("craftsman_id").eq("id", serviceId).maybeSingle();
  if (!service || service.craftsman_id !== user.id) return { error: "自分のメニューにだけ写真を設定できます。" };

  try {
    const path = await uploadUserFile(supabase, "portfolio", user.id, file);
    const url = publicUrlFor(supabase, "portfolio", path);
    const { error } = await supabase.from("services").update({ image_url: url }).eq("id", serviceId).eq("craftsman_id", user.id);
    if (error) return { error: error.message };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "アップロードに失敗しました。" };
  }

  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/services");
  return {};
}

export async function removeServiceImage(_prevState: UploadState, formData: FormData): Promise<UploadState> {
  const serviceId = String(formData.get("service_id") ?? "");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };
  const { error } = await supabase.from("services").update({ image_url: null }).eq("id", serviceId).eq("craftsman_id", user.id);
  if (error) return { error: error.message };
  revalidatePath(`/services/${serviceId}`);
  revalidatePath("/services");
  return {};
}
