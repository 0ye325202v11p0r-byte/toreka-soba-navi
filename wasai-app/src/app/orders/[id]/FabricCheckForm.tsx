"use client";

import { useActionState } from "react";
import { submitFabricCheck, type FabricCheckState } from "./actions";

const initialState: FabricCheckState = {};

export default function FabricCheckForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(submitFabricCheck, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-bg-elevated p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <h3 className="text-sm font-semibold">反物の状態を記録する</h3>
      <p className="text-xs text-ink-muted">
        依頼者から届いた生地の状態を、作業を始める前に記録しておきます。一度記録すると変更できません——後から
        「元から傷んでいた」「量が違った」となった際に、双方で確認できる記録として残ります。
      </p>

      <div className="space-y-2 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" name="damage" />
          傷・汚れ・シミがある
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="shortage" />
          依頼内容に対して分量が不足している
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" name="odor" />
          カビ臭など気になる匂いがある
        </label>
      </div>

      <div>
        <label htmlFor="notes" className="block text-sm font-medium">
          補足（任意）
        </label>
        <textarea
          id="notes"
          name="notes"
          rows={3}
          placeholder="状態の詳細、届いた分量など"
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label className="block text-sm font-medium">写真（複数選択可・任意ですが推奨）</label>
        <input
          type="file"
          name="photos"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="mt-1 block w-full text-sm"
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
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-elevated disabled:opacity-60"
      >
        {pending ? "記録中…" : "記録する"}
      </button>
    </form>
  );
}
