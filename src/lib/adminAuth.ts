// Pure gate for /admin/* pages, kept framework-free (like formValidation.ts)
// so a Node regression test can import the REAL function directly.
//
// Found via self-review, 2026-09-12: /admin/sync-status/page.tsx only ever
// checked `if (!user) redirect(...)` — ANY authenticated user, not just the
// site owner, could view it. Because login is open passwordless signup
// (supabase.auth.signInWithOtp with no allowlist — anyone can create an
// account with any email), this meant literally anyone who signed up could
// see internal cron operational data: run history, success/failure counts,
// and raw error_sample text (which can include internal card ids and, for
// the yuyu-tei cron, phrases like "ANOMALY: every fetched set returned zero
// cards" that describe how the scraper is or isn't being blocked). A page
// named "/admin/..." implied owner-only access that the code never actually
// enforced.
//
// Fails CLOSED if ADMIN_EMAIL isn't configured (returns false for every
// email, including a genuine future match) rather than open — an
// unconfigured admin allowlist must never be indistinguishable from "anyone
// is allowed," matching this project's established fail-closed pattern for
// other access gates (see canScrapeYuyutei() in appSettings.ts). This does
// mean the owner is locked out of /admin/sync-status until ADMIN_EMAIL is
// set, which is the correct trade-off for a page with no other gate at all.
export function isAdminUser(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL;
  if (!adminEmail || !email) return false;
  return email.toLowerCase() === adminEmail.toLowerCase();
}
