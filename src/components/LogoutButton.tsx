"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getCurrentPushEndpoint } from "@/lib/webPushClient";

export default function LogoutButton() {
  const router = useRouter();
  const supabase = createClient();

  return (
    <button
      onClick={async () => {
        // Best-effort: delete this browser's push subscription row before
        // signing out. Must run before signOut() — the delete relies on
        // this session's own RLS grant ("users can delete their own push
        // subscriptions"), which disappears the moment signOut() clears it.
        // See getCurrentPushEndpoint()'s doc comment for why this matters
        // on a shared device.
        try {
          const endpoint = await getCurrentPushEndpoint();
          if (endpoint) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
          }
        } catch {
          // never block logout on this
        }
        await supabase.auth.signOut();
        router.refresh();
      }}
      className="text-ink-muted hover:text-ink"
    >
      ログアウト
    </button>
  );
}
