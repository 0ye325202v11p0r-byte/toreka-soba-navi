"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { track } from "@vercel/analytics";
import { createClient } from "@/lib/supabase/client";
import SetupNotice from "@/components/SetupNotice";

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

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
// signup/login, sidestepping the shared limit entirely. The tradeoff:
// forgetting a password has no self-serve recovery yet (that would need its
// own email-sending flow) — deliberately not built this round; the existing
// 2/hour cap is actually fine for how rarely that specific flow would fire.
function AuthForm() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));

  if (!configured) return <SetupNotice />;

  const supabase = createClient();

  function switchMode(nextMode: "login" | "signup") {
    setMode(nextMode);
    setStatus("idle");
    setErrorMsg("");
    setPassword("");
    setPasswordConfirm("");
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
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp({ email: trimmedEmail, password })
        : await supabase.auth.signInWithPassword({ email: trimmedEmail, password });

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

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">{mode === "signup" ? "新規登録" : "ログイン"}</h1>

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
        <button
          type="submit"
          disabled={status === "submitting"}
          className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
        >
          {status === "submitting" ? "処理中…" : mode === "signup" ? "登録する" : "ログイン"}
        </button>
        {status === "error" && <p className="text-sm text-warn">エラー：{errorMsg}</p>}
      </form>

      <button
        type="button"
        onClick={() => switchMode(mode === "signup" ? "login" : "signup")}
        className="mt-4 text-sm text-accent hover:underline"
      >
        {mode === "signup" ? "すでにアカウントをお持ちの方はこちら" : "新規登録はこちら"}
      </button>
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
