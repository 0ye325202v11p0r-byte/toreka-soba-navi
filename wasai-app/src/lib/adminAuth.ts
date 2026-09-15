// Fails CLOSED if ADMIN_EMAIL isn't configured (returns false for every
// email, including a genuine future match) rather than open — an
// unconfigured admin allowlist must never be indistinguishable from
// "anyone is allowed". Ported from the sibling toreka-soba-navi project's
// src/lib/adminAuth.ts (same reasoning, same gate shape).
export function isAdminUser(email: string | null | undefined): boolean {
  const adminEmail = process.env.ADMIN_EMAIL?.trim();
  if (!adminEmail || !email) return false;
  return email.trim().toLowerCase() === adminEmail.toLowerCase();
}
