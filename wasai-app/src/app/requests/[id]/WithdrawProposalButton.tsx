"use client";

import { useActionState } from "react";
import { withdrawProposal, type WithdrawProposalState } from "./actions";

const initialState: WithdrawProposalState = {};

export default function WithdrawProposalButton({ proposalId }: { proposalId: string }) {
  const [state, formAction, pending] = useActionState(withdrawProposal, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="proposal_id" value={proposalId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-warn px-3 py-1.5 text-sm text-warn disabled:opacity-60"
      >
        {pending ? "取り下げ中…" : "提案を取り下げる"}
      </button>
      {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
    </form>
  );
}
