"use client";

import { useActionState } from "react";
import { createRequest, type RequestFormState } from "./actions";
import { GARMENT_TYPES } from "@/lib/types";

const initialState: RequestFormState = {};

export default function RequestForm() {
  const [state, formAction, pending] = useActionState(createRequest, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          タイトル
        </label>
        <input
          id="title"
          name="title"
          required
          placeholder="例: 振袖の仕立てをお願いしたいです"
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="garment_type" className="block text-sm font-medium">
          着物の種類
        </label>
        <select
          id="garment_type"
          name="garment_type"
          required
          defaultValue=""
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        >
          <option value="" disabled>
            選択してください
          </option>
          {GARMENT_TYPES.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="description" className="block text-sm font-medium">
          詳細
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          placeholder="生地の種類・寸法・希望仕上がりイメージなど"
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="budget_min" className="block text-sm font-medium">
            予算下限（円）
          </label>
          <input
            id="budget_min"
            name="budget_min"
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="budget_max" className="block text-sm font-medium">
            予算上限（円）
          </label>
          <input
            id="budget_max"
            name="budget_max"
            type="number"
            min={0}
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="deadline" className="block text-sm font-medium">
            希望納期
          </label>
          <input
            id="deadline"
            name="deadline"
            type="date"
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="min_grade" className="block text-sm font-medium">
          資格級位の指定（任意）
        </label>
        <select
          id="min_grade"
          name="min_grade"
          defaultValue=""
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        >
          <option value="">指定なし（誰でも提案可）</option>
          <option value="1級">1級のみ</option>
          <option value="2級">2級以上</option>
          <option value="3級">3級以上</option>
          <option value="その他資格">資格保有者のみ</option>
        </select>
        <p className="mt-1 text-xs text-ink-muted">
          指定すると、該当する資格級位の和裁士しか提案できなくなります（価格競争を避けたい高難度の依頼向け）。
        </p>
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "投稿中…" : "依頼を投稿する"}
      </button>
    </form>
  );
}
