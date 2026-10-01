"use client";

import { useActionState } from "react";
import { setInquiryStatus, type InquiryStatusState } from "./actions";

const initialState: InquiryStatusState = {};

export default function StatusButton({ id, closed }: { id: string; closed: boolean }) {
  const [state, formAction, pending] = useActionState(setInquiryStatus, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={closed ? "open" : "closed"} />
      <button type="submit" disabled={pending} className="rounded-md border border-border px-3 py-2 text-sm disabled:opacity-60">
        {closed ? "未対応に戻す" : "対応済みにする"}
      </button>
      {state.error && <p role="alert" className="mt-1 text-sm text-warn">{state.error}</p>}
    </form>
  );
}
