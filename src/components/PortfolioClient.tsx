"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { track } from "@vercel/analytics";
import { createClient } from "@/lib/supabase/client";
import { yen, dataQualityLabel, isAutoTracked, todayInTokyo } from "@/lib/format";
import { canSubmitTransaction } from "@/lib/formValidation";
import { buildTransactionsCsv } from "@/lib/transactionsCsv";
import { computePortfolioValuation, cardHoldingValue } from "@/lib/portfolioValuation";
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
  initialCardId,
}: {
  transactions: Transaction[];
  cards: CardOption[];
  pnl: PnlSummary;
  // Pre-selects the picker when arriving via a card detail page's "＋
  // 取引を記録" link (?card=ID — added 2026-09-13, see
  // cards/[id]/page.tsx). Server-validated by portfolio/page.tsx.
  initialCardId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  // Starts unselected (not cards[0]) — defaulting to an arbitrary real card
  // let a user who never touched the CardPicker submit a transaction for a
  // card they never chose, since the closed picker showed that card's name
  // indistinguishably from a deliberate selection (found in UX review,
  // 2026-09-12). initialCardId is the one deliberate exception — a real,
  // server-validated choice the user already made via a specific card's
  // quick-add link, not an arbitrary default.
  const [cardId, setCardId] = useState(initialCardId ?? "");
  const [type, setType] = useState<TransactionType>("buy");
  const [quantity, setQuantity] = useState(1);
  const [pricePerUnit, setPricePerUnit] = useState<number | "">("");
  const [fee, setFee] = useState<number | "">("");
  const [date, setDate] = useState(todayInTokyo);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cardById = new Map(cards.map((c) => [c.id, c]));

  // Codex independent review (2026-09-13): current_price is nullable (a
  // card can exist before its first price scrape), and the old `?? 0` here
  // showed a confident 保有評価額¥0 and a 100%-of-cost 含み損益 for such a
  // holding — indistinguishable from an actually-confirmed total loss.
  // computePortfolioValuation() excludes such holdings instead and reports
  // how many via unpricedHoldingsCount so the UI can show an honest caveat.
  const priceById = new Map(cards.map((c) => [c.id, c.current_price]));
  const valuation = computePortfolioValuation(pnl.holdings, priceById);
  const currentValue = valuation.currentValue;
  const unrealizedPnl = valuation.unrealizedPnl;
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
    if (!canSubmitTransaction({ cardId, isKnownCard: true, pricePerUnit, quantity, fee })) return;
    setBusy(true);
    setErrorMsg(null);
    // try/finally around the whole body (self-review, 2026-09-12) — without
    // it, an exception thrown rather than resolved as {error} (e.g. a
    // genuine network failure mid-request, not just a Postgres rejection)
    // would skip every setBusy(false) below and leave "記録する" disabled
    // until the user reloads the page, with no error message explaining
    // why.
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErrorMsg("ログイン状態を確認できませんでした。再度ログインしてください。");
        return;
      }
      const basePayload = {
        user_id: user.id,
        card_id: cardId,
        type,
        quantity,
        price_per_unit: pricePerUnit,
        transaction_date: date,
      };
      // "" (not entered) becomes 0 here, matching the DB column's own
      // `not null default 0` — an omitted fee IS a fee of 0, not unknown.
      const feeValue = fee === "" ? 0 : fee;
      let { error } = await supabase.from("transactions").insert({ ...basePayload, fee: feeValue });
      // Self-review, 2026-09-13: `fee` is a NEW column (schema.sql +
      // migration/retrofit_add_transaction_fee.sql, not yet applied to
      // production). If this code is ever deployed before that migration
      // runs, every insert above would fail outright with PostgREST's
      // "could not find the 'fee' column" error (PGRST204) — silently
      // breaking the core "record a transaction" feature for every user,
      // not degrading gracefully the way this project's other schema-ahead-
      // of-deploy features do (e.g. yuyutei_sync_runs logging failure is
      // caught and reported without blocking the actual price refresh).
      // Falling back to an insert without `fee` on that specific error
      // means a deploy-before-migration ordering mistake loses only the
      // fee value (recoverable — the user can re-enter it once the column
      // exists) rather than the whole transaction record.
      if (error?.code === "PGRST204") {
        ({ error } = await supabase.from("transactions").insert(basePayload));
        if (!error && feeValue !== 0) {
          setErrorMsg(
            "取引は記録されましたが、手数料の保存にはまだ対応していません（準備中）。手数料以外は正しく反映されています。"
          );
        }
      }
      if (error) {
        setErrorMsg(`記録に失敗しました：${error.message}`);
        return;
      }
      setPricePerUnit("");
      setFee("");
      // "無料でまず試す" 方針への転換（2026-09-13）に伴い追加 — このアプリ
      // が実際に使われているかを検証する行動シグナル。カードIDや金額は
      // プロパティに含めない（何件記録されたかだけを数える）。
      track("transaction_added", { type });
      router.refresh();
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function removeTransaction(id: string) {
    if (!window.confirm("この取引記録を削除しますか？この操作は取り消せません。")) return;
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("transactions").delete().eq("id", id);
      if (error) {
        setErrorMsg(`削除に失敗しました：${error.message}`);
        return;
      }
      router.refresh();
    } catch {
      // Without this, an exception (e.g. a genuine network failure) here
      // left the user with no feedback at all — no error shown, and no way
      // to tell whether the delete silently succeeded or failed (self-
      // review, 2026-09-12).
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
    }
  }

  // Client-side only — the data is already loaded (this component's own
  // `transactions` prop), so this needs no additional request. Added
  // 2026-09-13: a paid P&L tool should let a user get their own records
  // out for tax/record-keeping, not just view them in-browser.
  function downloadCsv() {
    const rows = transactions.map((t) => ({
      transaction_date: t.transaction_date,
      type: t.type,
      card_id: t.card_id,
      card_name: cardById.get(t.card_id)?.name ?? t.card_id,
      quantity: Number(t.quantity),
      price_per_unit: Number(t.price_per_unit),
      fee: Number(t.fee ?? 0),
    }));
    const csv = buildTransactionsCsv(rows);
    // A UTF-8 BOM prefix (self-review, 2026-09-13) — without it, Excel (the
    // most likely tool this CSV is opened in, given this project's
    // Japanese/Windows-desktop audience) misdetects the encoding and shows
    // mojibake for every Japanese character, defeating the entire point of
    // an export meant for record-keeping.
    const BOM = String.fromCharCode(0xfeff); // spelled out explicitly rather than as a literal invisible character in source
    const blob = new Blob([BOM + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `取引履歴_${todayInTokyo()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatBox label="保有評価額" value={yen(currentValue)} />
        <StatBox label="含み損益" value={yen(unrealizedPnl)} tone={unrealizedPnl} />
        <StatBox label="実現損益（確定済み）" value={yen(pnl.realizedPnl)} tone={pnl.realizedPnl} />
        <StatBox label="合計損益" value={yen(totalPnl)} tone={totalPnl} emphasize />
      </div>

      {valuation.unpricedHoldingsCount > 0 && (
        <p className="mb-4 text-xs text-ink-faint">
          ⚠️ 保有カードのうち{valuation.unpricedHoldingsCount}件は現在価格が未取得のため、上記の保有評価額・含み損益・合計損益の集計に含まれていません（実現損益は影響を受けません）。
        </p>
      )}

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
          <label htmlFor="txn-fee" className="mb-1 block text-xs text-ink-muted">
            手数料（円・任意）
          </label>
          <input
            id="txn-fee"
            type="number"
            min={0}
            placeholder="0"
            value={fee}
            onChange={(e) => setFee(e.target.value === "" ? "" : Number(e.target.value))}
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
            !canSubmitTransaction({ cardId, isKnownCard: cardById.has(cardId), pricePerUnit, quantity, fee })
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
          const value = cardHoldingValue(card?.current_price, h.quantity);
          const gain = value === null ? null : value - h.costBasis;
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
                  {h.quantity}枚 ・ 平均取得単価 {yen(h.avgCost)} ・ 評価額{" "}
                  {value === null ? "算出不可(現在価格未取得)" : yen(value)}
                  {stale && "（価格は登録時点のまま自動更新されていません）"}
                </div>
              </div>
              <span className={gain === null ? "text-ink-faint" : gain >= 0 ? "text-good" : "text-warn"}>
                {gain === null ? "算出不可" : yen(gain)}
              </span>
            </div>
          );
        })}
      </div>

      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-ink-muted">取引履歴</h2>
        {transactions.length > 0 && (
          <button
            type="button"
            onClick={downloadCsv}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-bg-elevated"
          >
            CSVで保存
          </button>
        )}
      </div>
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
                {Number(t.fee) > 0 && (
                  <span className="text-xs text-ink-faint"> （手数料 {yen(t.fee)}）</span>
                )}
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
