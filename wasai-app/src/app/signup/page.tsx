"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signup, type SignupState } from "./actions";
import { PREFECTURES } from "@/lib/types";

const initialState: SignupState = {};

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(signup, initialState);
  const [role, setRole] = useState<"client" | "craftsman">("client");

  return (
    <div className="mx-auto max-w-md">
      <h1 className="text-xl font-bold">新規登録</h1>
      <p className="mt-1 text-sm text-ink-muted">
        依頼者・和裁士のどちらとして使うか選んで登録してください。
      </p>

      <form action={formAction} className="mt-6 space-y-4">
        <fieldset className="rounded-lg border border-border p-3">
          <legend className="px-1 text-sm font-semibold">登録区分</legend>
          <div className="flex flex-col gap-3 text-sm sm:flex-row sm:gap-4">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                value="client"
                checked={role === "client"}
                onChange={() => setRole("client")}
                required
              />
              依頼者として登録（仕立てを依頼したい）
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="role"
                value="craftsman"
                checked={role === "craftsman"}
                onChange={() => setRole("craftsman")}
                required
              />
              和裁士として登録（仕事を受けたい）
            </label>
          </div>
        </fieldset>

        <div>
          <label htmlFor="display_name" className="block text-sm font-medium">
            表示名
          </label>
          <input
            id="display_name"
            name="display_name"
            required
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
            placeholder="例: 山田花子 / 屋号"
          />
        </div>

        <div>
          <label htmlFor="prefecture" className="block text-sm font-medium">
            都道府県（任意）
          </label>
          <select
            id="prefecture"
            name="prefecture"
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">選択しない</option>
            {PREFECTURES.map((pref) => (
              <option key={pref} value={pref}>
                {pref}
              </option>
            ))}
          </select>
        </div>

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
          <label htmlFor="password" className="block text-sm font-medium">
            パスワード（8文字以上）
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

        <fieldset className="space-y-2 rounded-lg border border-border p-3 text-sm">
          <legend className="px-1 font-semibold">同意事項</legend>
          <label className="flex items-start gap-2">
            <input type="checkbox" name="agree_terms" value="yes" required className="mt-0.5" />
            <span>
              <Link href="/terms" target="_blank" className="text-accent-strong underline">
                利用規約
              </Link>
              と
              <Link href="/privacy" target="_blank" className="text-accent-strong underline">
                プライバシーポリシー
              </Link>
              を読み、同意します。
            </span>
          </label>
          {role === "craftsman" && (
            <label className="flex items-start gap-2">
              <input type="checkbox" name="agree_payment_agency" value="yes" required className="mt-0.5" />
              <span>
                依頼者からの代金を、運営者が私の代わりに受け取り、取引完了後に手数料を差し引いて私に引き渡すこと（利用規約第5条）に同意します。依頼者が支払いを済ませた時点で、その代金は私への支払いが済んだものとして扱われます。
              </span>
            </label>
          )}
        </fieldset>

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
          {pending ? "登録中…" : "登録する"}
        </button>
      </form>

      <p className="mt-4 text-sm text-ink-muted">
        すでにアカウントをお持ちの方は <Link href="/login" className="text-accent-strong underline">ログイン</Link>
      </p>
    </div>
  );
}
