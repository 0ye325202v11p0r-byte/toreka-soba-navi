import type { SupabaseClient } from "@supabase/supabase-js";
import { adminClient } from "@/lib/supabase/admin";

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

export interface ReviewWithContext {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  // What was made, so a review reads "浴衣 ・ 2026年10月" rather than a bare
  // star count. null if the order is gone.
  garment_type: string | null;
}

// Reviews someone received, newest first, with each one's garment type.
// Orders are readable only by their two parties (RLS), so the garment type
// is looked up with the service role — that one column and nothing else.
export async function getReviewsWithContext(
  supabase: SupabaseClient,
  revieweeId: string
): Promise<ReviewWithContext[]> {
  const { data } = await supabase
    .from("reviews")
    .select("id, order_id, rating, comment, created_at")
    .eq("reviewee_id", revieweeId)
    .order("created_at", { ascending: false });
  const reviews = data ?? [];
  if (reviews.length === 0) return [];
  const { data: orders } = await adminClient()
    .from("orders")
    .select("id, garment_type")
    .in(
      "id",
      reviews.map((r) => r.order_id)
    );
  const garmentByOrder = new Map((orders ?? []).map((o) => [o.id as string, o.garment_type as string | null]));
  return reviews.map((r) => ({
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    garment_type: garmentByOrder.get(r.order_id) ?? null,
  }));
}
