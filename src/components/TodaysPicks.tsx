import Link from "next/link";
import type { MarketListCard } from "@/lib/types";
import { yen, pct } from "@/lib/format";

export default function TodaysPicks({ cards }: { cards: MarketListCard[] }) {
  const picks = cards
    .filter((c) => c.data_quality === "real" && c.judgment === "割安" && c.pct_vs_avg30 !== null)
    .sort((a, b) => (a.pct_vs_avg30 ?? 0) - (b.pct_vs_avg30 ?? 0))
    .slice(0, 6);

  if (picks.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-ink-muted">🎯 今日の狙い目（実測データ・30日平均比 割安）</h2>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {picks.map((c) => (
          <Link
            key={c.id}
            href={`/cards/${c.id}`}
            className="rounded-lg border border-border bg-bg-elevated p-3 hover:border-accent"
          >
            <div className="font-medium">{c.name}</div>
            <div className="text-xs text-ink-faint">
              {c.rarity} ・ {c.set_name}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono">{yen(c.current_price)}</span>
              <span className="font-mono text-good">{pct(c.pct_vs_avg30)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
