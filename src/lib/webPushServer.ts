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
