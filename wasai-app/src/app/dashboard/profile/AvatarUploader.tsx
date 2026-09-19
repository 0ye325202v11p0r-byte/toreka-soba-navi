"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadAvatar, type UploadState } from "./uploadActions";

const initialState: UploadState = {};

export default function AvatarUploader() {
  const [state, formAction, pending] = useActionState(uploadAvatar, initialState);
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
    <form ref={formRef} action={formAction} className="inline-block">
      <label className="cursor-pointer text-xs text-accent-strong underline">
        {pending ? "アップロード中…" : "画像をアップロード"}
        <input
          type="file"
          name="file"
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
