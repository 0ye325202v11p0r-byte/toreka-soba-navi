import Link from "next/link";
import type { MarketListCard } from "@/lib/types";
import { pct } from "@/lib/format";

export default function MoverStrip({ cards }: { cards: MarketListCard[] }) {
  const withPct = cards.filter((c) => c.pct_vs_avg30 !== null && c.data_quality !== "flat");

  const gainers = [...withPct]
    .sort((a, b) => (b.pct_vs_avg30 ?? 0) - (a.pct_vs_avg30 ?? 0))
    .slice(0, 5);
  const losers = [...withPct]
    .sort((a, b) => (a.pct_vs_avg30 ?? 0) - (b.pct_vs_avg30 ?? 0))
    .slice(0, 5);

  if (gainers.length === 0) return null;

  return (
    <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
      <MoverList title="📈 急騰（30日平均比）" items={gainers} tone="good" />
      <MoverList title="📉 急落（30日平均比）" items={losers} tone="warn" />
    </div>
  );
}

function MoverList({
  title,
  items,
  tone,
}: {
  title: string;
  items: MarketListCard[];
  tone: "good" | "warn";
}) {
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{title}</div>
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
    </div>
  );
}
