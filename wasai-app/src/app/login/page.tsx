"use client";

import { useActionState } from "react";
import Link from "next/link";
import { login, type LoginState } from "./actions";

const initialState: LoginState = {};

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(login, initialState);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">ログイン</h1>

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

        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="block text-sm font-medium">
              パスワード
            </label>
            <Link href="/forgot-password" className="text-xs text-accent-strong underline">
              パスワードをお忘れですか？
            </Link>
          </div>
          <input
            id="password"
            name="password"
            type="password"
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
          {pending ? "ログイン中…" : "ログイン"}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink-muted">
        アカウントをお持ちでない方は <Link href="/signup" className="text-accent-strong underline">新規登録</Link>
      </p>
    </div>
  );
}
