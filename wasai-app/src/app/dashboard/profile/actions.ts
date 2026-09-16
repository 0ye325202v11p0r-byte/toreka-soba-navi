"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { GARMENT_TYPES, type Grade } from "@/lib/types";

export interface ProfileFormState {
  error?: string;
  success?: boolean;
}

export async function updateProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const displayName = String(formData.get("display_name") ?? "").trim();
  const prefecture = String(formData.get("prefecture") ?? "").trim();
  const bio = String(formData.get("bio") ?? "").trim();
  const avatarUrl = String(formData.get("avatar_url") ?? "").trim();

  if (!displayName) return { error: "表示名は必須です。" };

  const { error: profileError } = await supabase
    .from("profiles")
    .update({
      display_name: displayName,
      prefecture: prefecture || null,
      bio: bio || null,
      avatar_url: avatarUrl || null,
    })
    .eq("id", user.id);

  if (profileError) return { error: profileError.message };

  const role = String(formData.get("role") ?? "");
  if (role === "craftsman") {
    const grade = (String(formData.get("grade") ?? "") || null) as Grade | null;
    const yearsRaw = String(formData.get("years_experience") ?? "").trim();
    const yearsExperience = yearsRaw ? Number(yearsRaw) : null;
    const specialties = formData.getAll("specialties").map(String);
    const portfolioUrls = String(formData.get("portfolio_urls") ?? "")
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean);
    const isAcceptingOrders = formData.get("is_accepting_orders") === "on";
    const certificateUrl = String(formData.get("certificate_url") ?? "").trim() || null;

    const { error: craftsmanError } = await supabase
      .from("craftsman_profiles")
      .update({
        grade,
        years_experience: yearsExperience,
        specialties,
        portfolio_urls: portfolioUrls,
        is_accepting_orders: isAcceptingOrders,
        certificate_url: certificateUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("profile_id", user.id);

    if (craftsmanError) return { error: craftsmanError.message };

    // Replace-all, same pattern as specialties/portfolio_urls above — only
    // checked specialties can carry a rate, and re-checking an unchanged
    // specialty with no price simply clears any rate it had before.
    const newRates = GARMENT_TYPES.filter((g) => specialties.includes(g))
      .map((g) => {
        const raw = String(formData.get(`rate_${g}`) ?? "").trim();
        if (!raw) return null;
        const price = Number(raw);
        if (!Number.isFinite(price) || price < 0) return null;
        return { craftsman_id: user.id, garment_type: g, price };
      })
      .filter((r) => r !== null);

    const { error: deleteRatesError } = await supabase
      .from("craftsman_rates")
      .delete()
      .eq("craftsman_id", user.id);
    if (deleteRatesError) return { error: deleteRatesError.message };

    if (newRates.length > 0) {
      const { error: ratesError } = await supabase.from("craftsman_rates").insert(newRates);
      if (ratesError) return { error: ratesError.message };
    }
  }

  revalidatePath("/dashboard/profile");
  return { success: true };
}
