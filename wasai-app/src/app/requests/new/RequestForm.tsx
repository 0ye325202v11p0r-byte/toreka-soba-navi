"use client";

import { useActionState } from "react";
import { createRequest, type RequestFormState } from "./actions";
import { GARMENT_TYPES } from "@/lib/types";
import { BUILD_OPTIONS, MEASUREMENT_FIELDS } from "@/lib/measurements";

const initialState: RequestFormState = {};

export default function RequestForm({ directedTo, directedName }: { directedTo?: string; directedName?: string }) {
  const [state, formAction, pending] = useActionState(createRequest, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-4">
      {directedTo && (
        <>
          <input type="hidden" name="directed_to" value={directedTo} />
          <p className="rounded-md bg-link-soft p-3 text-sm text-ink">
            {directedName}さんへの相談です。この依頼は{directedName}さんにだけ届き、依頼掲示板には表示されません。
          </p>
        </>
      )}
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
          placeholder="生地の種類・希望の仕上がり・気になっていることなど（寸法は下の欄に入力できます）"
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
      </div>

      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-semibold">寸法（わかる範囲で・任意）</legend>
        <p className="text-xs text-ink-muted">
          わからない項目は空欄で大丈夫です。前巾・後巾などは和裁士がヒップから割り出し、足りない寸法は和裁士がメッセージで確認します。寸法は、あなたとログインした和裁士だけが見られます（掲示板には表示されません）。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MEASUREMENT_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={f.key} className="block text-sm font-medium">
                {f.label}（cm）
              </label>
              <input
                id={f.key}
                name={f.key}
                type="number"
                inputMode="decimal"
                step="0.1"
                min={f.min}
                max={f.max}
                className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-ink-muted">{f.hint}</p>
            </div>
          ))}
          <div>
            <label htmlFor="build" className="block text-sm font-medium">
              体型
            </label>
            <select
              id="build"
              name="build"
              defaultValue=""
              className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
            >
              <option value="">選択しない</option>
              {BUILD_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-ink-muted">男性の着物は、身長と体型だけでも見積もれる場合があります。</p>
          </div>
        </div>
        <div className="mt-3">
          <label htmlFor="measurement_note" className="block text-sm font-medium">
            寸法のメモ（任意）
          </label>
          <textarea
            id="measurement_note"
            name="measurement_note"
            rows={2}
            maxLength={500}
            placeholder="例: 手持ちの着物の身丈は〇cmで、ちょうどよかったです"
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

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

      {/* 相談（指名依頼）は一人の和裁士にだけ届くので、級位の指定は意味がない */}
      {!directedTo && (
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
      )}

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
        {pending ? "送信中…" : directedTo ? "相談を送る" : "依頼を投稿する"}
      </button>
    </form>
  );
}
