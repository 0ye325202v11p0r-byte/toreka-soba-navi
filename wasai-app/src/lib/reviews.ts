import type { SupabaseClient } from "@supabase/supabase-js";

export interface RatingSummary {
  average: number | null;
  count: number;
}

export async function getCraftsmanRatingSummary(
  supabase: SupabaseClient,
  craftsmanId: string
): Promise<RatingSummary> {
  const { data } = await supabase.from("reviews").select("rating").eq("craftsman_id", craftsmanId);

  const ratings = (data ?? []).map((r) => r.rating as number);
  if (ratings.length === 0) return { average: null, count: 0 };

  const average = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  return { average, count: ratings.length };
}
