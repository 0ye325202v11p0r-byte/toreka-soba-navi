"use client";

import { useActionState } from "react";
import { orderService, type OrderFromServiceState } from "./actions";

const initialState: OrderFromServiceState = {};

export default function OrderButton({ serviceId }: { serviceId: string }) {
  const [state, formAction, pending] = useActionState(orderService, initialState);

  return (
    <form action={formAction}>
      <input type="hidden" name="service_id" value={serviceId} />
      {state.error && (
        <p role="alert" className="mb-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "依頼を作成中…" : "このサービスに依頼する"}
      </button>
    </form>
  );
}
