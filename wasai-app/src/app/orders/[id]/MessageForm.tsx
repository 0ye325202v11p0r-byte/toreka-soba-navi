"use client";

import { useActionState, useRef, useEffect } from "react";
import { postMessage, type MessageFormState } from "./actions";

const initialState: MessageFormState = {};

export default function MessageForm({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(postMessage, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (!pending && !state.error) {
      formRef.current?.reset();
    }
  }, [pending, state.error]);

  return (
    <div className="mt-3">
      <form ref={formRef} action={formAction} className="flex gap-2">
        <input type="hidden" name="order_id" value={orderId} />
        <input
          name="body"
          required
          placeholder="メッセージを入力"
          className="flex-1 rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-elevated disabled:opacity-60"
        >
          送信
        </button>
      </form>
      {state.error && (
        <p role="alert" className="mt-2 text-sm text-warn">
          {state.error}
        </p>
      )}
    </div>
  );
}
