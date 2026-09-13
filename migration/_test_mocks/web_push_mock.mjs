// Stand-in for "web-push", redirected to here by loader.mjs — used by
// verify_check_watchlist.mjs so sendNotification() calls in
// check-watchlist/route.ts never make a real network call. Behavior is
// driven by globalThis.__WEB_PUSH_MOCK__, set fresh before each scenario,
// same convention as supabase_js_mock.mjs's globalThis.__SUPABASE_MOCK__.
function setVapidDetails() {
  // no-op — the real function just stores config for sendNotification to
  // use; nothing to validate for a mock that ignores the actual args.
}

async function sendNotification(subscription, payload) {
  const mock = globalThis.__WEB_PUSH_MOCK__;
  if (!mock) {
    throw new Error("web-push mock not configured — set globalThis.__WEB_PUSH_MOCK__ before calling GET()");
  }
  return mock.sendNotification(subscription, payload);
}

export default { setVapidDetails, sendNotification };
export { setVapidDetails, sendNotification };
