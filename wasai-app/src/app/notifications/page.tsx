import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getCurrentUser } from "@/lib/auth";
import SetupNotice from "@/components/SetupNotice";
import type { Notification } from "@/lib/types";

export const metadata = { title: "通知" };

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("ja-JP", {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function NotificationsPage() {
  if (!isSupabaseConfigured()) return <SetupNotice />;

  const current = await getCurrentUser();
  if (!current) redirect("/login?next=/notifications");

  const supabase = await createClient();

  const { data } = await supabase
    .from("notifications")
    .select("*")
    .eq("user_id", current.id)
    .order("created_at", { ascending: false })
    .returns<Notification[]>();
  const notifications = data ?? [];

  // Mark everything read after fetching, so this render still shows which
  // ones were unread — the NavBar badge reflects the post-visit state on
  // the next page load.
  const unreadIds = notifications.filter((n) => !n.read_at).map((n) => n.id);
  if (unreadIds.length > 0) {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">通知</h1>

      <ul className="mt-6 space-y-2">
        {notifications.map((n) => {
          const wasUnread = !n.read_at;
          const content = (
            <div
              className={
                wasUnread
                  ? "rounded-lg border border-link bg-link-soft p-4"
                  : "rounded-lg border border-border bg-bg-elevated p-4"
              }
            >
              <div className="flex items-center justify-between">
                <p className="font-semibold">{n.title}</p>
                <span className="text-xs text-ink-faint">{formatDateTime(n.created_at)}</span>
              </div>
              {n.body && <p className="mt-1 text-sm text-ink-muted">{n.body}</p>}
            </div>
          );
          return (
            <li key={n.id}>
                {n.link && n.link.startsWith("/") && !n.link.startsWith("//") ? (
                  <Link href={n.link}>{content}</Link>
                ) : (
                  content
                )}
              </li>
          );
        })}
        {notifications.length === 0 && (
          <p className="text-sm text-ink-muted">通知はまだありません。</p>
        )}
      </ul>
    </div>
  );
}
