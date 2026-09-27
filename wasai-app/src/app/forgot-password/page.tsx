"use client";

import { useActionState } from "react";
import Link from "next/link";
import { requestPasswordReset, type ForgotPasswordState } from "./actions";

const initialState: ForgotPasswordState = {};

export default function ForgotPasswordPage() {
  const [state, formAction, pending] = useActionState(requestPasswordReset, initialState);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">パスワードをお忘れの場合</h1>
      <p className="mt-2 text-sm text-ink-muted">
        登録済みのメールアドレスを入力してください。パスワード再設定用のリンクをお送りします。
      </p>

      {state.sent ? (
        <p className="mt-6 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-strong">
          メールを送信しました。届いたリンクからパスワードを再設定してください。
        </p>
      ) : (
        <form action={formAction} className="mt-6 space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium">
              メールアドレス
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
            />
          </div>

          {state.error && (
            <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
              {state.error}
            </p>
          )}

          <button
            type="submit"
            disabled={pending}
            className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
          >
            {pending ? "送信中…" : "再設定メールを送る"}
          </button>
        </form>
      )}

      <p className="mt-4 text-sm text-ink-muted">
        <Link href="/login" className="text-accent-strong underline">
          ログインに戻る
        </Link>
      </p>
    </div>
  );
}
