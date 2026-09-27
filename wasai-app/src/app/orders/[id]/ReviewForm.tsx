"use client";

import { useActionState } from "react";
import { submitReview, type ReviewFormState } from "./actions";

const initialState: ReviewFormState = {};

export default function ReviewForm({ orderId, revieweeLabel }: { orderId: string; revieweeLabel: string }) {
  const [state, formAction, pending] = useActionState(submitReview, initialState);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border border-border bg-bg-elevated p-4">
      <input type="hidden" name="order_id" value={orderId} />
      <h3 className="text-sm font-semibold">{revieweeLabel}を評価する</h3>

      <div>
        <label htmlFor="rating" className="block text-sm font-medium">
          評価
        </label>
        <select
          id="rating"
          name="rating"
          required
          defaultValue="5"
          className="mt-1 rounded-md border border-border bg-bg px-3 py-2 text-sm"
        >
          {[5, 4, 3, 2, 1].map((n) => (
            <option key={n} value={n}>
              {"★".repeat(n)}
              {"☆".repeat(5 - n)}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="comment" className="block text-sm font-medium">
          コメント（任意）
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={3}
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
        className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-bg-elevated disabled:opacity-60"
      >
        {pending ? "送信中…" : "レビューを送る"}
      </button>
    </form>
  );
}
