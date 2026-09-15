// Regression test for src/lib/webPushServer.ts's isSafePushEndpoint() — the
// guard added 2026-09-15 (independent review) against SSRF via
// push_subscriptions.endpoint. That row is inserted directly by the client
// (WatchlistClient.tsx), protected only by RLS's `user_id = auth.uid()`
// ownership check — nothing at the DB layer stops an authenticated user
// from setting `endpoint` to an arbitrary URL, which the cron routes would
// otherwise dutifully POST to via webpush.sendNotification().
//
// Run: node --experimental-strip-types migration/verify_push_endpoint_safety.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { isSafePushEndpoint } = await import("../src/lib/webPushServer.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  if (actual === expected) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Real-world endpoints (the four services actual browsers issue) must keep
// working — this guard exists to close an SSRF hole, not to break delivery.
assertEqual(isSafePushEndpoint("https://fcm.googleapis.com/wp/abc123"), true, "T1: real FCM endpoint is accepted");
assertEqual(isSafePushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/xyz"), true, "T2: real Mozilla endpoint is accepted");
assertEqual(isSafePushEndpoint("https://web.push.apple.com/QAbc"), true, "T3: real Apple endpoint is accepted");
assertEqual(isSafePushEndpoint("https://wns2-par02p.notify.windows.com/w/?token=abc"), true, "T4: real Windows/Edge endpoint is accepted");

// The actual attack: cloud metadata service and other internal targets.
assertEqual(isSafePushEndpoint("http://169.254.169.254/latest/meta-data/"), false, "T5: cloud metadata IP is rejected");
assertEqual(isSafePushEndpoint("https://169.254.169.254/"), false, "T6: cloud metadata IP is rejected even over https");
assertEqual(isSafePushEndpoint("https://127.0.0.1:8443/admin"), false, "T7: loopback IP is rejected");
assertEqual(isSafePushEndpoint("https://10.0.0.5/internal"), false, "T8: private-range IP is rejected");
assertEqual(isSafePushEndpoint("https://192.168.1.1/"), false, "T9: private-range IP is rejected");
assertEqual(isSafePushEndpoint("https://localhost/"), false, "T10: localhost hostname is rejected");
assertEqual(isSafePushEndpoint("https://[::1]/"), false, "T11: IPv6 loopback literal is rejected");
assertEqual(isSafePushEndpoint("http://fcm.googleapis.com/wp/abc123"), false, "T12: plain http (not https) is rejected even for a real host");
assertEqual(isSafePushEndpoint("not a url at all"), false, "T13: unparseable garbage is rejected");
assertEqual(isSafePushEndpoint(""), false, "T14: empty string is rejected");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
