"use client";

import { useActionState, useState, type ReactNode } from "react";
import { updateOrderStatus, type StatusFormState } from "./actions";
import type { OrderStatus } from "@/lib/types";

const initialState: StatusFormState = {};

// Yamato/Sagawa's standard per-shipment compensation caps at ¥300,000
// without extra insurance; above that, without action, an expensive kimono
// in transit could go uncompensated if something goes wrong.
const CARRIER_COMPENSATION_LIMIT = 300000;

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

function DeliverButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(updateOrderStatus, initialState);
  const [declaredValue, setDeclaredValue] = useState("");
  const exceedsCompensationLimit =
    declaredValue !== "" && Number(declaredValue) > CARRIER_COMPENSATION_LIMIT;

  return (
    <form action={formAction} className="w-full space-y-2 rounded-lg border border-border bg-bg-elevated p-3">
      <input type="hidden" name="order_id" value={orderId} />
      <input type="hidden" name="next_status" value="delivered" />
      <p className="text-xs font-semibold">納品する</p>
      <p className="text-xs text-ink-muted">
        配送方法・追跡番号を残しておくと、届いたかどうかでの行き違いを防げます（任意）。
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          name="shipping_method"
          placeholder="配送方法（例: ヤマト運輸）"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        />
        <input
          name="tracking_number"
          placeholder="追跡番号（任意）"
          className="min-w-0 flex-1 rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        />
      </div>
      <div>
        <input
          name="declared_value"
          type="number"
          min={0}
          value={declaredValue}
          onChange={(e) => setDeclaredValue(e.target.value)}
          placeholder="品物の想定価値（任意・円）"
          className="w-full rounded-md border border-border bg-bg px-2 py-1.5 text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          宅急便・飛脚宅配便は1個30万円まで、ゆうパックは通常30万円（セキュリティサービス利用時50万円）まで配送業者の補償が自動で付きます。それを超える場合は運送保険等のご検討を。
        </p>
        {exceedsCompensationLimit && (
          <p role="alert" className="mt-1 text-xs text-warn">
            30万円を超える想定価値です。標準の補償上限を超えるため、佐川急便の運送保険やゆうパックのセキュリティサービスなど、価値に見合った配送方法のご利用をおすすめします。
          </p>
        )}
      </div>
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
      >
        {pending ? "送信中…" : "納品済みにする"}
      </button>
      {state.error && <p role="alert" className="text-xs text-warn">{state.error}</p>}
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
    buttons.push(<DeliverButton key="deliver" orderId={orderId} />);
  }
  if (status === "delivered" && viewerRole === "client") {
    buttons.push(
      <StatusButton key="complete" orderId={orderId} nextStatus="completed" label="納品を確認して完了にする" />
    );
  }
  if (
    (status === "pending_payment" || status === "in_progress" || status === "delivered") &&
    viewerRole === "client"
  ) {
    buttons.push(
      <StatusButton key="cancel" orderId={orderId} nextStatus="cancelled" label="キャンセルする" variant="danger" />
    );
  }
  if (status === "in_progress" && viewerRole === "craftsman") {
    buttons.push(
      <StatusButton
        key="craftsman-cancel"
        orderId={orderId}
        nextStatus="cancelled"
        label="対応できないためキャンセルする"
        variant="danger"
      />
    );
  }

  if (buttons.length === 0) return null;

  return <div className="flex flex-wrap gap-2">{buttons}</div>;
}
