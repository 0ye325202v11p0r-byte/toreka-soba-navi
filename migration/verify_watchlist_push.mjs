// Regression test for src/lib/watchlistPush.ts — the two small pieces of
// the check-watchlist push-notification feature (2026-09-13) most likely
// to be silently gotten backwards: "is this a NEW trigger" and "what does
// the notification say."
//
// Run: node --experimental-strip-types migration/verify_watchlist_push.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { isNewlyTriggered, buildWatchlistPushPayload } = await import("../src/lib/watchlistPush.ts");

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

// isNewlyTriggered: all 4 combinations of previous/current state.
assertEqual(isNewlyTriggered(false, true), true, "T1: false -> true is a new trigger (push)");
assertEqual(isNewlyTriggered(true, true), false, "T2: true -> true is NOT a new trigger (already notified, no repeat spam)");
assertEqual(isNewlyTriggered(false, false), false, "T3: false -> false is not a trigger at all");
assertEqual(isNewlyTriggered(true, false), false, "T4: true -> false (condition cleared) is not a trigger");

// buildWatchlistPushPayload: sanity-checks the notification actually names
// the specific card and links to its detail page, not a generic message
// that would leave the user unable to tell which of several watched cards
// fired.
{
  const payload = buildWatchlistPushPayload("ゾロ十郎", "c341");
  assertEqual(payload.body.includes("ゾロ十郎"), true, "T5: the notification body names the specific card");
  assertEqual(payload.url, "/cards/c341", "T6: the notification links to that card's detail page");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
