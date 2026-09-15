"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface ServiceFormState {
  error?: string;
}

export async function createService(
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.role !== "craftsman") {
    return { error: "和裁士アカウントのみサービスを出品できます。" };
  }

  const title = String(formData.get("title") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const garmentType = String(formData.get("garment_type") ?? "").trim();
  const price = Number(formData.get("price"));
  const deliveryDays = Number(formData.get("delivery_days"));
  const revisionCount = Number(formData.get("revision_count") ?? 1);

  if (!title || !description || !garmentType) {
    return { error: "タイトル・説明・着物の種類は必須です。" };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { error: "価格を正しく入力してください。" };
  }
  if (!Number.isFinite(deliveryDays) || deliveryDays <= 0) {
    return { error: "納期日数を正しく入力してください。" };
  }

  const { data: service, error } = await supabase
    .from("services")
    .insert({
      craftsman_id: user.id,
      title,
      description,
      garment_type: garmentType,
      price,
      delivery_days: deliveryDays,
      revision_count: Number.isFinite(revisionCount) ? revisionCount : 1,
      status: "published",
    })
    .select("id")
    .single();

  if (error) return { error: error.message };

  redirect(`/services/${service.id}`);
}
