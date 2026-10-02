"use client";

import { useActionState, useState } from "react";
import { createRequest, type RequestFormState } from "./actions";
import { GARMENT_TYPES } from "@/lib/types";
import {
  BUILD_OPTIONS,
  MEASUREMENT_FIELDS,
  browserRequiredKeys,
  measurementRequirement,
  measurementRequirementText,
} from "@/lib/measurements";

const initialState: RequestFormState = {};

export interface ConsultMenu {
  title: string;
  garmentType: string;
  price: number;
  deliveryDays: number;
}

export default function RequestForm({
  directedTo,
  directedName,
  menu,
}: {
  directedTo?: string;
  directedName?: string;
  // Set when the client came from a 仕立てメニュー's 「このメニューで相談する」.
  menu?: ConsultMenu;
}) {
  const [state, formAction, pending] = useActionState(createRequest, initialState);
  // Which measurements are required depends on the garment (see
  // measurementRequirement), so the fieldset follows the selection.
  const [garment, setGarment] = useState(menu?.garmentType ?? "");
  const requirement = measurementRequirement(garment);
  const requiredKeys: string[] = browserRequiredKeys(requirement);
  const requirementText = measurementRequirementText(garment);

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
      {menu && (
        <div className="rounded-md border border-border p-3 text-sm">
          <p className="text-xs text-ink-muted">相談するメニュー</p>
          <p className="mt-1 font-semibold">{menu.title}</p>
          <p className="mt-1 text-ink-muted">
            ¥{menu.price.toLocaleString()}〜 ・ 納期目安 {menu.deliveryDays}日
          </p>
          <p className="mt-2 text-xs text-ink-muted">
            寸法や希望を送ると、和裁士から見積り（提案）が届きます。内容と金額に納得してから申し込み・お支払いに進めます。
          </p>
        </div>
      )}
      <div>
        <label htmlFor="title" className="block text-sm font-medium">
          タイトル
        </label>
        <input
          id="title"
          name="title"
          required
          defaultValue={menu ? `「${menu.title}」について相談` : undefined}
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
          value={garment}
          onChange={(e) => setGarment(e.target.value)}
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
        <legend className="px-1 text-sm font-semibold">
          {requirementText ? "寸法（必須の項目があります）" : "寸法（わかる範囲で・任意）"}
        </legend>
        {requirementText && (
          <p className="mb-2 rounded-md bg-link-soft px-3 py-2 text-sm text-ink">{requirementText}</p>
        )}
        <p className="text-xs text-ink-muted">
          {requirementText
            ? "測り方は各項目の説明を見てください。前巾・後巾などは和裁士がヒップから割り出し、足りない寸法は和裁士がメッセージで確認します。"
            : "わからない項目は空欄で大丈夫です。足りない寸法は和裁士がメッセージで確認します。"}
          寸法は、あなたとログインした和裁士だけが見られます（掲示板には表示されません）。
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {MEASUREMENT_FIELDS.map((f) => (
            <div key={f.key}>
              <label htmlFor={f.key} className="block text-sm font-medium">
                {f.label}（cm）
                {requiredKeys.includes(f.key) && (
                  <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[11px] font-semibold text-bg-elevated">必須</span>
                )}
              </label>
              <input
                id={f.key}
                name={f.key}
                required={requiredKeys.includes(f.key)}
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
            <p className="mt-1 text-xs text-ink-muted">男性の着物で寸法がわからない場合は、身長と体型を入れてください。</p>
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
