"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import SetupNotice from "@/components/SetupNotice";

const configured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  if (!configured) return <SetupNotice />;

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("sending");
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/` },
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
