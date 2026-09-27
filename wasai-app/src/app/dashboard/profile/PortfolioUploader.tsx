"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { addPortfolioPhoto, type UploadState } from "./uploadActions";

const initialState: UploadState = {};

export default function PortfolioUploader() {
  const [state, formAction, pending] = useActionState(addPortfolioPhoto, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  const router = useRouter();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      router.refresh();
      formRef.current?.reset();
    }
    wasPending.current = pending;
  }, [pending, state.error, router]);

  return (
    <form ref={formRef} action={formAction} className="mt-2">
      <label className="cursor-pointer text-xs text-accent-strong underline">
        {pending ? "アップロード中…" : "写真をアップロード（複数選択可）"}
        <input
          type="file"
          name="files"
          multiple
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            if (e.target.files?.length) formRef.current?.requestSubmit();
          }}
        />
      </label>
      {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
    </form>
  );
}
