// Regression test for src/lib/adminAuth.ts — the owner-only gate for
// /admin/sync-status.
//
// Background (self-review, 2026-09-12): the page previously only checked
// `if (!user) redirect(...)`, meaning ANY authenticated user (login is open
// passwordless signup with no allowlist) could view internal cron
// operational data. isAdminUser() compares the signed-in user's email
// against process.env.ADMIN_EMAIL, failing CLOSED (false for everyone,
// owner included) when that env var isn't set.
//
// Imports the REAL src/lib/adminAuth.ts. Run: `node
// --experimental-strip-types migration/verify_admin_auth.mjs`. A
// MODULE_TYPELESS_PACKAGE_JSON warning on stderr is expected and harmless.

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

async function withAdminEmail(value, fn) {
  const original = process.env.ADMIN_EMAIL;
  if (value === undefined) delete process.env.ADMIN_EMAIL;
  else process.env.ADMIN_EMAIL = value;
  try {
    // Re-import with a cache-busting query param so each test sees the
    // env var as it stood at import time — the module reads
    // process.env.ADMIN_EMAIL fresh inside the function body (not at
    // module load time), so this isn't strictly required for correctness,
    // but keeps this test robust even if that ever changes.
    const mod = await import(`../src/lib/adminAuth.ts?t=${Date.now()}-${Math.random()}`);
    await fn(mod.isAdminUser);
  } finally {
    if (original === undefined) delete process.env.ADMIN_EMAIL;
    else process.env.ADMIN_EMAIL = original;
  }
}

await withAdminEmail("owner@example.com", async (isAdminUser) => {
  assertEqual(isAdminUser("owner@example.com"), true, "T1 exact email match is admin");
  assertEqual(isAdminUser("OWNER@EXAMPLE.COM"), true, "T2 case-insensitive match is admin");
  assertEqual(isAdminUser("someone-else@example.com"), false, "T3 non-matching email is not admin");
  assertEqual(isAdminUser(null), false, "T4 null email (should be unreachable — a logged-in user always has one) is not admin");
  assertEqual(isAdminUser(undefined), false, "T5 undefined email is not admin");
  assertEqual(isAdminUser(""), false, "T6 empty-string email is not admin");
});

// The critical fail-closed case: an unconfigured allowlist must deny
// EVERYONE, including a request that would otherwise match once configured
// — never fall back to "no restriction."
await withAdminEmail(undefined, async (isAdminUser) => {
  assertEqual(isAdminUser("owner@example.com"), false, "T7 ADMIN_EMAIL unset: even the intended owner's email is denied (fail-closed)");
  assertEqual(isAdminUser("anyone@example.com"), false, "T8 ADMIN_EMAIL unset: an arbitrary email is denied");
});

// Empty-string ADMIN_EMAIL (e.g. a blank .env.local line) must behave the
// same as unset, not as "match any empty string" or similar edge case.
await withAdminEmail("", async (isAdminUser) => {
  assertEqual(isAdminUser("owner@example.com"), false, "T9 ADMIN_EMAIL='' denies a real email");
  assertEqual(isAdminUser(""), false, "T10 ADMIN_EMAIL='' does not match an empty user email either");
});

// Whitespace handling (self-review, 2026-09-12) — ADMIN_EMAIL is set by
// hand (pasted into .env.local or the Vercel dashboard), where a stray
// trailing space/newline is an easy, silent way to lock the real owner out.
await withAdminEmail("  owner@example.com\n", async (isAdminUser) => {
  assertEqual(isAdminUser("owner@example.com"), true, "T11 leading/trailing whitespace in ADMIN_EMAIL is trimmed before comparing");
});
await withAdminEmail("owner@example.com", async (isAdminUser) => {
  assertEqual(isAdminUser("  owner@example.com  "), true, "T12 leading/trailing whitespace in the user's own email is also trimmed");
});
// A whitespace-only ADMIN_EMAIL (e.g. an accidental single space pasted
// into the Vercel dashboard) must be treated the same as fully unset —
// fail-closed, not "matches an empty/whitespace user email."
await withAdminEmail("   ", async (isAdminUser) => {
  assertEqual(isAdminUser("owner@example.com"), false, "T13 whitespace-only ADMIN_EMAIL is treated as unset (fail-closed)");
  assertEqual(isAdminUser("   "), false, "T13b whitespace-only ADMIN_EMAIL does not match a whitespace-only user email either");
});

console.log("\nAll adminAuth.ts checks completed.");
