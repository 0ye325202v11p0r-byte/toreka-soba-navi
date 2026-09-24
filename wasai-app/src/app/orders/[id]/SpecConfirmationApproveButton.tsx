"use client";

import { useActionState } from "react";
import { approveSpecConfirmation, type SpecApprovalState } from "./actions";

const initialState: SpecApprovalState = {};

export default function SpecConfirmationApproveButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(approveSpecConfirmation, initialState);

  return (
    <div className="mt-3">
      <p className="text-xs text-ink-muted">
        内容に相違がある場合は、承認せずに下のメッセージで和裁士にご連絡ください。
      </p>
      <form action={formAction} className="mt-2">
        <input type="hidden" name="order_id" value={orderId} />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-good px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
        >
          {pending ? "送信中…" : "この内容で承認する"}
        </button>
      </form>
      {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
    </div>
  );
}
