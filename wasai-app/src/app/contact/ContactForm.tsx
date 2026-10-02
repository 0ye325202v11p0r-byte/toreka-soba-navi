"use client";

import { useActionState } from "react";
import { submitInquiry, type InquiryState } from "./actions";
import { INQUIRY_CATEGORIES } from "@/lib/inquiries";

const initialState: InquiryState = {};
const inputClass = "mt-1 w-full rounded-md border border-border bg-bg-elevated px-3 py-2 text-sm";

export default function ContactForm({
  defaultName,
  defaultEmail,
  defaultCategory,
}: {
  defaultName: string;
  defaultEmail: string;
  defaultCategory: string;
}) {
  const [state, formAction, pending] = useActionState(submitInquiry, initialState);

  if (state.done) {
    return (
      <p className="mt-6 rounded-md bg-good-soft p-4 text-sm text-good">
        お問い合わせを受け付けました。返信は、入力いただいたメールアドレスにお送りします。
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="name" className="block text-sm font-medium">
          お名前
        </label>
        <input id="name" name="name" required maxLength={100} defaultValue={defaultName} className={inputClass} />
      </div>
      <div>
        <label htmlFor="email" className="block text-sm font-medium">
          返信先のメールアドレス
        </label>
        <input id="email" name="email" type="email" required defaultValue={defaultEmail} className={inputClass} />
      </div>
      <div>
        <label htmlFor="category" className="block text-sm font-medium">
          お問い合わせの種類
        </label>
        <select id="category" name="category" required defaultValue={defaultCategory} className={inputClass}>
          <option value="" disabled>
            選択してください
          </option>
          {INQUIRY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="body" className="block text-sm font-medium">
          内容
        </label>
        <textarea id="body" name="body" required rows={6} maxLength={4000} className={inputClass} />
      </div>
      {/* Hidden from people; only form-filling bots see and fill it. */}
      <div aria-hidden="true" className="hidden">
        <label htmlFor="website">website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      {state.error && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {state.error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-md bg-accent px-4 py-3 font-semibold text-bg-elevated hover:bg-accent-strong transition-colors disabled:opacity-60"
      >
        {pending ? "送信中…" : "送信する"}
      </button>
    </form>
  );
}
