"use client";

import { useActionState } from "react";
import { toggleFavorite, type FavoriteState } from "./actions";

const initialState: FavoriteState = {};

export default function FavoriteButton({ craftsmanId, favorited }: { craftsmanId: string; favorited: boolean }) {
  const [state, formAction, pending] = useActionState(toggleFavorite, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="craftsman_id" value={craftsmanId} />
      <input type="hidden" name="favorite" value={(!favorited).toString()} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={favorited}
        className={`w-full rounded-md border px-4 py-3 text-sm font-semibold disabled:opacity-60 ${
          favorited ? "border-accent bg-accent-soft text-accent-strong" : "border-border hover:bg-bg-sunken"
        }`}
      >
        {favorited ? "★ お気に入りに登録済み" : "☆ お気に入りに追加"}
      </button>
      {state.error && <p role="alert" className="mt-1 text-sm text-warn">{state.error}</p>}
    </form>
  );
}
