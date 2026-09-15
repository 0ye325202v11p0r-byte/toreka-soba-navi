"use client";

import { useActionState } from "react";
import { respondProposal, type RespondProposalState } from "./actions";

const initialState: RespondProposalState = {};

export default function RespondProposalButtons({ proposalId }: { proposalId: string }) {
  const [state, formAction, pending] = useActionState(respondProposal, initialState);

  return (
    <div>
      <div className="flex gap-2">
        <form action={formAction}>
          <input type="hidden" name="proposal_id" value={proposalId} />
          <input type="hidden" name="decision" value="accepted" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-good px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
          >
            承諾する
          </button>
        </form>
        <form action={formAction}>
          <input type="hidden" name="proposal_id" value={proposalId} />
          <input type="hidden" name="decision" value="declined" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
          >
            見送る
          </button>
        </form>
      </div>
      {state.error && (
        <p role="alert" className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}
    </div>
  );
}
