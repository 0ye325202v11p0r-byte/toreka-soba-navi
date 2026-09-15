import type { SupabaseClient } from "@supabase/supabase-js";

export interface RatingSummary {
  average: number | null;
  count: number;
}

// Generic over who's being rated — a craftsman (reviewed by clients) or a
// client (reviewed by craftsmen); reviews are bidirectional (see
// supabase/schema.sql Phase 7).
export async function getRatingSummary(
  supabase: SupabaseClient,
  revieweeId: string
): Promise<RatingSummary> {
  const { data } = await supabase.from("reviews").select("rating").eq("reviewee_id", revieweeId);

  const ratings = (data ?? []).map((r) => r.rating as number);
  if (ratings.length === 0) return { average: null, count: 0 };

  const average = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  return { average, count: ratings.length };
}
