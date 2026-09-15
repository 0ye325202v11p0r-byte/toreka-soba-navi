import Link from "next/link";
import type { MarketListCard } from "@/lib/types";
import { yen, pct } from "@/lib/format";

export default function TodaysPicks({ cards }: { cards: MarketListCard[] }) {
  // Not "data_quality === 'real'" specifically — once
  // /api/cron/refresh-yuyutei-prices exists (2026-09-12), 'partial' cards
  // also accumulate real computed judgment/pct_vs_avg30 (see isAutoTracked()
  // in src/lib/format.ts). pct_vs_avg30 !== null is only ever true for a
  // card that has actually been through stats computation, so this needs
  // no change to know a card is "genuinely tracked" — it's already the
  // right signal. 'flat' is excluded the same defensive way MoverStrip.tsx
  // already does: a legacy row could in principle carry a stray
  // pct_vs_avg30 from the original Artifact-era migration despite never
  // having real tracked history.
  const picks = cards
    .filter((c) => c.data_quality !== "flat" && c.judgment === "割安" && c.pct_vs_avg30 !== null)
    .sort((a, b) => (a.pct_vs_avg30 ?? 0) - (b.pct_vs_avg30 ?? 0))
    .slice(0, 6);

  if (picks.length === 0) return null;

  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-ink-muted">🎯 今日の狙い目（実測データ・30日平均比 割安）</h2>
      {/* Spotlight treatment (2026-09-14, user design feedback) — these are
          the app's single most attention-worthy picks (genuinely tracked,
          genuinely undervalued), so they get the bold dark/gold card style
          reserved for headline numbers rather than the calm default. */}
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
        {picks.map((c) => (
          <Link
            key={c.id}
            href={`/cards/${c.id}`}
            className="rounded-lg bg-spotlight-bg p-3 transition hover:brightness-110"
          >
            <div className="font-medium text-spotlight-fg">{c.name}</div>
            <div className="text-xs text-white/60">
              {c.rarity} ・ {c.set_name}
            </div>
            <div className="mt-1 flex items-baseline justify-between">
              <span className="font-mono font-bold text-white">{yen(c.current_price)}</span>
              {/* Intentionally NOT text-spotlight-good (self-review, 2026-09-15
                  — user caught this live on production). Every value here is
                  negative by construction (judgment === "割安" only), but
                  MoverStrip.tsx right below this section on the homepage uses
                  green for POSITIVE moves and orange for negative ones — the
                  same green meaning opposite things four inches apart on the
                  same page reads as a real inconsistency, not a deliberate
                  "green = good deal" convention. Neutral white sidesteps the
                  conflict; the section heading ("割安") already says what this
                  number means without needing color to repeat it. */}
              <span className="font-mono font-bold text-white/70">{pct(c.pct_vs_avg30)}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
