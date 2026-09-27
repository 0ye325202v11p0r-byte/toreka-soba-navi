"use client";

import { useActionState } from "react";
import { createCheckoutForOrder, type CheckoutRetryState } from "./actions";

const initialState: CheckoutRetryState = {};

export default function PaymentRetryButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(createCheckoutForOrder, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "移動中…" : "支払いへ進む"}
      </button>
      {state.error && <p role="alert" className="mt-2 text-sm text-warn">{state.error}</p>}
    </form>
  );
}
