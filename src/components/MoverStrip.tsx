import Link from "next/link";
import type { MarketListCard } from "@/lib/types";
import { pct } from "@/lib/format";
import { findTopMovers } from "@/lib/movers";

export default function MoverStrip({ cards }: { cards: MarketListCard[] }) {
  // data_quality 'flat' cards are never auto-updated, so their pct_vs_avg30
  // (if present at all) can't reflect a genuine recent move — excluded
  // before findTopMovers() ever sees them, same as before this refactor.
  const trackable = cards.filter((c) => c.data_quality !== "flat");
  // Self-review, 2026-09-13 — found while building the weekly-movers page:
  // this used to sort "top 5 by pct_vs_avg30" with no sign filter, the same
  // bug already fixed in dashboardSummary.ts earlier that day. At the full
  // ~3,270-card catalog scale there are almost always 5+ genuinely positive
  // movers site-wide, so this was very unlikely to ever visibly misfire
  // here — but the logic was identically wrong, so it's fixed via the same
  // shared, tested findTopMovers() now used by both this and the new
  // weekly-movers page.
  const { gainers, losers } = findTopMovers(trackable, 5);

  if (gainers.length === 0 && losers.length === 0) return null;

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
