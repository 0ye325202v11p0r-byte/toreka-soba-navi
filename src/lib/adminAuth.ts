// Pure gate for /admin/* pages, kept framework-free (like formValidation.ts)
// so a Node regression test can import the REAL function directly.
//
// Found via self-review, 2026-09-12: /admin/sync-status/page.tsx only ever
// checked `if (!user) redirect(...)` — ANY authenticated user, not just the
// site owner, could view it. Because login is open self-service signup with
// no allowlist (originally passwordless OTP, switched to email+password
// 2026-09-13 — see login/page.tsx — but either way anyone can create an
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
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail || !email) return false;
  // Trims the compared user email too — Supabase-authenticated emails are
  // never expected to carry stray whitespace, but ADMIN_EMAIL is set by
  // hand (pasted into .env.local or the Vercel dashboard), where a trailing
  // space or newline is an easy, silent way to lock the real owner out
  // (found via self-review, 2026-09-12, while re-reading this file after
  // shipping it — not a reported incident).
  return email.trim().toLowerCase() === adminEmail.toLowerCase();
}
