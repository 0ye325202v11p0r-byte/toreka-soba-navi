"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { uploadCertificate, type UploadState } from "./uploadActions";

const initialState: UploadState = {};

export default function CertificateUploader({ signedUrl }: { signedUrl: string | null }) {
  const [state, formAction, pending] = useActionState(uploadCertificate, initialState);
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
    <div>
      {signedUrl && (
        <p className="mb-1">
          <a href={signedUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-strong underline">
            現在の証明書を確認する
          </a>
          <span className="ml-1 text-xs text-ink-faint">（このリンクは1時間で無効になります）</span>
        </p>
      )}
      <form ref={formRef} action={formAction}>
        <label className="cursor-pointer text-xs text-accent-strong underline">
          {pending ? "アップロード中…" : signedUrl ? "証明書を差し替える" : "証明書をアップロード"}
          <input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp,image/gif,application/pdf"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              if (e.target.files?.length) formRef.current?.requestSubmit();
            }}
          />
        </label>
        {state.error && <p role="alert" className="mt-1 text-xs text-warn">{state.error}</p>}
      </form>
    </div>
  );
}
