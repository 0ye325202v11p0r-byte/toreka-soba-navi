import type { NextConfig } from "next";
import path from "path";

const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : "";

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  `connect-src 'self'${supabaseOrigin ? ` ${supabaseOrigin}` : ""}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  // The site uses none of these; deny them outright so an injected script
  // or embedded page can't ask the visitor for them.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
];

const nextConfig: NextConfig = {
  // The sibling toreka-soba-navi project (repo root, one level up) has its
  // own package-lock.json, which makes Next.js/Turbopack misdetect this
  // app's workspace root as the repo root instead of this directory. This
  // app is fully independent (own package.json, own node_modules) — pin
  // the root explicitly rather than letting lockfile-sniffing guess wrong.
  turbopack: {
    root: path.join(__dirname),
  },
  // Photo uploads go through Server Actions, whose default limit is 1MB —
  // a phone photo failed with a 500. Images are also shrunk in the browser
  // first (lib/shrinkImage.ts); this leaves room for several photos or a
  // PDF certificate. Vercel refuses bodies over 4.5MB, so stay under it.
  experimental: {
    serverActions: {
      bodySizeLimit: "4mb",
    },
  },
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
