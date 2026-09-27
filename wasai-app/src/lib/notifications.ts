import type { SupabaseClient } from "@supabase/supabase-js";

// Best-effort — a failed notification insert must never break the action
// that triggered it (a proposal still gets submitted even if notifying its
// recipient fails), so this never throws.
export async function notify(
  supabase: SupabaseClient,
  params: { userId: string; type: string; title: string; body?: string; link?: string }
): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      user_id: params.userId,
      type: params.type,
      title: params.title,
      body: params.body ?? null,
      link: params.link ?? null,
    });
  } catch {
    // swallow — see comment above
  }
}
