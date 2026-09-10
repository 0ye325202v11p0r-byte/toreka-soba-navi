import type { NextConfig } from "next";

const securityHeaders = [
  // prevents this site from being embedded in an iframe elsewhere
  // (clickjacking protection)
  { key: "X-Frame-Options", value: "DENY" },
  // stops the browser from guessing content types away from what's declared
  { key: "X-Content-Type-Options", value: "nosniff" },
  // don't leak the full URL (which could contain a card id / referrer path)
  // to third-party sites linked from this app
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // this app doesn't use camera/mic/geolocation - explicitly disable them
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
];

const nextConfig: NextConfig = {
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
