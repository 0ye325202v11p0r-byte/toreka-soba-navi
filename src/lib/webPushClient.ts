// Client-side Web Push subscribe/unsubscribe helpers (added 2026-09-13),
// used by WatchlistClient.tsx. Kept separate from the component so the
// pure, easily-wrong-to-hand-write base64 conversion below is independently
// testable, matching this project's convention (pnl.ts/dashboardSummary.ts
// etc.) of pulling non-trivial logic out of components.

// The PushManager.subscribe() API requires applicationServerKey as a
// Uint8Array, but VAPID public keys are distributed as URL-safe base64
// strings (see NEXT_PUBLIC_VAPID_PUBLIC_KEY) — this is the standard
// conversion (URL-safe alphabet, '=' padding restored) every Web Push
// integration needs, copied nowhere else in this codebase, so it lives here
// once rather than inline in the component.
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export type PushSetupResult =
  | { ok: true; subscription: { endpoint: string; p256dh: string; authKey: string } }
  | { ok: false; reason: "unsupported" | "permission_denied" | "no_vapid_key" | "error"; message?: string };

// Registers the service worker (if not already), requests notification
// permission, subscribes via PushManager, and returns the raw subscription
// fields the caller should upsert into push_subscriptions — this function
// deliberately does NOT touch Supabase itself (keeps it testable/reusable
// and matches "one function, one concern").
export async function subscribeToPush(vapidPublicKey: string): Promise<PushSetupResult> {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    return { ok: false, reason: "unsupported" };
  }
  if (!vapidPublicKey) {
    return { ok: false, reason: "no_vapid_key" };
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, reason: "permission_denied" };
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    // waitUntil-style readiness — subscribing before the worker is fully
    // active can fail on some browsers.
    await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    const subscription =
      existing ??
      (await registration.pushManager.subscribe({
        userVisibleOnly: true,
        // Cast to BufferSource: TS's DOM lib types this param stricter than
        // a plain Uint8Array's generic ArrayBufferLike backing satisfies
        // (a known TS/lib.dom.d.ts friction point, not a real runtime
        // concern — a freshly-constructed Uint8Array is always backed by a
        // real ArrayBuffer, never a SharedArrayBuffer).
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey) as BufferSource,
      }));
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      return { ok: false, reason: "error", message: "subscription missing required fields" };
    }
    return {
      ok: true,
      subscription: { endpoint: json.endpoint, p256dh: json.keys.p256dh, authKey: json.keys.auth },
    };
  } catch (e) {
    return { ok: false, reason: "error", message: e instanceof Error ? e.message : String(e) };
  }
}
