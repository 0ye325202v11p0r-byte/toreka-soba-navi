"use client";

import { useActionState } from "react";
import { startOnboarding, type OnboardingState } from "./actions";

const initialState: OnboardingState = {};

export default function OnboardButton({ label }: { label: string }) {
  const [state, formAction, pending] = useActionState(startOnboarding, initialState);

  return (
    <form action={formAction}>
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
