"use client";

import { useEffect, useId } from "react";
import Script from "next/script";

// Cloudflare Turnstile CAPTCHA (added 2026-09-13, security self-review) —
// mitigates two findings from that review together: unlimited automated
// account creation (Supabase's own signup has no rate limit of its own)
// and IP-based brute-force login attempts (Supabase's default sign-in rate
// limit is per-IP, not per-account, and is documented as bypassable with
// distributed IPs). Supabase Auth's "Attack Protection" feature is the
// server-side half of this — it validates the token this widget produces
// on signUp/signInWithPassword/resetPasswordForEmail calls — but that
// requires enabling it in the Supabase dashboard with a real Cloudflare
// Turnstile site/secret key pair, which only the project owner can do
// (account creation + dashboard access this session cannot perform). This
// component is the client-side half, gated entirely behind
// NEXT_PUBLIC_TURNSTILE_SITE_KEY being set — omitted, the whole widget
// renders nothing and every auth call behaves exactly as it does today
// (see login/page.tsx and reset-password/page.tsx), so shipping this now
// changes nothing in production until that env var is actually set.
//
// Verified against Cloudflare's own published test site keys (which work
// on any domain, including localhost, without a Cloudflare account) rather
// than assumed to work — see migration/PRODUCTION_SETUP_CHECKLIST.md for
// the values and how this was actually exercised in a browser.
declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          "expired-callback"?: () => void;
          "error-callback"?: () => void;
        }
      ) => string;
      remove: (widgetId: string) => void;
    };
  }
}

export default function TurnstileWidget({
  siteKey,
  onVerify,
  onExpire,
}: {
  siteKey: string;
  onVerify: (token: string) => void;
  onExpire: () => void;
}) {
  const containerId = `turnstile-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;

  useEffect(() => {
    let widgetId: string | undefined;
    let cancelled = false;

    // Cloudflare's script may already be loaded and ready by the time this
    // effect runs (e.g. after a mode switch re-mounts this component) —
    // polling briefly for window.turnstile rather than relying solely on
    // the Script tag's onLoad, which only fires once per page load, not on
    // every remount.
    function tryRender() {
      if (cancelled) return;
      if (window.turnstile) {
        widgetId = window.turnstile.render(`#${containerId}`, {
          sitekey: siteKey,
          callback: onVerify,
          "expired-callback": onExpire,
          "error-callback": onExpire,
        });
      } else {
        setTimeout(tryRender, 100);
      }
    }
    tryRender();

    return () => {
      cancelled = true;
      if (widgetId && window.turnstile) {
        window.turnstile.remove(widgetId);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onVerify/onExpire are expected to be stable per mount; re-running on every render identity change would tear down and re-render the widget unnecessarily
  }, [containerId, siteKey]);

  return (
    <>
      <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
      <div id={containerId} />
    </>
  );
}
