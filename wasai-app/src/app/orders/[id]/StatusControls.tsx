"use client";

import { useActionState, useState, type ReactNode } from "react";
import { openDispute, updateOrderStatus, type StatusFormState } from "./actions";
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

function DisputeButton({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(openDispute, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="order_id" value={orderId} />
      <button
        type="submit"
        disabled={pending}
        className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-60"
      >
        運営に相談する
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
  deliveryLocked,
  everDelivered,
  revisionsLeft,
  disputed,
}: {
  orderId: string;
  status: OrderStatus;
  viewerRole: "client" | "craftsman";
  deliveryLocked: boolean;
  everDelivered: boolean;
  revisionsLeft: number;
  disputed: boolean;
}) {
  const buttons: ReactNode[] = [];
  let note: ReactNode = null;

  if (status === "in_progress" && viewerRole === "craftsman" && !deliveryLocked) {
    buttons.push(<DeliverButton key="deliver" orderId={orderId} />);
  }
  if (status === "delivered" && viewerRole === "client") {
    buttons.push(
      <StatusButton key="complete" orderId={orderId} nextStatus="completed" label="納品を確認して完了にする" />
    );
    if (!disputed && revisionsLeft > 0) {
      buttons.push(
        <StatusButton
          key="revision"
          orderId={orderId}
          nextStatus="in_progress"
          label={`修正を依頼する（残り${revisionsLeft}回）`}
          variant="danger"
        />
      );
    }
    if (!disputed) buttons.push(<DisputeButton key="dispute" orderId={orderId} />);
    note = disputed
      ? "運営に相談中です。運営が双方に事情を確認し、和裁士への支払いか返金かを決めます。相談中は自動で完了しません。問題が解決した場合は「完了にする」を押してください。"
      : "仕上がりに問題がある場合は、まずメッセージで和裁士に伝え、修正を依頼してください。それでも解決しない場合は運営に相談できます。何もしないまま納品から7日たつと、自動的に完了になります。納品後は、依頼者からキャンセル（返金）はできません。";
  }
  // Once delivered — even if it has since gone back for changes — the
  // client can't cancel (= full refund) on their own any more.
  if ((status === "pending_payment" || status === "in_progress") && viewerRole === "client" && !everDelivered) {
    buttons.push(
      <StatusButton key="cancel" orderId={orderId} nextStatus="cancelled" label="キャンセルする" variant="danger" />
    );
  }
  if (status === "delivered" && viewerRole === "craftsman") {
    buttons.push(
      <StatusButton
        key="craftsman-agree-cancel"
        orderId={orderId}
        nextStatus="cancelled"
        label="話し合いの結果、キャンセルに応じる（代金は全額返金）"
        variant="danger"
      />
    );
    if (disputed) note = "依頼者が運営に相談しています。運営から事情をうかがう場合があります。相談中は自動で完了しません。";
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

  if (buttons.length === 0 && !note) return null;

  return (
    <div>
      {note && <p className="mb-2 rounded-md bg-bg-elevated p-3 text-xs text-ink-muted">{note}</p>}
      <div className="flex flex-wrap gap-2">{buttons}</div>
    </div>
  );
}
