"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { yen, dataQualityLabel, isAutoTracked, todayInTokyo } from "@/lib/format";
import { canSubmitTransaction } from "@/lib/formValidation";
import type { Transaction, TransactionType, PnlSummary, DataQuality } from "@/lib/types";
import CardPicker from "./CardPicker";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  current_price: number | null;
  data_quality: DataQuality | null;
  source_url: string | null;
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
  // Starts unselected (not cards[0]) — defaulting to an arbitrary real card
  // let a user who never touched the CardPicker submit a transaction for a
  // card they never chose, since the closed picker showed that card's name
  // indistinguishably from a deliberate selection (found in UX review,
  // 2026-09-12).
  const [cardId, setCardId] = useState("");
  const [type, setType] = useState<TransactionType>("buy");
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState<number | "">("");
  const [date, setDate] = useState(todayInTokyo);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cardById = new Map(cards.map((c) => [c.id, c]));

  const currentValue = pnl.holdings.reduce((sum, h) => {
    const price = cardById.get(h.cardId)?.current_price ?? 0;
    return sum + price * h.quantity;
  }, 0);
  const unrealizedPnl = currentValue - pnl.costBasisTotal;
  const totalPnl = unrealizedPnl + pnl.realizedPnl;

  async function addTransaction(e: React.FormEvent) {
    e.preventDefault();
    // Re-checks the same rule the submit button's disabled= already
    // enforces — belt and suspenders against implicit form submission
    // (e.g. Enter in the quantity/price/date fields) bypassing a disabled
    // button.
    if (!cardId) {
      setErrorMsg("カードを選択してください。");
      return;
    }
    if (!cardById.has(cardId)) {
      setErrorMsg("選択したカードが見つかりません。カードを選択し直してください。");
      return;
    }
    if (!canSubmitTransaction({ cardId, isKnownCard: true, pricePerUnit, quantity })) return;
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
    const { error } = await supabase.from("transactions").insert({
      user_id: user.id,
      card_id: cardId,
      type,
      quantity,
      price_per_unit: pricePerUnit,
      transaction_date: date,
    });
    setBusy(false);
    if (error) {
      setErrorMsg(`記録に失敗しました：${error.message}`);
      return;
    }
    setPricePerUnit("");
    router.refresh();
  }

  async function removeTransaction(id: string) {
    if (!window.confirm("この取引記録を削除しますか？この操作は取り消せません。")) return;
    setErrorMsg(null);
    const { error } = await supabase.from("transactions").delete().eq("id", id);
    if (error) {
      setErrorMsg(`削除に失敗しました：${error.message}`);
      return;
    }
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

      {errorMsg && (
        <div className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{errorMsg}</div>
      )}

      <form
        onSubmit={addTransaction}
        className="mb-6 flex flex-wrap items-end gap-2 rounded-lg border border-border bg-bg-elevated p-4"
      >
        <CardPicker cards={cards} value={cardId} onChange={setCardId} label="カード" />
        <div>
          <label htmlFor="txn-type" className="mb-1 block text-xs text-ink-muted">
            売買
          </label>
          <select
            id="txn-type"
            value={type}
            onChange={(e) => setType(e.target.value as TransactionType)}
            className="rounded-md border border-border bg-bg px-2 py-1.5"
          >
            <option value="buy">購入</option>
            <option value="sell">売却</option>
          </select>
        </div>
        <div>
          <label htmlFor="txn-quantity" className="mb-1 block text-xs text-ink-muted">
            枚数
          </label>
          <input
            id="txn-quantity"
            type="number"
            min={1}
            step={1}
            value={quantity}
            onChange={(e) => setQuantity(Number(e.target.value))}
            className="w-20 rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <div>
          <label htmlFor="txn-price" className="mb-1 block text-xs text-ink-muted">
            単価
          </label>
          <input
            id="txn-price"
            type="number"
            min={0}
            required
            value={pricePerUnit}
            onChange={(e) => setPricePerUnit(e.target.value === "" ? "" : Number(e.target.value))}
            className="w-28 rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <div>
          <label htmlFor="txn-date" className="mb-1 block text-xs text-ink-muted">
            日付
          </label>
          <input
            id="txn-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-border bg-bg px-2 py-1.5"
          />
        </div>
        <button
          type="submit"
          disabled={
            busy ||
            !canSubmitTransaction({ cardId, isKnownCard: cardById.has(cardId), pricePerUnit, quantity })
          }
          className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
        >
          記録する
        </button>
        {!cardId && (
          <p className="w-full text-xs text-ink-faint">まずカードを選択してください。</p>
        )}
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
          // Not "partial" specifically — any card the daily cron doesn't
          // auto-track (partial or flat) needs this warning; see
          // isAutoTracked() for why data_quality alone isn't the right
          // check (UX review, 2026-09-12).
          const stale = card ? !isAutoTracked(card) : false;
          return (
            <div
              key={h.cardId}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-3"
            >
              <div>
                <div className="font-medium">
                  {card?.name ?? h.cardId}
                  {stale && (
                    <span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] ${dataQualityLabel(card?.data_quality ?? null).cls}`}>
                      {dataQualityLabel(card?.data_quality ?? null).label}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-muted">
                  {h.quantity}枚 ・ 平均取得単価 {yen(h.avgCost)} ・ 評価額 {yen(value)}
                  {stale && "（価格は登録時点のまま自動更新されていません）"}
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
