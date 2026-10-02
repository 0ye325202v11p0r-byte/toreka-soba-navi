"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadCertificate, type UploadState } from "./uploadActions";

const initialState: UploadState = {};

export default function CertificateUploader({ signedUrl }: { signedUrl: string | null }) {
  const [state, formAction, pending] = useActionState(uploadCertificate, initialState);
  const router = useRouter();
  const wasPending = useRef(false);

  useEffect(() => {
    if (wasPending.current && !pending && !state.error) {
      router.refresh();
    }
    wasPending.current = pending;
  }, [pending, state.error, router]);

  return (
    <div>
      {signedUrl && (
        <p className="mb-1">
          <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-link underline">
            現在の証明書を確認する
          </a>
          <span className="ml-1 text-xs text-ink-faint">（このリンクは1時間で無効になります）</span>
        </p>
      )}
      <div>
        <label className="cursor-pointer text-xs text-link underline">
          {pending ? "アップロード中…" : signedUrl ? "証明書を差し替える" : "証明書をアップロード"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
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
    </div>
  );
}
