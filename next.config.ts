import type { NextConfig } from "next";

// Added 2026-09-13 (security self-review) alongside CSP below — actual
// external origins this app's browser-side code talks to were confirmed by
// actually loading the app in a browser with the CSP in place and reading
// the resulting violation reports, not by reading source alone: the
// package's own code defaults to a same-origin script path
// (/_vercel/insights/script.js) in production, but real testing showed
// `next dev` loads an absolute-URL debug build from
// https://va.vercel-scripts.com instead — a detail the source reading
// alone missed. Allowed here rather than assumed away, since there's no
// way to verify from this environment whether that URL is truly
// dev-only without a real production deployment to test against. Falls
// back to just 'self' for connect-src if NEXT_PUBLIC_SUPABASE_URL is unset
// (e.g. a build with Supabase not yet configured) rather than emitting a
// broken "connect-src 'self' undefined".
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

// Not nonce-based (script-src keeps 'unsafe-inline') — Next.js injects
// inline bootstrap scripts for streaming RSC payloads that a strict
// nonce-based CSP would need per-request middleware wiring to allow
// correctly; that's a larger, riskier change to get right without being
// able to fully exercise every route against it first. This is still a
// meaningful improvement over having no CSP at all: it blocks loading
// scripts/iframes/objects from arbitrary third-party origins, restricts
// where fetch/XHR/WebSocket can connect to, and blocks this page from
// being framed or having its forms/base URI hijacked — it just doesn't
// fully close inline-script-injection XSS the way a nonce-based policy
// would. Revisit if that stronger guarantee becomes worth the migration.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  // prevents this site from being embedded in an iframe elsewhere
  // (clickjacking protection) — frame-ancestors 'none' in the CSP above is
  // the modern equivalent; kept alongside it for older browsers that don't
  // support CSP frame-ancestors.
  { key: "X-Frame-Options", value: "DENY" },
  // stops the browser from guessing content types away from what's declared
  { key: "X-Content-Type-Options", value: "nosniff" },
  // don't leak the full URL (which could contain a card id / referrer path)
  // to third-party sites linked from this app
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // this app doesn't use camera/mic/geolocation - explicitly disable them
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // Vercel already serves everything over HTTPS and redirects HTTP to
  // HTTPS by default, but this header adds a second, browser-enforced
  // guarantee: once a browser has seen it, it will refuse to even attempt
  // a plain-HTTP connection to this origin for the given duration (2 years
  // here), closing the window a protocol-downgrade/SSL-stripping attack
  // would otherwise have on a user's very first visit.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // don't advertise the framework to would-be attackers
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
