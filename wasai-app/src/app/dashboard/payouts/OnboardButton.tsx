"use client";

import { useActionState } from "react";
import { startOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export default function OnboardButton({
  label,
  needsAgencyConsent,
}: {
  label: string;
  needsAgencyConsent: boolean;
}) {
  const [state, formAction, pending] = useActionState(startOnboarding, initialState);

  return (
    <form action={formAction}>
      {needsAgencyConsent && (
        <label className="mb-3 flex items-start gap-2 rounded-md border border-border p-3 text-sm">
          <input type="checkbox" name="agree_payment_agency" value="yes" required className="mt-0.5" />
          <span>
            依頼者からの代金を、運営者が私の代わりに受け取り、取引完了後に手数料を差し引いて私に引き渡すこと（
            <a href="/terms" target="_blank" className="text-accent-strong underline">
              利用規約
            </a>
            第5条）に同意します。依頼者が支払いを済ませた時点で、その代金は私への支払いが済んだものとして扱われます。
          </span>
        </label>
      )}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-accent px-4 py-2 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "Stripeへ移動中…" : label}
      </button>
      {state.error && (
        <p role="alert" className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}
    </form>
  );
}
