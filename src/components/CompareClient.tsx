"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { yen, pct, judgmentClasses } from "@/lib/format";
import type { PriceSnapshot, Judgment } from "@/lib/types";

interface CardOption {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  current_price: number | null;
  pct_vs_avg30: number | null;
  judgment: Judgment | null;
}

const LINE_COLORS = ["#a9741f", "#2e6da4", "#1f6e52", "#a2431f", "#7b4fa0"];
const MAX_SELECTED = 5;

export default function CompareClient({ cards }: { cards: CardOption[] }) {
  const supabase = createClient();
  const [selected, setSelected] = useState<string[]>([]);
  const [snapshotsByCard, setSnapshotsByCard] = useState<Record<string, PriceSnapshot[]>>({});
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadMissing() {
      const toLoad = selected.filter((id) => !snapshotsByCard[id]);
      if (toLoad.length === 0) return;
      const { data } = await supabase
        .from("price_snapshots")
        .select("*")
        .in("card_id", toLoad)
        .order("snapshot_date", { ascending: true });
      if (cancelled || !data) return;
      setSnapshotsByCard((prev) => {
        const next = { ...prev };
        for (const id of toLoad) next[id] = [];
        for (const row of data as PriceSnapshot[]) {
          next[row.card_id] = [...(next[row.card_id] ?? []), row];
        }
        return next;
      });
    }
    loadMissing();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= MAX_SELECTED) return prev;
      return [...prev, id];
    });
  }

  const cardById = new Map(cards.map((c) => [c.id, c]));
  const filtered = query
    ? cards.filter((c) => c.name.includes(query) || (c.set_name ?? "").includes(query))
    : cards;

  const allDates = Array.from(
    new Set(
      selected.flatMap((id) => (snapshotsByCard[id] ?? []).map((s) => s.snapshot_date))
    )
  ).sort();

  const w = 700;
  const h = 220;
  const padX = 8;
  const allPrices = selected.flatMap((id) => (snapshotsByCard[id] ?? []).map((s) => s.price));
  const max = Math.max(1, ...allPrices);
  const min = Math.min(0, ...allPrices);
  const range = max - min || 1;

  return (
    <div>
      <input
        type="text"
        placeholder="カード名・弾名で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-3 w-full rounded-md border border-border bg-bg-elevated px-3 py-2"
      />

      <div className="mb-4 max-h-56 overflow-y-auto rounded-lg border border-border">
        {filtered.slice(0, 100).map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-2 border-b border-border px-3 py-1.5 text-sm last:border-b-0 hover:bg-bg-elevated"
          >
            <input
              type="checkbox"
              checked={selected.includes(c.id)}
              onChange={() => toggle(c.id)}
              disabled={!selected.includes(c.id) && selected.length >= MAX_SELECTED}
            />
            <span className="flex-1">
              {c.name}（{c.rarity}・{c.set_name}）
            </span>
            <span className="font-mono text-ink-muted">{yen(c.current_price)}</span>
          </label>
        ))}
      </div>

      {selected.length > 0 && (
        <>
          <svg viewBox={`0 0 ${w} ${h}`} className="mb-4 w-full rounded-lg border border-border bg-bg-elevated">
            {selected.map((id, idx) => {
              const snaps = snapshotsByCard[id] ?? [];
              if (snaps.length === 0) return null;
              const points = snaps.map((s) => {
                const dateIdx = allDates.indexOf(s.snapshot_date);
                const x = padX + (dateIdx / Math.max(allDates.length - 1, 1)) * (w - padX * 2);
                const y = h - 12 - ((s.price - min) / range) * (h - 24);
                return `${x.toFixed(1)},${y.toFixed(1)}`;
              });
              return (
                <polyline
                  key={id}
                  points={points.join(" ")}
                  fill="none"
                  stroke={LINE_COLORS[idx % LINE_COLORS.length]}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              );
            })}
          </svg>

          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="bg-bg-sunken text-left text-ink-muted">
                <tr>
                  <th className="px-3 py-2">カード</th>
                  <th className="px-3 py-2 text-right">現在価格</th>
                  <th className="px-3 py-2 text-right">30日平均比</th>
                  <th className="px-3 py-2">判定</th>
                </tr>
              </thead>
              <tbody>
                {selected.map((id, idx) => {
                  const c = cardById.get(id);
                  if (!c) return null;
                  return (
                    <tr key={id} className="border-t border-border">
                      <td className="px-3 py-2">
                        <span
                          className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle"
                          style={{ background: LINE_COLORS[idx % LINE_COLORS.length] }}
                        />
                        {c.name}
                      </td>
                      <td className="px-3 py-2 text-right font-mono">{yen(c.current_price)}</td>
                      <td className="px-3 py-2 text-right font-mono">{pct(c.pct_vs_avg30)}</td>
                      <td className="px-3 py-2">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${judgmentClasses(c.judgment)}`}>
                          {c.judgment ?? "—"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
