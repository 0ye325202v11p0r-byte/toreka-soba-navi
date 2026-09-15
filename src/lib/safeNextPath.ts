// Extracted from src/app/login/page.tsx (2026-09-15) so this security-
// critical check can be unit tested directly, matching this project's
// established convention (formValidation.ts, pnl.ts, etc.) of pulling pure
// logic out of components rather than only reasoning about it in place.

// Only accept a same-site relative path (starts with exactly one "/", never
// "//..." which browsers treat as protocol-relative — an open-redirect risk
// if this ever came from an untrusted query param, which the login page's
// `next` param is).
//
// Also rejects any backslash: browsers normalize "\" to "/" when resolving a
// URL, so "/\evil.com" passes the startsWith("/") / !startsWith("//") checks
// above as plain text but is interpreted as "//evil.com" (protocol-relative
// → off-site redirect) once handed to router.push()/new URL(). Confirmed
// exploitable via independent review, 2026-09-15: new URL("/" + "\\" +
// "evil.com", "https://app.example").href resolved to "https://evil.com/".
export function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/";
  return raw;
}
