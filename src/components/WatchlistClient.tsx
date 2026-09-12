"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { pct, yen, dataQualityLabel, isAutoTracked, formatDateTime } from "@/lib/format";
import { canSubmitWatchItem } from "@/lib/formValidation";
import { conditionMet } from "@/lib/watchlistRule";
import type { WatchlistItem, WatchlistAlertRule, DataQuality } from "@/lib/types";
import CardPicker from "./CardPicker";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  pct_vs_avg30: number | null;
  current_price: number | null;
  data_quality: DataQuality | null;
  source_url: string | null;
}

function ruleLabel(rule: WatchlistAlertRule): string {
  const opLabel = rule.op === "lte" ? "以下" : "以上";
  return rule.type === "pct_vs_avg30"
    ? `30日平均比 ${opLabel} ${rule.value}%`
    : `価格 ${opLabel} ${yen(rule.value)}`;
}

function ruleIsMet(rule: WatchlistAlertRule, card: CardOption | undefined): boolean {
  return conditionMet(
    rule,
    card && { pctVsAvg30: card.pct_vs_avg30, currentPrice: card.current_price }
  );
}

export default function WatchlistClient({
  initialItems,
  cards,
  initialCardId,
}: {
  initialItems: WatchlistItem[];
  cards: CardOption[];
  // Pre-selects the picker when arriving via a card detail page's "＋
  // ウォッチリストに追加" link (?card=ID — added 2026-09-13, see
  // cards/[id]/page.tsx). Without this, that link's only actual effect was
  // navigating here and leaving the user to re-search for the exact same
  // card they just came from — the entire point of a quick-add link.
  // Server-validated by watchlist/page.tsx (only passed through if it
  // matches a real card in `cards`), so this is never an id the picker
  // itself wouldn't also recognize as valid.
  initialCardId?: string;
}) {
  const router = useRouter();
  const supabase = createClient();
  // Starts unselected (not cards[0]) — see PortfolioClient.tsx's cardId
  // for the same fix and rationale (UX review, 2026-09-12). initialCardId
  // is the one deliberate exception: a real, server-validated choice the
  // user already made by clicking a specific card's quick-add link, not an
  // arbitrary default.
  const [cardId, setCardId] = useState(initialCardId ?? "");
  const [ruleType, setRuleType] = useState<WatchlistAlertRule["type"]>("pct_vs_avg30");
  const [op, setOp] = useState<"lte" | "gte">("lte");
  const [value, setValue] = useState(-15);
  const [busy, setBusy] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const selectedCard = cardById.get(cardId);
  // pct_vs_avg30-based conditions need tracked history, which only
  // isAutoTracked() cards (real + non-null source_url) have — not just
  // "not partial" (a 'flat' card has no tracked history either; see
  // isAutoTracked() for why data_quality alone isn't the right check,
  // UX review 2026-09-12). Price-based conditions work for any card since
  // current_price is always populated, so the warning only applies to the
  // pct_vs_avg30 rule type.
  const selectedIsUntracked =
    ruleType === "pct_vs_avg30" && !!selectedCard && !isAutoTracked(selectedCard);

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    // Re-checks the same rule the submit button's disabled= already
    // enforces — belt and suspenders against implicit form submission
    // bypassing a disabled button.
    if (!cardId) {
      setErrorMsg("カードを選択してください。");
      return;
    }
    if (!cardById.has(cardId)) {
      setErrorMsg("選択したカードが見つかりません。カードを選択し直してください。");
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    // try/finally around the whole body (self-review, 2026-09-12) — without
    // it, an exception thrown rather than resolved as {error} (e.g. a
    // genuine network failure mid-request) would skip setBusy(false) and
    // leave "追加" disabled until the user reloads the page, with no error
    // message explaining why.
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setErrorMsg("ログイン状態を確認できませんでした。再度ログインしてください。");
        return;
      }
      const { error } = await supabase.from("watchlist_items").insert({
        user_id: user.id,
        card_id: cardId,
        alert_rule: { type: ruleType, op, value } as WatchlistAlertRule,
      });
      if (error) {
        setErrorMsg(`登録に失敗しました：${error.message}`);
        return;
      }
      router.refresh();
    } catch {
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
    } finally {
      setBusy(false);
    }
  }

  async function removeItem(id: string) {
    if (!window.confirm("このウォッチリスト条件を削除しますか？")) return;
    setErrorMsg(null);
    try {
      const { error } = await supabase.from("watchlist_items").delete().eq("id", id);
      if (error) {
        setErrorMsg(`削除に失敗しました：${error.message}`);
        return;
      }
      router.refresh();
    } catch {
      // Without this, an exception (e.g. a genuine network failure) here
      // left the user with no feedback at all (self-review, 2026-09-12).
      setErrorMsg("通信エラーが発生しました。もう一度お試しください。");
    }
  }

  return (
    <div>
      {errorMsg && (
        <div className="mb-4 rounded-lg bg-warn-soft p-3 text-sm text-warn">{errorMsg}</div>
      )}

      <form onSubmit={addItem} className="mb-6 rounded-lg border border-border bg-bg-elevated p-4">
        <div className="flex flex-wrap items-end gap-2">
          <CardPicker cards={cards} value={cardId} onChange={setCardId} label="カード" />
          <div>
            <label htmlFor="watch-type" className="mb-1 block text-xs text-ink-muted">
              基準
            </label>
            <select
              id="watch-type"
              value={ruleType}
              onChange={(e) => {
                const next = e.target.value as WatchlistAlertRule["type"];
                setRuleType(next);
                // -15(%) is a sane default for pct_vs_avg30 but not for a yen
                // amount — reset to the selected card's current price so
                // switching to "価格" doesn't leave a nonsense value behind.
                setValue(next === "price" ? selectedCard?.current_price ?? 0 : -15);
              }}
              className="rounded-md border border-border bg-bg px-2 py-1.5"
            >
              <option value="pct_vs_avg30">30日平均比</option>
              <option value="price">価格</option>
            </select>
          </div>
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
              <option value="lte">以下</option>
              <option value="gte">以上</option>
            </select>
          </div>
          <div>
            <label htmlFor="watch-value" className="mb-1 block text-xs text-ink-muted">
              {ruleType === "price" ? "価格（円）" : "%値"}
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
            disabled={busy || !canSubmitWatchItem({ cardId, isKnownCard: cardById.has(cardId) })}
            className="rounded-md bg-accent px-4 py-1.5 font-semibold text-bg-elevated hover:bg-accent-strong disabled:opacity-50"
          >
            追加
          </button>
        </div>
        {!cardId && (
          <p className="mt-2 text-xs text-ink-faint">まずカードを選択してください。</p>
        )}
        {selectedIsUntracked && (
          <p className="mt-2 rounded-md bg-warn-soft px-3 py-2 text-xs text-warn">
            ⚠️ {dataQualityLabel(selectedCard?.data_quality ?? null).label}
            のカードです。自動更新の対象外のため、この条件は現時点では成立しません（判定に使う30日平均比が算出できないため）。
          </p>
        )}
      </form>

      <div className="space-y-2">
        {initialItems.length === 0 && (
          <p className="text-sm text-ink-faint">まだ何も登録されていません。</p>
        )}
        {initialItems.map((item) => {
          const card = cardById.get(item.card_id);
          const isCurrentlyMet = ruleIsMet(item.alert_rule, card);
          // pct_vs_avg30 rules can't ever fire for a card the cron doesn't
          // auto-track (no tracked history) — see isAutoTracked(); price
          // rules work for any card.
          const cannotFire =
            item.alert_rule.type === "pct_vs_avg30" && !!card && !isAutoTracked(card);
          return (
            <div
              key={item.id}
              className="flex items-center justify-between rounded-lg border border-border bg-bg-elevated p-3"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{card?.name ?? item.card_id}</span>
                  {isCurrentlyMet && (
                    <span className="rounded-full bg-good-soft px-2 py-0.5 text-xs font-semibold text-good">
                      ✅ 条件成立中
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-muted">
                  条件：{ruleLabel(item.alert_rule)}
                  （現在
                  {item.alert_rule.type === "pct_vs_avg30"
                    ? ` ${pct(card?.pct_vs_avg30)}`
                    : ` ${yen(card?.current_price)}`}
                  ）
                </div>
                {item.last_triggered_at && (
                  <div className="mt-0.5 text-xs text-ink-faint">
                    最終確認で成立：{formatDateTime(item.last_triggered_at)}
                  </div>
                )}
                {cannotFire && (
                  <div className="mt-1 text-xs text-warn">
                    ⚠️ 自動更新対象外のカードのため、この条件は現時点では成立しません
                  </div>
                )}
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
