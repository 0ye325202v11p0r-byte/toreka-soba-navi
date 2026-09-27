"use client";

import { useActionState } from "react";
import { setGradeVerified, type VerifyGradeState } from "./actions";

const initialState: VerifyGradeState = {};

export default function VerifyButton({
  profileId,
  verified,
}: {
  profileId: string;
  verified: boolean;
}) {
  const [state, formAction, pending] = useActionState(setGradeVerified, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="profile_id" value={profileId} />
      <input type="hidden" name="verified" value={(!verified).toString()} />
      <button
        type="submit"
        disabled={pending}
        className={
          verified
            ? "rounded-md border border-warn px-3 py-1.5 text-sm text-warn disabled:opacity-60"
            : "rounded-md bg-good px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
        }
      >
        {pending ? "処理中…" : verified ? "確認を取り消す" : "確認済みにする"}
      </button>
      {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
    </form>
  );
}
