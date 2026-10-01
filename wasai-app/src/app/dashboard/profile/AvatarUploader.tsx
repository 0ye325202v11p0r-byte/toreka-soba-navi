"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadAvatar, type UploadState } from "./uploadActions";

const initialState: UploadState = {};

export default function AvatarUploader() {
  const [state, formAction, pending] = useActionState(uploadAvatar, initialState);
  const router = useRouter();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state.error, router]);

  return (
    <div className="inline-block">
      <label className="cursor-pointer text-xs text-link underline">
        {pending ? "アップロード中…" : "画像をアップロード"}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={pending}
          onChange={(e) => {
            if (!e.target.files?.length) return;
            // Rendered inside the profile <form>, so this can't be a <form>
            // of its own (nested forms are invalid HTML and broke hydration)
            // — dispatch the upload action directly instead. The input has
            // no name, so it's never sent along with the profile form.
            const formData = new FormData();
            for (const file of Array.from(e.target.files)) formData.append("file", file);
            startTransition(() => formAction(formData));
            e.target.value = "";
          }}
        />
      </label>
      {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
    </div>
  );
}
