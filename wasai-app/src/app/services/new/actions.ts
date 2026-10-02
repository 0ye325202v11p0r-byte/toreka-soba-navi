"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { containsContactInfo, CONTACT_INFO_ERROR } from "@/lib/contactInfoFilter";
import { isValidOrderPrice, MIN_ORDER_PRICE } from "@/lib/stripe";
import { validateUploadedFile, uploadUserFile, publicUrlFor } from "@/lib/storage";

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
    return { error: "和裁士アカウントのみ仕立てメニューを作れます。" };
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
  if (containsContactInfo(title) || containsContactInfo(description)) {
    return { error: CONTACT_INFO_ERROR };
  }
  if (!isValidOrderPrice(price)) {
    return { error: `価格は${MIN_ORDER_PRICE}円以上の整数で入力してください。` };
  }
  if (!Number.isFinite(deliveryDays) || deliveryDays <= 0) {
    return { error: "納期日数を正しく入力してください。" };
  }
  // Optional photo (Phase 34). Checked before the menu is created so a bad
  // file is reported without leaving a half-made menu behind.
  const image = formData.get("image");
  const hasImage = image instanceof File && image.size > 0;
  if (hasImage) {
    const imageError = validateUploadedFile(image, "image");
    if (imageError) return { error: imageError };
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

  if (hasImage) {
    // Best-effort: the menu exists either way, and the photo can be added
    // again from the menu's page.
    try {
      const path = await uploadUserFile(supabase, "portfolio", user.id, image);
      await supabase
        .from("services")
        .update({ image_url: publicUrlFor(supabase, "portfolio", path) })
        .eq("id", service.id);
    } catch {
      // fall through to the menu page
    }
  }

  redirect(`/services/${service.id}`);
}
