// Web Push service worker for watchlist alerts (added 2026-09-13). Plain
// JS, not TypeScript — service workers run outside Next.js's own bundling,
// served as a static file at the site root so its scope covers the whole
// origin (a service worker's default scope is the directory it's served
// from; `/sw.js` gives it `/`).
//
// Deliberately minimal: this project has no other offline/caching needs, so
// this worker does exactly one thing — turn an incoming push message into a
// visible notification, and route a click on it back into the app. It does
// NOT intercept fetch() or cache anything, so it can't accidentally serve
// stale pages.

self.addEventListener("push", (event) => {
  let payload = { title: "トレカ相場ナビ", body: "価格が条件を満たしました。", url: "/watchlist" };
  if (event.data) {
    try {
      payload = { ...payload, ...event.data.json() };
    } catch {
      // A push with a non-JSON body is unexpected for this app (the sender
      // always sends JSON — see check-watchlist/route.ts) — fall back to
      // the generic payload above rather than throwing and dropping the
      // notification entirely.
    }
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      icon: "/icon",
      data: { url: payload.url },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? "/watchlist";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        // Reuse an already-open tab on this origin rather than always
        // opening a new one — most users clicking a notification already
        // have the app open somewhere.
        if (client.url.includes(self.location.origin) && "focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
