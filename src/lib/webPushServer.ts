import webpush from "web-push";

// Shared server-side Web Push setup — extracted 2026-09-13 when the weekly-
// digest cron became the second route needing this exact configuration
// (check-watchlist/route.ts was the first), matching this project's
// established convention (see yuyuteiParser.ts's header comment) of
// sharing logic once a second copy would otherwise appear.
//
// Both env vars are simply unset in production until someone sets them
// there — every caller must treat `pushConfigured: false` as a normal,
// expected state to skip push-sending gracefully, never as an error.
const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
export const pushConfigured = Boolean(vapidPublicKey && vapidPrivateKey);

if (pushConfigured) {
  webpush.setVapidDetails(
    `mailto:${process.env.ADMIN_EMAIL || "admin@example.invalid"}`,
    vapidPublicKey!,
    vapidPrivateKey!
  );
}

export default webpush;

// push_subscriptions rows are inserted directly by the client
// (WatchlistClient.tsx), protected only by RLS's `user_id = auth.uid()`
// ownership check (supabase/schema.sql) — nothing stops an authenticated
// user from upserting a row whose `endpoint` is an arbitrary URL rather than
// a real browser-issued push-service endpoint. Every cron route below calls
// webpush.sendNotification(), which does an HTTP POST to that endpoint using
// this server's credentials — an unchecked endpoint would let a malicious
// user point the server's own outbound requests at an internal address
// (e.g. a cloud metadata service) whenever their own watchlist alert fires.
// Found via independent review, 2026-09-15.
//
// A real push-service endpoint is always a DNS hostname (fcm.googleapis.com,
// updates.push.services.mozilla.com, etc.) — never a bare IP literal — so
// rejecting IP-literal hosts closes off private ranges, loopback, and
// link-local (169.254.x.x, which covers cloud metadata services) in one
// check with zero cost to any legitimate subscription.
export function isSafePushEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost")) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // IPv4 literal
  if (host.startsWith("[")) return false; // any IPv6 literal
  return true;
}
