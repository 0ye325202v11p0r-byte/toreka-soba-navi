"use client";

import { useActionState } from "react";
import { submitProposal, type ProposalFormState } from "./actions";

const initialState: ProposalFormState = {};

export default function ProposalForm({ requestId }: { requestId: string }) {
  const [state, formAction, pending] = useActionState(submitProposal, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-bg-elevated p-4">
      <input type="hidden" name="request_id" value={requestId} />
      <h3 className="text-sm font-semibold">この依頼に提案する</h3>

      <div>
        <label htmlFor="price" className="block text-sm font-medium">
          見積り価格（円）
        </label>
        <input
          id="price"
          name="price"
          type="number"
          min={50}
          required
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="delivery_days" className="block text-sm font-medium">
          納期目安（日）
        </label>
        <input
          id="delivery_days"
          name="delivery_days"
          type="number"
          min={1}
          max={365}
          required
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
        <p className="mt-1 text-xs text-ink-muted">
          着物・反物がお手元に届いてから仕上げて発送するまでのおおよその日数です。依頼者のお申込み前の確認画面に表示されます。
        </p>
      </div>

      <div>
        <label htmlFor="message" className="block text-sm font-medium">
          メッセージ
        </label>
        <textarea
          id="message"
          name="message"
          required
          rows={4}
          placeholder="対応可能な内容・実績など"
          className="mt-1 w-full rounded-md border border-border bg-bg px-3 py-2 text-sm"
        />
      </div>

      {state.error && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "送信中…" : "提案を送る"}
      </button>
    </form>
  );
}
