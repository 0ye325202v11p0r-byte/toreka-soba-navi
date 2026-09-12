import type { PriceSnapshot } from "@/lib/types";
import { yen } from "@/lib/format";

export default function PriceChart({
  snapshots,
  avgCost,
}: {
  snapshots: PriceSnapshot[];
  // Optional — the viewer's own average acquisition cost for this card
  // (added 2026-09-13, pairs with cards/[id]/page.tsx's "あなたの状況"
  // panel). Drawn as a reference line so "is the current price above or
  // below what I paid" is visible at a glance, not just as a separate
  // number elsewhere on the page.
  avgCost?: number;
}) {
  const prices = snapshots.map((s) => s.price);
  // avgCost is folded into the min/max range (not just the price history)
  // so the reference line is never drawn off-canvas or clipped — a card
  // bought when its price was well outside its later tracked range (e.g.
  // acquired before this project started tracking it daily) would
  // otherwise place the line above/below the visible chart entirely.
  const rangeValues = avgCost !== undefined ? [...prices, avgCost] : prices;
  const max = Math.max(...rangeValues);
  const min = Math.min(...rangeValues);
  const range = max - min || 1;
  const w = 700;
  const h = 160;
  const padX = 8;

  const points = snapshots.map((s, i) => {
    const x = padX + (i / Math.max(snapshots.length - 1, 1)) * (w - padX * 2);
    const y = h - 12 - ((s.price - min) / range) * (h - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });
  const avgCostY = avgCost !== undefined ? h - 12 - ((avgCost - min) / range) * (h - 24) : null;

  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-ink-muted">
        <span>
          最高：<b className="text-ink">{yen(max)}</b>
        </span>
        <span>
          最安：<b className="text-ink">{yen(min)}</b>
        </span>
        {avgCost !== undefined && (
          <span>
            あなたの取得単価：<b className="text-accent-strong">{yen(avgCost)}</b>
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-lg border border-border bg-bg-elevated">
        {avgCostY !== null && (
          <line
            x1={0}
            y1={avgCostY}
            x2={w}
            y2={avgCostY}
            stroke="var(--accent-strong)"
            strokeWidth={1}
            strokeDasharray="4 3"
          />
        )}
        <polyline
          points={points.join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
