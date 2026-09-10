"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pct } from "@/lib/format";
import type { WatchlistItem } from "@/lib/types";
import CardPicker from "./CardPicker";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  pct_vs_avg30: number | null;
}

export default function WatchlistClient({
  initialItems,
  cards,
}: {
  initialItems: WatchlistItem[];
  cards: CardOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [op, setOp] = useState<"lte" | "gte">("lte");
  const [value, setValue] = useState(-15);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cardById = new Map(cards.map((c) => [c.id, c]));

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!cardId) return;
    setBusy(true);
    setErrorMsg(null);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setBusy(false);
      setErrorMsg("ログイン状態を確認できませんでした。再度ログインしてください。");
      return;
    }
    const { error } = await supabase.from("watchlist_items").insert({
      user_id: user.id,
      card_id: cardId,
      alert_rule: { type: "pct_vs_avg30", op, value },
    });
    setBusy(false);
    if (error) {
      setErrorMsg(`登録に失敗しました：${error.message}`);
      return;
    }
    router.refresh();
  }

  async function removeItem(id: string) {
    setErrorMsg(null);
    const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
    if (error) {
      setErrorMsg(`削除に失敗しました：${error.message}`);
      return;
    }
    router.refresh();
  }

  return (
    <div>
      {errorMsg && (
        <div className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{errorMsg}</div>
      )}

      <form onSubmit={addItem} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg-elevated p-4">
        <CardPicker cards={cards} value={cardId} onChange={setCardId} label="カード" />
        <div>
          <label htmlFor="watch-op" className="mb-1 block text-xs text-ink-muted">
            条件
          </label>
          <select
            id="watch-op"
            value={op}
            onChange={(e) => setOp(e.target.value as "lte" | "gte")}
            className="rounded-md border border-border bg-bg px-2 py-1.5"
          >
            <option value="lte">30日平均比 以下</option>
            <option value="gte">30日平均比 以上</option>
          </select>
        </div>
        <div>
          <label htmlFor="watch-value" className="mb-1 block text-xs text-ink-muted">
            %値
          </label>
          <input
            id="watch-value"
            type="number"
            value={value}
            onChange={(e) => setValue(Number(e.target.value))}
            className="w-24 rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
        >
          追加
        </button>
      </form>

      <div className="space-y-2">
        {initialItems.length === 0 && (
          <p className="text-sm text-ink-faint">まだ何も登録されていません。</p>
        )}
        {initialItems.map((item) => {
          const card = cardById.get(item.card_id);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-3"
            >
              <div>
                <div className="font-medium">{card?.name ?? item.card_id}</div>
                <div className="text-xs text-ink-muted">
                  条件：30日平均比 {item.alert_rule.op === "lte" ? "以下" : "以上"} {item.alert_rule.value}%
                  （現在 {pct(card?.pct_vs_avg30)}）
                </div>
              </div>
              <button
                onClick={() => removeItem(item.id)}
                className="text-xs text-warn hover:underline"
              >
                削除
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
