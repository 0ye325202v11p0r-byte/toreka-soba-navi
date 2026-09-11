"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import SetupNotice from "@/components/SetupNotice";

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Only accept a same-site relative path (starts with exactly one "/", never
// "//..." which browsers treat as protocol-relative — an open-redirect risk
// if this ever came from an untrusted query param, which `next` is).
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const next = safeNextPath(useSearchParams().get("next"));

  if (!configured) return <SetupNotice />;

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    // Preserves where the user was trying to go (e.g. /watchlist) before
    // being sent here — without this, everyone lands on the home page after
    // clicking the magic link, even if they were redirected here from a
    // specific protected page.
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}${next}` },
    });
    if (error) {
      setStatus("error");
      setErrorMsg(error.message);
    } else {
      setStatus("sent");
    }
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">ログイン / 新規登録</h1>
      <p className="mb-4 text-sm text-ink-muted">
        メールアドレスを入力すると、ログイン用のリンクが届きます（パスワード不要）。
      </p>

      {status === "sent" ? (
        <div className="rounded-lg bg-good-soft p-4 text-good">
          {email} にログインリンクを送信しました。メールを確認してください。
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
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-ink"
          />
          <button
            type="submit"
            disabled={status === "sending"}
            className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
          >
            {status === "sending" ? "送信中…" : "ログインリンクを送る"}
          </button>
          {status === "error" && <p className="text-sm text-warn">エラー：{errorMsg}</p>}
        </form>
      )}
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
