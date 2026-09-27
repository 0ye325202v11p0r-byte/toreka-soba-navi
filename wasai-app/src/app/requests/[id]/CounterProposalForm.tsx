"use client";

import { useActionState, useState } from "react";
import { counterProposal, type CounterProposalState } from "./actions";

const initialState: CounterProposalState = {};

export default function CounterProposalForm({ proposalId }: { proposalId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(counterProposal, initialState);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted hover:text-ink transition-colors"
      >
        金額を提示して交渉する
      </button>
    );
  }

  return (
    <form action={formAction} className="space-y-2 rounded-md border border-border bg-bg p-3">
      <input type="hidden" name="proposal_id" value={proposalId} />
      <div>
        <label htmlFor={`countered_price-${proposalId}`} className="block text-xs font-medium">
          提示価格（円）
        </label>
        <input
          id={`countered_price-${proposalId}`}
          name="countered_price"
          type="number"
          min={50}
          required
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`countered_message-${proposalId}`} className="block text-xs font-medium">
          メッセージ（任意）
        </label>
        <textarea
          id={`countered_message-${proposalId}`}
          name="countered_message"
          rows={2}
          placeholder="この価格でお願いできますか、など"
          className="mt-1 w-full rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm"
        />
      </div>
      {state.error && <p role="alert" className="text-xs text-warn">{state.error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
        >
          {pending ? "送信中…" : "この価格を提示する"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-md border border-border px-3 py-1.5 text-sm text-ink-muted"
        >
          やめる
        </button>
      </div>
    </form>
  );
}
