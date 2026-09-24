"use client";

import { useActionState } from "react";
import { submitSpecConfirmation, type SpecConfirmationState } from "./actions";

const initialState: SpecConfirmationState = {};

export default function SpecConfirmationForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(submitSpecConfirmation, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-bg-elevated p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <h3 className="text-sm font-semibold">仕様の最終確認を依頼者に送る</h3>
      <p className="text-xs text-ink-muted">
        チャット等でやり取りした内容を踏まえ、実際に何をどう作るかをここにまとめてください。依頼者の承認後は内容を変更できません——価格や納期を変える必要が出た場合は、その前にチャットでご相談ください。
      </p>

      <div>
        <label htmlFor="spec_text" className="block text-sm font-medium">
          最終仕様
        </label>
        <textarea
          id="spec_text"
          name="spec_text"
          required
          rows={6}
          placeholder="寸法・仕上げ方・特殊な指定など、確定した内容を具体的に"
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
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
        {pending ? "送信中…" : "依頼者に確認を送る"}
      </button>
    </form>
  );
}
