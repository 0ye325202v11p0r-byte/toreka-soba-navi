"use client";

import { useActionState } from "react";
import { resetPassword, type ResetPasswordState } from "./actions";

const initialState: ResetPasswordState = {};

export default function ResetPasswordPage() {
  const [state, formAction, pending] = useActionState(resetPassword, initialState);

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="text-xl font-bold">新しいパスワードを設定</h1>

      <form action={formAction} className="mt-6 space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium">
            新しいパスワード
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="password_confirm" className="block text-sm font-medium">
            新しいパスワード（確認）
          </label>
          <input
            id="password_confirm"
            name="password_confirm"
            type="password"
            required
            minLength={8}
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
          {pending ? "更新中…" : "パスワードを更新"}
        </button>
      </form>
    </div>
  );
}
