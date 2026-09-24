import type { SupabaseClient } from "@supabase/supabase-js";

// Shared by every place a craftsman could pick up new work (submitting a
// proposal, a client buying a service directly, a client accepting a
// proposal) — combines the manual is_accepting_orders switch with the
// automatic max_concurrent_orders cap so there's one answer to "can this
// craftsman take this on right now" instead of each call site guessing.
export async function checkCraftsmanCanAcceptWork(
  supabase: SupabaseClient,
  craftsmanId: string
): Promise<{ ok: boolean; reason?: string }> {
  const { data: profile } = await supabase
    .from("craftsman_profiles")
    .select("is_accepting_orders, max_concurrent_orders")
    .eq("profile_id", craftsmanId)
    .maybeSingle();

  if (profile?.is_accepting_orders === false) {
    return { ok: false, reason: "この和裁士は現在、新規受注を停止しています。" };
  }

  if (profile?.max_concurrent_orders != null) {
    const { count } = await supabase
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("craftsman_id", craftsmanId)
      .eq("status", "in_progress");
    if ((count ?? 0) >= profile.max_concurrent_orders) {
      return { ok: false, reason: "この和裁士は現在、同時受注の上限に達しています。" };
    }
  }

  return { ok: true };
}
