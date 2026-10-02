"use client";

import { useActionState } from "react";
import { deleteService, setServiceStatus, type ManageServiceState } from "./actions";

const initialState: ManageServiceState = {};

export default function ManageServiceButtons({ serviceId, published }: { serviceId: string; published: boolean }) {
  const [statusState, statusAction, statusPending] = useActionState(setServiceStatus, initialState);
  const [deleteState, deleteAction, deletePending] = useActionState(deleteService, initialState);
  const error = statusState.error ?? deleteState.error;

  return (
    <div className="space-y-2">
      <p className="text-sm text-ink-muted">
        自分が作った仕立てメニューです。{published ? "" : "現在は停止中で、他の人には表示されていません。"}
      </p>
      <form action={statusAction}>
        <input type="hidden" name="service_id" value={serviceId} />
        <input type="hidden" name="status" value={published ? "draft" : "published"} />
        <button
          type="submit"
          disabled={statusPending}
          className="w-full rounded-md border border-border px-4 py-2 text-sm font-semibold hover:bg-bg transition-colors disabled:opacity-60"
        >
          {statusPending ? "更新中…" : published ? "公開を停止する" : "公開を再開する"}
        </button>
      </form>
      <form
        action={deleteAction}
        onSubmit={(e) => {
          if (!window.confirm("このメニューを削除します。よろしいですか？（過去の取引の記録は残ります）")) e.preventDefault();
        }}
      >
        <input type="hidden" name="service_id" value={serviceId} />
        <button
          type="submit"
          disabled={deletePending}
          className="w-full rounded-md px-4 py-2 text-sm text-warn hover:underline disabled:opacity-60"
        >
          {deletePending ? "削除中…" : "このメニューを削除する"}
        </button>
      </form>
      {error && (
        <p role="alert" className="rounded-md bg-warn-soft px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}
    </div>
  );
}
