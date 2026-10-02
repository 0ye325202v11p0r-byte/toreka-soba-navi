"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface FavoriteState {
  error?: string;
}

// お気に入り (Phase 33 favorites): a client's own list of craftsmen, only
// ever visible to that client (RLS).
export async function toggleFavorite(_prevState: FavoriteState, formData: FormData): Promise<FavoriteState> {
  const craftsmanId = String(formData.get("craftsman_id") ?? "");
  const favorite = formData.get("favorite") === "true";
  if (!craftsmanId) return { error: "和裁士が見つかりません。" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "ログインが必要です。" };

  const { error } = favorite
    ? await supabase.from("favorites").upsert({ client_id: user.id, craftsman_id: craftsmanId }, { onConflict: "client_id,craftsman_id", ignoreDuplicates: true })
    : await supabase.from("favorites").delete().eq("client_id", user.id).eq("craftsman_id", craftsmanId);
  if (error) return { error: "お気に入りを更新できませんでした。" };

  revalidatePath(`/craftsmen/${craftsmanId}`);
  revalidatePath("/dashboard");
  return {};
}
