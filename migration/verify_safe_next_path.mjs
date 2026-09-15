// Regression test for src/lib/safeNextPath.ts — the login page's post-auth
// redirect-target validator. Pins down the backslash open-redirect bypass
// found via independent review (Codex), 2026-09-15: a validator that only
// checks for a "//" prefix as literal text misses that browsers normalize
// "\" to "/" when resolving a URL, so "/\evil.com" reads as a same-site
// path here but resolves to an off-site "//evil.com" once handed to
// router.push()/new URL().
//
// Run: node --experimental-strip-types migration/verify_safe_next_path.mjs
import { safeNextPath } from "../src/lib/safeNextPath.ts";

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

assertEqual(safeNextPath(null), "/", "T1: null falls back to /");
assertEqual(safeNextPath(""), "/", "T2: empty string falls back to /");
assertEqual(safeNextPath("/watchlist?card=c2773"), "/watchlist?card=c2773", "T3: real same-site path with query is accepted unchanged");
assertEqual(safeNextPath("//evil.com"), "/", "T4: protocol-relative // is rejected");
assertEqual(safeNextPath("https://evil.com"), "/", "T5: absolute off-site URL is rejected (doesn't start with /)");
assertEqual(safeNextPath("evil.com"), "/", "T6: no leading / at all is rejected");

// The actual bug: a leading "/\" is neither "//" (rejected by T4's check)
// nor missing a leading "/" (rejected by T6's check) as literal text, but a
// browser resolves it identically to "//evil.com" once passed to new URL()
// or router.push() — confirmed by construction below, not just asserted.
assertEqual(safeNextPath("/\\evil.com"), "/", "T7: leading /\\ (backslash) is rejected");
{
  // Prove this is a real bypass, not a hypothetical: without the backslash
  // check, "/\\evil.com" alone passes both the startsWith("/") and
  // !startsWith("//") conditions as plain text.
  const wouldPassOldChecks = (raw) => raw.startsWith("/") && !raw.startsWith("//");
  assertEqual(wouldPassOldChecks("/\\evil.com"), true, "T7 setup: /\\evil.com passes the pre-fix startsWith checks");
  const resolved = new URL("/\\evil.com", "https://app.example").href;
  assertEqual(resolved, "https://evil.com/", "T7 setup: the browser actually resolves /\\evil.com off-site");
}
assertEqual(safeNextPath("/\\\\evil.com"), "/", "T8: leading /\\\\ (double backslash) is also rejected");
assertEqual(safeNextPath("/path/with\\backslash/inside"), "/", "T9: a backslash anywhere in the path is rejected, not just at the start");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
