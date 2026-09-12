"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { yen, pct, judgmentClasses, dataQualityLabel } from "@/lib/format";
import type { MarketListCard } from "@/lib/types";

type SortKey = "name" | "price_desc" | "price_asc" | "pct_desc" | "pct_asc";

// Rendering all ~3,000+ cards at once (even though the underlying array is
// already in memory for instant client-side search) makes the initial page
// do a lot of unnecessary DOM/hydration work for rows almost nobody
// scrolls to. Render a page at a time instead; "もっと見る" reveals more.
const PAGE_SIZE = 150;

const SORTERS: Record<SortKey, (a: MarketListCard, b: MarketListCard) => number> = {
  name: (a, b) => a.name.localeCompare(b.name, "ja"),
  price_desc: (a, b) => (b.current_price ?? 0) - (a.current_price ?? 0),
  price_asc: (a, b) => (a.current_price ?? 0) - (b.current_price ?? 0),
  pct_desc: (a, b) => (b.pct_vs_avg30 ?? 0) - (a.pct_vs_avg30 ?? 0),
  pct_asc: (a, b) => (a.pct_vs_avg30 ?? 0) - (b.pct_vs_avg30 ?? 0),
};

type QualityFilter = "all" | "real" | "partial";

export default function MarketTable({ cards }: { cards: MarketListCard[] }) {
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [qualityFilter, setQualityFilter] = useState<QualityFilter>("all");

  const setNames = useMemo(
    () => Array.from(new Set(cards.map((c) => c.set_name).filter(Boolean))).sort((a, b) =>
      (a as string).localeCompare(b as string, "ja")
    ),
    [cards]
  );
  const [setFilter, setSetFilter] = useState("");

  const visible = useMemo(() => {
    let list = cards;
    if (query.trim()) {
      const q = query.trim();
      list = list.filter((c) => c.name.includes(q) || (c.set_name ?? "").includes(q));
    }
    if (setFilter) {
      list = list.filter((c) => c.set_name === setFilter);
    }
    if (qualityFilter === "real") {
      list = list.filter((c) => c.data_quality === "real");
    } else if (qualityFilter === "partial") {
      list = list.filter((c) => c.data_quality === "partial");
    }
    return [...list].sort(SORTERS[sortKey]);
  }, [cards, query, setFilter, sortKey, qualityFilter]);

  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  // any change that redefines "visible" should reset back to page 1 —
  // otherwise e.g. a new search could stay stuck at a huge displayCount
  // from before, or a fresh page of results could get hidden below the fold.
  // Resetting during render (the "adjusting state when props change" React
  // pattern) rather than in a useEffect avoids an extra cascading render.
  const filterKey = `${query}|${setFilter}|${sortKey}|${qualityFilter}`;
  const [prevFilterKey, setPrevFilterKey] = useState(filterKey);
  if (filterKey !== prevFilterKey) {
    setPrevFilterKey(filterKey);
    setDisplayCount(PAGE_SIZE);
  }

  const displayed = visible.slice(0, displayCount);
  const hasMore = visible.length > displayCount;

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-2">
        <input
          type="text"
          aria-label="カード名・弾名で検索"
          placeholder="カード名・弾名で検索"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 min-w-40 rounded-md border border-border bg-bg-elevated px-3 py-1.5 text-sm"
        />
        <select
          aria-label="弾で絞り込み"
          value={setFilter}
          onChange={(e) => setSetFilter(e.target.value)}
          className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm"
        >
          <option value="">すべての弾</option>
          {setNames.map((s) => (
            <option key={s} value={s as string}>
              {s}
            </option>
          ))}
        </select>
        <select
          aria-label="並び替え"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm"
        >
          <option value="name">名前順</option>
          <option value="price_desc">価格が高い順</option>
          <option value="price_asc">価格が安い順</option>
          <option value="pct_desc">30日平均比が高い順（急騰順）</option>
          <option value="pct_asc">30日平均比が低い順（急落順）</option>
        </select>
        <select
          aria-label="データ品質で絞り込み"
          value={qualityFilter}
          onChange={(e) => setQualityFilter(e.target.value as QualityFilter)}
          className="rounded-md border border-border bg-bg-elevated px-2 py-1.5 text-sm"
        >
          <option value="all">データ品質：すべて</option>
          <option value="real">実測データのみ（判定・平均あり）</option>
          <option value="partial">参考値のみ（遊々亭・1店舗）</option>
        </select>
      </div>

      <div className="mb-2 text-xs text-ink-faint">
        {visible.length}件表示
        {qualityFilter === "all" && (
          <span className="ml-1">
            （うち実測データ{visible.filter((c) => c.data_quality === "real").length}件）
          </span>
        )}
      </div>

      {/* mobile: stacked cards (a 6-column table doesn't fit a phone screen) */}
      <div className="space-y-2 sm:hidden">
        {displayed.map((c) => {
          const dq = dataQualityLabel(c.data_quality);
          return (
            <Link
              key={c.id}
              href={`/cards/${c.id}`}
              className="block rounded-lg border border-border bg-bg-elevated p-3"
            >
              <div className="mb-1 flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-ink">{c.name}</div>
                  <div className="text-xs text-ink-faint">
                    {c.rarity} ・ {c.set_name}
                  </div>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${judgmentClasses(c.judgment)}`}>
                  {c.judgment ?? "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-baseline gap-2">
                  <span className="font-mono">{yen(c.current_price)}</span>
                  <span className="font-mono text-xs text-ink-muted">{pct(c.pct_vs_avg30)}</span>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs ${dq.cls}`}>{dq.label}</span>
              </div>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-ink-faint">
            該当するカードがありません。
          </p>
        )}
      </div>

      {/* desktop / tablet: full table */}
      <div className="hidden overflow-x-auto rounded-lg border border-border sm:block">
        <table className="w-full text-sm">
          <thead className="bg-bg-sunken text-left text-ink-muted">
            <tr>
              <th className="px-3 py-2">カード</th>
              <th className="px-3 py-2">レアリティ</th>
              <th className="px-3 py-2 text-right">現在価格</th>
              <th className="px-3 py-2 text-right">30日平均比</th>
              <th className="px-3 py-2">判定</th>
              <th className="px-3 py-2">データ品質</th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((c) => {
              const dq = dataQualityLabel(c.data_quality);
              return (
                <tr key={c.id} className="border-t border-border hover:bg-bg-elevated">
                  <td className="px-3 py-2">
                    <Link href={`/cards/${c.id}`} className="font-medium text-ink hover:text-accent">
                      {c.name}
                    </Link>
                    <div className="text-xs text-ink-faint">{c.set_name}</div>
                  </td>
                  <td className="px-3 py-2 text-ink-muted">{c.rarity}</td>
                  <td className="px-3 py-2 text-right font-mono">{yen(c.current_price)}</td>
                  <td className="px-3 py-2 text-right font-mono">{pct(c.pct_vs_avg30)}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${judgmentClasses(c.judgment)}`}>
                      {c.judgment ?? "—"}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${dq.cls}`}>{dq.label}</span>
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-ink-faint">
                  該当するカードがありません。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {hasMore && (
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => setDisplayCount((n) => n + PAGE_SIZE)}
            className="rounded-md border border-border bg-bg-elevated px-4 py-2 text-sm font-semibold hover:bg-bg-sunken"
          >
            もっと見る（残り{(visible.length - displayCount).toLocaleString("ja-JP")}件）
          </button>
        </div>
      )}
    </div>
  );
}
