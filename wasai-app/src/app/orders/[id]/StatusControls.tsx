"use client";

import { useActionState, type ReactNode } from "react";
import { updateOrderStatus, type StatusFormState } from "./actions";
import type { OrderStatus } from "@/lib/types";

const initialState: StatusFormState = {};

function StatusButton({
  orderId,
  nextStatus,
  label,
  variant = "primary",
}: {
  orderId: string;
  nextStatus: OrderStatus;
  label: string;
  variant?: "primary" | "danger";
}) {
  const [state, formAction, pending] = useActionState(updateOrderStatus, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="next_status" value={nextStatus} />
      <button
        type="submit"
        disabled={pending}
        className={
          variant === "primary"
            ? "rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
            : "rounded-md border border-warn px-3 py-1.5 text-sm text-warn disabled:opacity-60"
        }
      >
        {label}
      </button>
      {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
    </form>
  );
}

export default function StatusControls({
  orderId,
  status,
  viewerRole,
}: {
  orderId: string;
  status: OrderStatus;
  viewerRole: "client" | "craftsman";
}) {
  const buttons: ReactNode[] = [];

  if (status === "in_progress" && viewerRole === "craftsman") {
    buttons.push(
      <StatusButton key="deliver" orderId={orderId} nextStatus="delivered" label="納品する" />
    );
  }
  if (status === "delivered" && viewerRole === "client") {
    buttons.push(
      <StatusButton key="complete" orderId={orderId} nextStatus="completed" label="納品を確認して完了にする" />
    );
  }
  if ((status === "in_progress" || status === "delivered") && viewerRole === "client") {
    buttons.push(
      <StatusButton key="cancel" orderId={orderId} nextStatus="cancelled" label="キャンセルする" variant="danger" />
    );
  }

  if (buttons.length === 0) return null;

  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}
