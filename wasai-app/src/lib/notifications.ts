import { adminClient } from "@/lib/supabase/admin";

// Only a link inside this site: a notification is shown with its link as a
// clickable entry, so an outside URL would make it a phishing vector.
function isInternalLink(link: string): boolean {
  return link.startsWith("/") && !link.startsWith("//");
}

// Notifications are written with the service-role client only (Phase 32 in
// supabase/schema.sql drops the policy that let any signed-in user insert
// one — which let anyone send anyone a notification with any wording and
// link, e.g. a fake "運営からのお知らせ" pointing off-site). Every caller
// has already checked the action that triggers it.
//
// Best-effort — a failed notification insert must never break the action
// that triggered it (a proposal still gets submitted even if notifying its
// recipient fails), so this never throws.
export async function notify(params: {
  userId: string;
  type: string;
  title: string;
  body?: string;
  link?: string;
}): Promise<void> {
  try {
    await adminClient()
      .from("notifications")
      .insert({
        user_id: params.userId,
        type: params.type,
        title: params.title,
        body: params.body ?? null,
        link: params.link && isInternalLink(params.link) ? params.link : null,
      });
  } catch {
    // swallow — see comment above
  }
}
