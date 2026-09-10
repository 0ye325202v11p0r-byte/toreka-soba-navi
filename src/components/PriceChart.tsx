import type { PriceSnapshot } from "@/lib/types";
import { yen } from "@/lib/format";

export default function PriceChart({ snapshots }: { snapshots: PriceSnapshot[] }) {
  const prices = snapshots.map((s) => s.price);
  const max = Math.max(...prices);
  const min = Math.min(...prices);
  const range = max - min || 1;
  const w = 700;
  const h = 160;
  const padX = 8;

  const points = snapshots.map((s, i) => {
    const x = padX + (i / Math.max(snapshots.length - 1, 1)) * (w - padX * 2);
    const y = h - 12 - ((s.price - min) / range) * (h - 24);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  return (
    <div>
      <div className="mb-2 flex justify-between text-xs text-ink-muted">
        <span>
          最高：<b className="text-ink">{yen(max)}</b>
        </span>
        <span>
          最安：<b className="text-ink">{yen(min)}</b>
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="w-full rounded-lg border border-border bg-bg-elevated">
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
