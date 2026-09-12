// Regression test for isYuyuteiSourceEnabled() in src/lib/appSettings.ts —
// the emergency kill-switch for the yuyu-tei data source (added 2026-09-12
// alongside the daily-tracking cron, addressing the residual "what if
// yuyu-tei asks us to stop" gap noted when the user accepted the legal
// risk of scraping them).
//
// The critical property under test is the FAIL-OPEN direction: this must
// default to "still enabled" whenever the app_settings table/row is
// missing or the query errors, and only actually disable on an explicit
// `false` value — the opposite of how most of this project's checks fail
// safe, and deliberately so (see the file's own comment for why).
//
// Imports the REAL src/lib/appSettings.ts. Run:
// `node --experimental-strip-types migration/verify_app_settings.mjs`
import { isYuyuteiSourceEnabled } from "../src/lib/appSettings.ts";

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

function chain(result) {
  return { select: () => chain(result), eq: () => chain(result), maybeSingle: async () => result };
}

function mockClient(result) {
  return { from: () => chain(result) };
}

const enabled = await isYuyuteiSourceEnabled(mockClient({ data: { value: true }, error: null }));
assertEqual(enabled, true, "T1 explicit value:true -> enabled");

const disabled = await isYuyuteiSourceEnabled(mockClient({ data: { value: false }, error: null }));
assertEqual(disabled, false, "T2 explicit value:false -> disabled (the only way to actually trip the switch)");

const missingRow = await isYuyuteiSourceEnabled(mockClient({ data: null, error: null }));
assertEqual(missingRow, true, "T3 row missing (no error) -> fails open, still enabled");

const queryError = await isYuyuteiSourceEnabled(mockClient({ data: null, error: { message: "relation does not exist" } }));
assertEqual(queryError, true, "T4 table doesn't exist yet -> fails open, still enabled");

const clientThrows = await isYuyuteiSourceEnabled({
  from: () => {
    throw new Error("network error");
  },
});
assertEqual(clientThrows, true, "T5 client throws synchronously -> fails open, still enabled");

// A truthy-but-not-boolean value (e.g. a stray string) must not be
// misread as disabled — only a literal `false` disables.
const stringValue = await isYuyuteiSourceEnabled(mockClient({ data: { value: "true" }, error: null }));
assertEqual(stringValue, true, "T6 non-boolean truthy value -> still enabled (only literal false disables)");

console.log("\nAll appSettings.ts checks completed.");
