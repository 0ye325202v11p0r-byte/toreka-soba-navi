"use client";

import { useActionState } from "react";
import { resolveDispute, type ResolveDisputeState } from "./actions";

const initialState: ResolveDisputeState = {};

export default function ResolveButtons({ orderId }: { orderId: string }) {
  const [state, formAction, pending] = useActionState(resolveDispute, initialState);

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!confirm("和裁士に代金（手数料差引後）を支払い、取引を完了にします。よろしいですか？")) e.preventDefault();
          }}
        >
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="decision" value="completed" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md bg-good px-3 py-1.5 text-sm font-semibold text-bg-elevated disabled:opacity-60"
          >
            和裁士に支払う（完了にする）
          </button>
        </form>
        <form
          action={formAction}
          onSubmit={(e) => {
            if (!confirm("依頼者に代金を全額返金し、取引をキャンセルにします。よろしいですか？")) e.preventDefault();
          }}
        >
          <input type="hidden" name="order_id" value={orderId} />
          <input type="hidden" name="decision" value="cancelled" />
          <button
            type="submit"
            disabled={pending}
            className="rounded-md border border-warn px-3 py-1.5 text-sm text-warn disabled:opacity-60"
          >
            依頼者に返金する（キャンセル）
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
