"use client";

import { useActionState } from "react";
import { closeRequest, type CloseRequestState } from "./actions";

const initialState: CloseRequestState = {};

export default function CloseRequestButton({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(closeRequest, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(e) => {
        if (!confirm("この依頼を締め切りますか？掲示板に表示されなくなり、届いている提案はすべて見送りになります。")) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="request_id" value={requestId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-warn px-3 py-2 text-sm text-warn disabled:opacity-60"
      >
        {pending ? "締め切り中…" : "この依頼を締め切る"}
      </button>
      {state.error && <p role="alert" className="mt-1 text-sm text-warn">{state.error}</p>}
    </form>
  );
}
