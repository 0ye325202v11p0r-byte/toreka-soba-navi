import { yen } from "@/lib/format";
import type { PortfolioValuePoint } from "@/lib/portfolioHistory";

// Same simple SVG polyline approach as PriceChart.tsx — no chart library
// dependency, index-based x positioning (each evaluation date gets an
// equal-width slot regardless of the actual day gap between them, exactly
// like PriceChart already does for price snapshots). Points are evaluated
// only at transaction dates, not every calendar day — see
// portfolioHistory.ts for why that's a deliberate choice, not a
// simplification to fix later.
export default function PortfolioValueChart({ points }: { points: PortfolioValuePoint[] }) {
  const values = points.map((p) => p.value);
  const max = Math.max(1, ...values);
  const min = Math.min(0, ...values);
  const range = max - min || 1;
  const w = 700;
  const h = 160;
  const padX = 8;

  const svgPoints = points.map((p, i) => {
    const x = padX + (i / Math.max(points.length - 1, 1)) * (w - padX * 2);
    const y = h - 12 - ((p.value - min) / range) * (h - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const latest = points[points.length - 1];

  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-ink-muted">
        <span>
          最高：<b className="text-ink">{yen(max)}</b>
        </span>
        {latest && (
          <span>
            直近（{latest.date}）：<b className="text-ink">{yen(latest.value)}</b>
          </span>
        )}
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-lg border border-border bg-bg-elevated">
        <polyline
          points={svgPoints.join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </svg>
      <p className="mt-1 text-[11px] text-ink-faint">
        取引のあった日ごとの評価額です（未追跡・価格データが無いカードはその時点の合計から除外されます）。
      </p>
    </div>
  );
}
