import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import SetupNotice from "@/components/SetupNotice";
import { buildDashboardSummary } from "@/lib/dashboardSummary";
import { yen, pct, dataQualityLabel, formatDateTime } from "@/lib/format";
import type { Transaction, WatchlistItem, DashboardCardInfo } from "@/lib/types";

export const metadata: Metadata = {
  title: "ダッシュボード",
  description: "保有カード・ウォッチリストの変化を一目で確認できます。",
};

export default async function DashboardPage() {
  if (!isSupabaseConfigured()) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold">ダッシュボード</h1>
        <SetupNotice />
      </div>
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/dashboard");
  const userId = user.id; // narrowed once outside the closure below, same reason as PortfolioClient.tsx

  // Same 1000-row PostgREST pagination this project applies everywhere it
  // reads a user's full transaction history (see portfolio/page.tsx) — a
  // dashboard showing a confidently-wrong 含み損益/実現損益 from a silently
  // truncated transaction list would be worse than showing nothing.
  async function fetchAllTransactions() {
    let all: Transaction[] = [];
    const pageSize = 1000;
    let from = 0;
    while (true) {
      const { data, error } = await supabase
        .from("transactions")
        .select("*")
        .eq("user_id", userId)
        .order("transaction_date", { ascending: false })
        .order("id", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      all = all.concat((data ?? []) as Transaction[]);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
    return all;
  }

  const [transactions, { data: watchlistData, error: watchlistErr }] = await Promise.all([
    fetchAllTransactions(),
    supabase
      .from("watchlist_items")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);
  if (watchlistErr) throw watchlistErr;
  const watchlistItems = (watchlistData ?? []) as WatchlistItem[];

  // computePnl() needs the transactions read above to know which card ids
  // are actually relevant — so the cards query has to come after, and is
  // scoped to exactly this user's own holdings + watchlist (never the full
  // ~3,270-card catalog the public market list/compare pages page through).
  const relevantCardIds = Array.from(
    new Set([
      ...transactions.map((t) => t.card_id),
      ...watchlistItems.map((i) => i.card_id),
    ])
  );

  let cards: DashboardCardInfo[] = [];
  if (relevantCardIds.length > 0) {
    const { data, error } = await supabase
      .from("cards")
      .select("id, name, current_price, pct_vs_avg30, data_quality, source_url, updated_at")
      .in("id", relevantCardIds);
    if (error) throw error;
    cards = (data ?? []) as DashboardCardInfo[];
  }

  // "あなたのポートフォリオ vs 市場平均" (added 2026-09-13) needs a
  // catalog-wide sample distinct from `cards` above (which is deliberately
  // scoped to only this user's relevant cards) — a single column across
  // every auto-tracked card, not the full ~3,270-row catalog with all
  // columns the public market list pages through. A read failure here must
  // not break the rest of the dashboard (this is a nice-to-have comparison,
  // not core P&L data) — fails open to an empty sample, which
  // computeMarketBenchmark() already treats as "nothing to compare" (null),
  // not a fabricated 0%.
  // Not paginated past PostgREST's 1000-row default cap, unlike this
  // project's other catalog-wide reads — deliberately, for now: 'real'
  // data_quality cards number 844 as of 2026-09-13, comfortably under the
  // cap, and a silently-truncated SAMPLE for a benchmark AVERAGE degrades
  // to "averaged over most of the catalog instead of all of it" (still a
  // real, representative number), not the "confidently wrong, presented as
  // complete" failure mode the 1000-row bug class usually causes elsewhere
  // in this codebase. Revisit if the real-tracked count approaches 1000.
  let catalogPctValues: number[] = [];
  {
    const { data } = await supabase
      .from("cards")
      .select("pct_vs_avg30")
      .eq("data_quality", "real")
      .not("pct_vs_avg30", "is", null);
    catalogPctValues = (data ?? []).map((c) => Number(c.pct_vs_avg30));
  }

  const summary = buildDashboardSummary(transactions, watchlistItems, cards, new Date(), catalogPctValues);

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">ダッシュボード</h1>
      <p className="mb-6 text-sm text-ink-muted">
        保有カード・ウォッチリストの変化をここでまとめて確認できます。
      </p>

      {summary.hasNothing ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-faint">
          まだ保有カードもウォッチ登録もありません。
          <div className="mt-3 flex justify-center gap-3">
            <Link
              href="/portfolio"
              className="rounded-md bg-accent px-3 py-1.5 text-sm font-semibold text-bg-elevated hover:bg-accent-strong"
            >
              ポートフォリオを始める
            </Link>
            <Link
              href="/watchlist"
              className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-bg-elevated"
            >
              ウォッチリストに登録する
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Shown whenever there's ANY P&L history to report — not just
              current holdings. A user who bought and later fully sold
              everything has holdingsCount===0 but a real realizedPnl;
              gating this purely on holdingsCount would hide their entire
              trading result the moment they held nothing, right after
              hasNothing's own fix for the identical blind spot (self-
              review, 2026-09-13). 保有評価額/含み損益 correctly read as
              ¥0 in that case — an honest "nothing held right now," not a
              missing number. */}
          {(summary.holdingsCount > 0 || summary.realizedPnl !== 0) && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatBox label="保有評価額" value={yen(summary.currentValue)} />
              <StatBox label="含み損益" value={yen(summary.unrealizedPnl)} tone={summary.unrealizedPnl} />
              <StatBox label="実現損益（確定済み）" value={yen(summary.realizedPnl)} tone={summary.realizedPnl} />
              <StatBox label="合計損益" value={yen(summary.totalPnl)} tone={summary.totalPnl} emphasize />
            </div>
          )}

          {summary.unpricedHoldingsCount > 0 && (
            <p className="mb-6 text-xs text-ink-faint">
              ⚠️ 保有カードのうち{summary.unpricedHoldingsCount}件は現在価格が未取得のため、上記の保有評価額・含み損益・合計損益の集計に含まれていません（実現損益は影響を受けません）。
            </p>
          )}

          {summary.staleCard && (
            <p className="mb-6 text-xs text-warn">
              ⚠️ {summary.staleCard.name}の価格が{formatDateTime(summary.staleCard.updatedAt)}
              から更新されていません。自動更新は通常毎日行われるため、価格が古い可能性があります。
            </p>
          )}

          {summary.benchmark.portfolioAvgPct !== null && summary.benchmark.marketAvgPct !== null && (
            <div className="mb-6 rounded-lg border border-border bg-bg-elevated p-4">
              <h2 className="mb-2 text-sm font-bold text-ink-muted">📊 あなたの成績 vs 市場平均</h2>
              <div className="grid grid-cols-2 gap-3">
                <StatBox
                  label="あなたの保有（30日平均比・評価額加重）"
                  value={pct(summary.benchmark.portfolioAvgPct)}
                  tone={summary.benchmark.portfolioAvgPct}
                />
                <StatBox label="市場平均（実測データ全体）" value={pct(summary.benchmark.marketAvgPct)} />
              </div>
              <p className="mt-2 text-xs text-ink-faint">
                {summary.benchmark.portfolioAvgPct >= summary.benchmark.marketAvgPct
                  ? "あなたの保有は市場平均を上回っています。"
                  : "あなたの保有は市場平均を下回っています。"}
                {summary.benchmark.excludedHoldingsCount > 0 &&
                  ` （${summary.benchmark.excludedHoldingsCount}件は価格未取得・自動更新対象外のため集計に含まれていません）`}
              </p>
            </div>
          )}

          {summary.triggeredItems.length > 0 && (
            <div className="mb-6 rounded-lg border border-good bg-good-soft p-4">
              <h2 className="mb-2 text-sm font-bold text-good">
                ✅ 条件成立中のウォッチ（{summary.triggeredItems.length}件）
              </h2>
              <ul className="space-y-1 text-sm">
                {summary.triggeredItems.map(({ item, card }) => (
                  <li key={item.id}>
                    <Link
                      href={`/cards/${item.card_id}`}
                      className="font-medium text-ink hover:text-accent hover:underline"
                    >
                      {card.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(summary.gainers.length > 0 || summary.losers.length > 0) && (
            <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <MoverBox title="📈 値上がり中（保有・ウォッチ中）" items={summary.gainers} tone="good" />
              <MoverBox title="📉 値下がり中（保有・ウォッチ中）" items={summary.losers} tone="warn" />
            </div>
          )}

          {summary.untrackedCount > 0 && (
            <p className="mb-6 text-xs text-ink-faint">
              ⚠️ 保有・ウォッチ中のカードのうち{summary.untrackedCount}件は
              {dataQualityLabel("partial").label}
              等（自動更新の対象外）です。価格は登録時点または最終更新時点のまま変わりません。
            </p>
          )}

          <div className="flex gap-4 text-sm">
            <Link href="/portfolio" className="text-accent hover:underline">
              ポートフォリオを見る →
            </Link>
            <Link href="/watchlist" className="text-accent hover:underline">
              ウォッチリストを見る →
            </Link>
          </div>
        </>
      )}
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

function MoverBox({
  title,
  items,
  tone,
}: {
  title: string;
  items: DashboardCardInfo[];
  tone: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{title}</div>
      {items.length === 0 ? (
        <p className="text-sm text-ink-faint">対象カードがありません。</p>
      ) : (
        <div className="space-y-1">
          {items.map((c) => (
            <Link
              key={c.id}
              href={`/cards/${c.id}`}
              className="flex items-center justify-between text-sm hover:text-accent"
            >
              <span className="truncate">{c.name}</span>
              <span className={`ml-2 shrink-0 font-mono ${tone === "good" ? "text-good" : "text-warn"}`}>
                {pct(c.pct_vs_avg30)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
