"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
import { createClient } from "@/lib/supabase/client";
import SetupNotice from "@/components/SetupNotice";
import TurnstileWidget from "@/components/TurnstileWidget";

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Unset in production until the project owner completes the Cloudflare
// Turnstile + Supabase Attack Protection setup (see
// migration/PRODUCTION_SETUP_CHECKLIST.md) — every call site below treats
// a missing key as "CAPTCHA not required," matching this project's
// established graceful-degradation convention for other not-yet-configured
// features (VAPID keys, ADMIN_EMAIL, etc.).
const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

// Minimum accepted by Supabase Auth's own default password policy — this is
// only a client-side hint (Supabase itself rejects anything shorter with its
// own error message regardless of this attribute).
const MIN_PASSWORD_LENGTH = 6;

// Only accept a same-site relative path (starts with exactly one "/", never
// "//..." which browsers treat as protocol-relative — an open-redirect risk
// if this ever came from an untrusted query param, which `next` is).
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

// Switched from magic-link (OTP) to email+password auth (2026-09-13) — see
// COORDINATION.md. Supabase's default (no custom SMTP configured) email
// sender caps the WHOLE PROJECT at 2 auth emails/hour, shared across every
// user's login attempt — fine for a single admin testing alone, but it
// would start rejecting the 3rd person to try logging in within the same
// hour the moment this app has any real traffic at all. Password auth
// (with Supabase's "Confirm email" setting turned off — see
// migration/PRODUCTION_SETUP_CHECKLIST.md) sends NO email at all for normal
// signup/login, sidestepping the shared limit entirely.
//
// "reset" mode (added 2026-09-13, second pass) does use the shared email
// quota — but "I forgot my password" is a rare, low-frequency action for
// any one user, unlike every-single-login, so it doesn't reintroduce the
// original bottleneck the way keeping OTP-based login would have.
function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup" | "reset">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "reset_sent">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));

  if (!configured) return <SetupNotice />;

  const supabase = createClient();

  function switchMode(nextMode: "login" | "signup" | "reset") {
    setMode(nextMode);
    setStatus("idle");
    setErrorMsg("");
    setPassword("");
    setPasswordConfirm("");
    // A Turnstile token is single-use and tied to the widget instance that
    // produced it — carrying a stale token across a mode switch (e.g.
    // login -> signup) would let a genuinely unverified submission through
    // on the new mode using an already-spent token.
    setCaptchaToken(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // Same reasoning as the pre-password version: trimmed before sending,
    // not just relied on <input type="email">, so a stray leading/trailing
    // space can never split one person's account across two rows or break
    // isAdminUser()'s exact-match comparison (self-review, 2026-09-12).
    const trimmedEmail = email.trim();

    if (mode === "signup" && password !== passwordConfirm) {
      setStatus("error");
      setErrorMsg("パスワードが一致しません。");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");

    if (mode === "reset") {
      // No signOut/error branch needs a `user` check here — Supabase issues
      // the same generic success response whether or not the address has
      // an account, so this can never be used to probe which emails are
      // registered (the same anti-enumeration behavior signInWithPassword's
      // own error message deliberately does NOT have, but resetPasswordForEmail
      // does, by Supabase's own design).
      const { error } = await supabase.auth.resetPasswordForEmail(trimmedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
        // captchaToken is a top-level sibling of redirectTo here, unlike
        // signUp/signInWithPassword below where it nests under `options`
        // — an actual difference in the Supabase Auth JS SDK's types, not
        // an inconsistency introduced here (verified against
        // node_modules/@supabase/auth-js's own type definitions rather
        // than assumed to match the other two calls' shape).
        ...(captchaToken ? { captchaToken } : {}),
      });
      if (error) {
        setStatus("error");
        setErrorMsg(error.message);
        return;
      }
      setStatus("reset_sent");
      return;
    }

    const authOptions = captchaToken ? { options: { captchaToken } } : {};
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email: trimmedEmail, password, ...authOptions })
        : await supabase.auth.signInWithPassword({ email: trimmedEmail, password, ...authOptions });

    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
      return;
    }

    // "無料でまず試す" 方針への転換（2026-09-13）に伴い追加 — email自体は
    // 個人情報なのでプロパティに含めない（何人がここまで来たかだけを
    // 数える、誰が来たかは数えない）。
    track(mode === "signup" ? "signup_completed" : "login_completed");
    // router.refresh() first — server components (e.g. NavBar's login
    // state) read the session from a cookie that signInWithPassword/signUp
    // just set client-side; without a refresh they'd still render the
    // pre-login state on the page `next` navigates to.
    router.refresh();
    router.push(next);
  }

  const title = mode === "signup" ? "新規登録" : mode === "reset" ? "パスワードの再設定" : "ログイン";

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">{title}</h1>

      {mode === "reset" && status === "reset_sent" ? (
        <div className="rounded-lg bg-good-soft p-4 text-good">
          {email} 宛にパスワード再設定用のリンクを送信しました（該当するアカウントが存在する場合）。メールをご確認ください。
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="email"
            required
            aria-label="メールアドレス"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-ink"
          />
          {mode !== "reset" && (
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-label="パスワード"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="パスワード（6文字以上）"
              autoComplete={mode === "signup" ? "new-password" : "current-password"}
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-ink"
            />
          )}
          {mode === "signup" && (
            <input
              type="password"
              required
              minLength={MIN_PASSWORD_LENGTH}
              aria-label="パスワード（確認）"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              placeholder="パスワード（確認）"
              autoComplete="new-password"
              className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-ink"
            />
          )}
          {TURNSTILE_SITE_KEY && (
            <TurnstileWidget
              key={mode}
              siteKey={TURNSTILE_SITE_KEY}
              onVerify={setCaptchaToken}
              onExpire={() => setCaptchaToken(null)}
            />
          )}
          <button
            type="submit"
            disabled={status === "submitting" || (Boolean(TURNSTILE_SITE_KEY) && !captchaToken)}
            className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
          >
            {status === "submitting"
              ? "処理中…"
              : mode === "signup"
                ? "登録する"
                : mode === "reset"
                  ? "再設定リンクを送る"
                  : "ログイン"}
          </button>
          {status === "error" && <p className="text-sm text-warn">エラー：{errorMsg}</p>}
        </form>
      )}

      <div className="mt-4 space-y-2">
        {mode === "login" && (
          <button
            type="button"
            onClick={() => switchMode("reset")}
            className="block text-sm text-accent hover:underline"
          >
            パスワードをお忘れですか？
          </button>
        )}
        <button
          type="button"
          onClick={() => switchMode(mode === "signup" ? "login" : mode === "reset" ? "login" : "signup")}
          className="block text-sm text-accent hover:underline"
        >
          {mode === "signup"
            ? "すでにアカウントをお持ちの方はこちら"
            : mode === "reset"
              ? "ログイン画面に戻る"
              : "新規登録はこちら"}
        </button>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <AuthForm />
    </Suspense>
  );
}
