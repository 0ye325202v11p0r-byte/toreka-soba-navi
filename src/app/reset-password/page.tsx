"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";

const MIN_PASSWORD_LENGTH = 6;

// Landing page for the link Supabase's resetPasswordForEmail() (see
// login/page.tsx's "reset" mode) sends — the browser Supabase client
// (createBrowserClient, detectSessionInUrl: true by default) exchanges the
// recovery token embedded in this page's own URL into a real session
// automatically on load, before any of this component's own code runs.
// From that point on, updateUser({password}) is exactly the same call a
// logged-in user changing their own password would make — this page's
// only real distinction is that the session it's acting on was established
// via a one-time recovery link rather than a normal login.
export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "mismatch" | "error" | "done">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

  if (!isSupabaseConfigured()) return <SetupNotice />;

  const supabase = createClient();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== passwordConfirm) {
      setStatus("mismatch");
      setErrorMsg("パスワードが一致しません。");
      return;
    }
    setStatus("submitting");
    setErrorMsg("");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus("error");
      // Supabase reports an expired/invalid/already-used recovery link via
      // this same call (it fails because there's no valid recovery session
      // to act on) rather than a separate error path — surfaced as-is
      // rather than guessing at a friendlier message that might not match
      // what actually went wrong.
      setErrorMsg(error.message);
      return;
    }
    setStatus("done");
  }

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-4 text-xl font-bold">新しいパスワードを設定</h1>

      {status === "done" ? (
        <div className="rounded-lg bg-good-soft p-4 text-good">
          パスワードを更新しました。
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-3 block rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated hover:bg-accent-strong"
          >
            トップページへ →
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-label="新しいパスワード"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="新しいパスワード（6文字以上）"
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-ink"
          />
          <input
            type="password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            aria-label="新しいパスワード（確認）"
            value={passwordConfirm}
            onChange={(e) => setPasswordConfirm(e.target.value)}
            placeholder="新しいパスワード（確認）"
            autoComplete="new-password"
            className="w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-ink"
          />
          <button
            type="submit"
            disabled={status === "submitting"}
            className="w-full rounded-md bg-accent px-3 py-2 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
          >
            {status === "submitting" ? "更新中…" : "パスワードを更新"}
          </button>
          {status === "mismatch" && <p className="text-sm text-warn">エラー：{errorMsg}</p>}
          {status === "error" && (
            <p className="text-sm text-warn">
              エラー：{errorMsg}
              <br />
              リンクの有効期限が切れているか、既に使用済みの可能性があります。もう一度パスワード再設定をお試しください。
            </p>
          )}
        </form>
      )}
    </div>
  );
}
