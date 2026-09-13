// Regression test for src/lib/webPushClient.ts's urlBase64ToUint8Array() —
// the VAPID-key-to-Uint8Array conversion Web Push subscription requires.
// Getting this conversion wrong (wrong padding, wrong character mapping)
// silently produces a garbage applicationServerKey that the browser accepts
// syntactically but the push service rejects at send time — the kind of
// bug that's invisible until someone actually tries to receive a
// notification, so it's worth pinning down here.
//
// Run: node --experimental-strip-types migration/verify_web_push_client.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { urlBase64ToUint8Array } = await import("../src/lib/webPushClient.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// T1: round-trip against a real generated VAPID public key (from this
// session's own `web-push generateVAPIDKeys()` output) — decoding must
// produce exactly 65 bytes (an uncompressed P-256 EC public key: 0x04
// prefix + 32-byte X + 32-byte Y), the shape PushManager.subscribe()
// validates.
{
  const vapidKey = "BKlEJlE89Px94DJoddHLiPvoiEOsEknzA3ERflqqYOxBDceubmcF2Tup882S0zKJmCVHSRTWnkkhB7gCrvnSmZo";
  const result = urlBase64ToUint8Array(vapidKey);
  assertEqual(result.length, 65, "T1: a real VAPID public key decodes to 65 bytes (uncompressed P-256 point)");
  assertEqual(result[0], 0x04, "T1: the first byte is 0x04 (uncompressed EC point marker)");
}

// T2: URL-safe characters ('-' and '_') must be converted to standard
// base64 ('+' and '/') before decoding — a key containing these (common,
// since VAPID keys are URL-safe base64) would otherwise decode incorrectly
// or throw.
{
  // Constructed to contain both '-' and '_' after url-safe encoding: raw
  // bytes [0xfb, 0xff, 0xbf] -> standard base64 "+/+/" -> url-safe "_-_-".
  const raw = Uint8Array.from([0xfb, 0xff, 0xbf]);
  const urlSafe = Buffer.from(raw).toString("base64url");
  assertEqual(urlSafe.includes("-") || urlSafe.includes("_"), true, "T2 setup: the test fixture actually exercises url-safe characters");
  const decoded = urlBase64ToUint8Array(urlSafe);
  assertEqual(Array.from(decoded), Array.from(raw), "T2: url-safe '-'/'_' characters decode to the same bytes as standard base64 '+'/'/' would");
}

// T3: missing padding is restored correctly for all 4 possible remainder
// lengths (0, 1, 2, 3 chars needing 0, 3, 2, 1 '=' respectively — a length
// of 1 mod 4 is invalid base64 and never occurs for real byte counts, so
// only 0/2/3-char remainders are meaningful here).
{
  for (const byteLen of [1, 2, 3, 4, 5, 6]) {
    const raw = Uint8Array.from({ length: byteLen }, (_, i) => i * 17);
    const unpadded = Buffer.from(raw).toString("base64url"); // base64url has no '=' padding
    const decoded = urlBase64ToUint8Array(unpadded);
    assertEqual(Array.from(decoded), Array.from(raw), `T3: byteLen=${byteLen} round-trips correctly through padding restoration`);
  }
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
