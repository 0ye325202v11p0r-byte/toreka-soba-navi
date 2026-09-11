import type { Judgment } from "./types";

// PostgREST can return Postgres `numeric` columns as JSON strings (to avoid
// float precision loss), so every value coming from Supabase is typed
// `number` here but must be coerced defensively before calling
// Number.prototype methods like toFixed().
export function yen(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function pct(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function judgmentClasses(judgment: Judgment | null | undefined): string {
  switch (judgment) {
    case "割安":
      return "bg-good-soft text-good";
    case "割高":
      return "bg-warn-soft text-warn";
    default:
      return "bg-accent-soft text-accent-strong";
  }
}

export function dataQualityLabel(quality: string | null | undefined): {
  label: string;
  cls: string;
} {
  switch (quality) {
    case "real":
      return { label: "実測データ", cls: "bg-good-soft text-good" };
    case "partial":
      return { label: "1店舗の参考価格", cls: "bg-accent-soft text-accent-strong" };
    default:
      return { label: "参考値", cls: "bg-warn-soft text-warn" };
  }
}

// Whether a card is auto-updated by /api/cron/refresh-prices and carries
// tracked history (avg30/avg90/judgment). Mirrors that route's actual
// selection query exactly — `.eq("data_quality", "real")` AND
// `.not("source_url", "is", null)` (src/app/api/cron/refresh-prices/
// route.ts) — rather than assuming data_quality alone decides it.
// data_quality and source_url are set independently at data-entry time
// (see migration/migrate.mjs), so a "real" card with a null source_url is
// possible in principle; treating that combination as untracked (the `&&`
// below) fails safe rather than silently overstating freshness.
//
// This is a distinct axis from dataQualityLabel()'s real/partial/flat
// label: that label answers "is there a verifiable real-world price source
// at all" (real and partial both qualify; flat, an unsourced manual
// estimate, does not). isAutoTracked answers "does the daily cron keep
// this price current" (only real+source_url qualifies; partial and flat
// are both never auto-updated, for different reasons). Conflating the two
// previously showed the "not auto-updated" warning only for
// data_quality==='partial', silently omitting it for 'flat' cards (found
// in UX review, 2026-09-12).
//
// IMPORTANT — this answers only "is this card in scope for the cron", a
// static/structural question. It does NOT mean: the most recent cron run
// actually succeeded for this card (a real+source_url card can still have
// a stale price if recent fetches failed), that the displayed price is
// fresh as of today, or that a pct_vs_avg30 watch rule is guaranteed to
// fire — those depend on run history and the card's actual stats being
// non-null, which callers must still check separately (independent review
// follow-up, 2026-09-12). UI text built on this function should describe
// scope ("not auto-updated by design") and avoid claiming success/freshness
// or an absolute "will never happen" outcome.
export function isAutoTracked(card: {
  data_quality?: string | null;
  source_url?: string | null;
}): boolean {
  return card.data_quality === "real" && card.source_url != null;
}
