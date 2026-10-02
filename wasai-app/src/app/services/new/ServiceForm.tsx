"use client";

import { useActionState, useState } from "react";
import { shrinkInputFiles } from "@/lib/shrinkImage";
import { createService, type ServiceFormState } from "./actions";
import { GARMENT_TYPES } from "@/lib/types";

const initialState: ServiceFormState = {};

export default function ServiceForm() {
  const [state, formAction, pending] = useActionState(createService, initialState);
  const [preparing, setPreparing] = useState(false);

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
          placeholder="例: 振袖の仕立て承ります（正絹対応）"
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
          説明
        </label>
        <textarea
          id="description"
          name="description"
          required
          rows={6}
          placeholder="対応可能な生地・寸法直しの範囲・納品方法など"
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label htmlFor="price" className="block text-sm font-medium">
            価格（円）
          </label>
          <input
            id="price"
            name="price"
            type="number"
            min={50}
            required
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="delivery_days" className="block text-sm font-medium">
            納期目安（日）
          </label>
          <input
            id="delivery_days"
            name="delivery_days"
            type="number"
            min={1}
            required
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="revision_count" className="block text-sm font-medium">
            修正回数
          </label>
          <input
            id="revision_count"
            name="revision_count"
            type="number"
            min={0}
            defaultValue={1}
            className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="image" className="block text-sm font-medium">
          メニューの写真（任意）
        </label>
        <input
          id="image"
          name="image"
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="mt-1 block w-full text-sm"
          onChange={(e) => {
            // Shrink a phone photo before the form sends it (lib/shrinkImage).
            const input = e.currentTarget;
            setPreparing(true);
            void shrinkInputFiles(input).finally(() => setPreparing(false));
          }}
        />
        <p className="mt-1 text-xs text-ink-muted">
          仕立てた着物の写真などがおすすめです。一覧のカードとメニューのページに表示されます。あとから変えることもできます。
        </p>
        {preparing && <p className="mt-1 text-xs text-ink-muted">写真を準備中…</p>}
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending || preparing}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "公開中…" : "メニューを公開する"}
      </button>
    </form>
  );
}
