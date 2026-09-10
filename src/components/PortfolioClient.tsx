"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { yen } from "@/lib/format";
import type { PortfolioItem } from "@/lib/types";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  current_price: number | null;
}

export default function PortfolioClient({
  initialItems,
  cards,
}: {
  initialItems: PortfolioItem[];
  cards: CardOption[];
}) {
  const router = useRouter();
  const supabase = createClient();
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [quantity, setQuantity] = useState(1);
  const [acquiredPrice, setAcquiredPrice] = useState<number | "">("");
  const [busy, setBusy] = useState(false);

  const cardById = new Map(cards.map((c) => [c.id, c]));

  const totalValue = initialItems.reduce((sum, item) => {
    const price = cardById.get(item.card_id)?.current_price ?? 0;
    return sum + price * item.quantity;
  }, 0);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    if (!cardId) return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("portfolio_items").insert({
      user_id: user.id,
      card_id: cardId,
      quantity,
      acquired_price: acquiredPrice === "" ? null : acquiredPrice,
    });
    setBusy(false);
    router.refresh();
  }

  async function removeItem(id: string) {
    await supabase.from("portfolio_items").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4 rounded-lg border border-border bg-bg-elevated p-4">
        <div className="text-sm text-ink-muted">保有評価額合計</div>
        <div className="text-2xl font-bold">{yen(totalValue)}</div>
      </div>

      <form onSubmit={addItem} className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg-elevated p-4">
        <div className="flex-1 min-w-40">
          <label className="mb-1 block text-xs text-ink-muted">カード</label>
          <select
            value={cardId}
            onChange={(e) => setCardId(e.target.value)}
            className="w-full rounded-md border border-border bg-bg px-2 py-1.5"
          >
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}（{c.rarity}）
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">枚数</label>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-20 rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">取得価格（任意）</label>
          <input
            type="number"
            value={acquiredPrice}
            onChange={(e) => setAcquiredPrice(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-28 rounded-md border border-border bg-bg px-2 py-1.5"
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
          const currentValue = (card?.current_price ?? 0) * item.quantity;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-3"
            >
              <div>
                <div className="font-medium">{card?.name ?? item.card_id}</div>
                <div className="text-xs text-ink-muted">
                  {item.quantity}枚 ・ 評価額 {yen(currentValue)}
                  {item.acquired_price ? `（取得 ${yen(item.acquired_price)}）` : ""}
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
