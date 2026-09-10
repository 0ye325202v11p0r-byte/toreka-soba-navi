"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { yen } from "@/lib/format";
import type { Transaction, TransactionType, PnlSummary } from "@/lib/types";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  current_price: number | null;
}

export default function PortfolioClient({
  transactions,
  cards,
  pnl,
}: {
  transactions: Transaction[];
  cards: CardOption[];
  pnl: PnlSummary;
}) {
  const router = useRouter();
  const supabase = createClient();
  const [cardId, setCardId] = useState(cards[0]?.id ?? "");
  const [type, setType] = useState<TransactionType>("buy");
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState<number | "">("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const cardById = new Map(cards.map((c) => [c.id, c]));

  const currentValue = pnl.holdings.reduce((sum, h) => {
    const price = cardById.get(h.cardId)?.current_price ?? 0;
    return sum + price * h.quantity;
  }, 0);
  const unrealizedPnl = currentValue - pnl.costBasisTotal;
  const totalPnl = unrealizedPnl + pnl.realizedPnl;

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    if (!cardId || pricePerUnit === "") return;
    setBusy(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transactions").insert({
      user_id: user.id,
      card_id: cardId,
      type,
      quantity,
      price_per_unit: pricePerUnit,
      transaction_date: date,
    });
    setBusy(false);
    router.refresh();
  }

  async function removeTransaction(id: string) {
    await supabase.from("transactions").delete().eq("id", id);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="保有評価額" value={yen(currentValue)} />
        <StatBox label="含み損益" value={yen(unrealizedPnl)} tone={unrealizedPnl} />
        <StatBox label="実現損益（確定済み）" value={yen(pnl.realizedPnl)} tone={pnl.realizedPnl} />
        <StatBox label="合計損益" value={yen(totalPnl)} tone={totalPnl} emphasize />
      </div>

      <form
        onSubmit={addTransaction}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg-elevated p-4"
      >
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
          <label className="mb-1 block text-xs text-ink-muted">売買</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="rounded-md border border-border bg-bg px-2 py-1.5"
          >
            <option value="buy">購入</option>
            <option value="sell">売却</option>
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
          <label className="mb-1 block text-xs text-ink-muted">単価</label>
          <input
            type="number"
            required
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-28 rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs text-ink-muted">日付</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
        >
          記録する
        </button>
      </form>

      <h2 className="mb-2 text-sm font-semibold text-ink-muted">保有中</h2>
      <div className="mb-6 space-y-2">
        {pnl.holdings.length === 0 && (
          <p className="text-sm text-ink-faint">保有中のカードはありません。</p>
        )}
        {pnl.holdings.map((h) => {
          const card = cardById.get(h.cardId);
          const value = (card?.current_price ?? 0) * h.quantity;
          const gain = value - h.costBasis;
          return (
            <div
              key={h.cardId}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-3"
            >
              <div>
                <div className="font-medium">{card?.name ?? h.cardId}</div>
                <div className="text-xs text-ink-muted">
                  {h.quantity}枚 ・ 平均取得単価 {yen(h.avgCost)} ・ 評価額 {yen(value)}
                </div>
              </div>
              <span className={gain >= 0 ? "text-good" : "text-warn"}>{yen(gain)}</span>
            </div>
          );
        })}
      </div>

      <h2 className="mb-2 text-sm font-semibold text-ink-muted">取引履歴</h2>
      <div className="space-y-1">
        {transactions.length === 0 && (
          <p className="text-sm text-ink-faint">まだ取引が記録されていません。</p>
        )}
        {transactions.map((t) => {
          const card = cardById.get(t.card_id);
          return (
            <div
              key={t.id}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-2.5 text-sm"
            >
              <div>
                <span className={t.type === "buy" ? "text-accent-strong" : "text-good"}>
                  {t.type === "buy" ? "購入" : "売却"}
                </span>{" "}
                {card?.name ?? t.card_id} × {t.quantity} @ {yen(t.price_per_unit)}
                <span className="ml-2 text-xs text-ink-faint">{t.transaction_date}</span>
              </div>
              <button
                onClick={() => removeTransaction(t.id)}
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

function StatBox({
  label,
  value,
  tone,
  emphasize,
}: {
  label: string;
  value: string;
  tone?: number;
  emphasize?: boolean;
}) {
  const toneClass = tone === undefined ? "" : tone >= 0 ? "text-good" : "text-warn";
  return (
    <div className={`rounded-lg border border-border bg-bg-elevated p-3 ${emphasize ? "ring-1 ring-accent" : ""}`}>
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-1 font-mono text-lg ${toneClass}`}>{value}</div>
    </div>
  );
}
