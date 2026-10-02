"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { shrinkImage } from "@/lib/shrinkImage";

interface UploadState {
  error?: string;
}
type Action = (prevState: UploadState, formData: FormData) => Promise<UploadState>;

// Upload / replace / remove one image (トップ画像, メニューの写真). Works
// inside another <form> (the profile form), so it dispatches the actions
// directly instead of being a form itself — same as AvatarUploader.
export default function ImageUploadButton({
  upload,
  remove,
  fields = {},
  hasImage,
  label,
}: {
  upload: Action;
  remove: Action;
  fields?: Record<string, string>;
  hasImage: boolean;
  label: string;
}) {
  const [uploadState, uploadAction, uploading] = useActionState(upload, {});
  const [removeState, removeAction, removing] = useActionState(remove, {});
  const [preparing, setPreparing] = useState(false);
  const router = useRouter();
  const wasBusy = useRef(false);
  const busy = uploading || removing || preparing;
  const error = uploadState.error ?? removeState.error;

  useEffect(() => {
    if (wasBusy.current && !busy && !error) router.refresh();
    wasBusy.current = busy;
  }, [busy, error, router]);

  const formWith = (extra?: [string, File]) => {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    if (extra) fd.append(extra[0], extra[1]);
    return fd;
  };

  return (
    <div className="flex flex-wrap items-center gap-3 text-sm">
      <label className={`cursor-pointer rounded-md border border-border px-3 py-1.5 font-semibold hover:bg-bg-sunken ${busy ? "opacity-60" : ""}`}>
        {preparing || uploading ? "アップロード中…" : hasImage ? `${label}を変える` : `${label}を設定する`}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const picked = e.target.files?.[0];
            e.target.value = "";
            if (!picked) return;
            setPreparing(true);
            void shrinkImage(picked)
              .then((file) => startTransition(() => uploadAction(formWith(["file", file]))))
              .finally(() => setPreparing(false));
          }}
        />
      </label>
      {hasImage && (
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!window.confirm(`${label}を外します。よろしいですか？`)) return;
            startTransition(() => removeAction(formWith()));
          }}
          className="text-link underline disabled:opacity-60"
        >
          {removing ? "外しています…" : "外す"}
        </button>
      )}
      {error && (
        <p role="alert" className="w-full text-xs text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
