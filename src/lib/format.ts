import type { Judgment } from "./types";

// For embedding structured data (JSON-LD) via dangerouslySetInnerHTML.
// Plain JSON.stringify() does not escape "<", so a value containing the
// literal text "</script>" (e.g. a card name — cards.name is populated by
// expand_catalog.mjs/scrape_yuyutei.mjs from THIRD-PARTY scraped HTML, not
// hand-authored content) would close the JSON-LD <script> tag early and let
// whatever text follows it be parsed as new HTML/script. < is the
// standard escape for this: it round-trips through JSON.parse back to "<"
// (so structured-data consumers like Google's rich-results parser see the
// same object), but the browser's HTML tokenizer never sees a literal "<"
// while scanning for the closing tag, so it can't be tricked into ending
// the script block early. Found via self-review, 2026-09-12 — not confirmed
// exploited (no real card name has contained this so far), but scraped
// third-party text should never be assumed safe to embed unescaped.
export function safeJsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

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

// Whether a card is in scope for one of the two daily price-tracking crons
// — /api/cron/refresh-prices (data_quality='real', onepiece-card-atari.jp)
// or /api/cron/refresh-yuyutei-prices (data_quality='partial', yuyu-tei.jp,
// added 2026-09-12) — and so carries tracked history (avg30/avg90/
// judgment). Mirrors those routes' actual selection queries — both require
// a non-null source_url — rather than assuming data_quality alone decides
// it. data_quality and source_url are set independently at data-entry time
// (see migration/migrate.mjs), so a "real" or "partial" card with a null
// source_url is possible in principle; treating that combination as
// untracked (the `&&` below) fails safe rather than silently overstating
// freshness. 'flat' (an unsourced manual estimate — no shop to re-fetch
// from at all) is never in scope for either cron.
//
// This is a distinct axis from dataQualityLabel()'s real/partial/flat
// label: that label answers "is this a multi-shop average, a single-shop
// price, or an unverified estimate" (a provenance question that doesn't
// change once a card starts being tracked — yuyu-tei is always one shop,
// tracked daily or not). isAutoTracked answers "does a daily cron keep
// this price current" (a separate, cron-scope question). Conflating the
// two previously showed the "not auto-updated" warning only for
// data_quality==='partial', silently omitting it for 'flat' cards (found
// in UX review, 2026-09-12); building the yuyu-tei cron is exactly why
// that separation matters going forward — 'partial' cards are now
// expected to flip from "not tracked" to "tracked" without their
// data_quality ever changing.
//
// IMPORTANT — this answers only "is this card in scope for a cron", a
// static/structural question. It does NOT mean: the most recent cron run
// actually succeeded for this card (an in-scope card can still have a
// stale price if recent fetches failed), that the displayed price is
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
  return (
    (card.data_quality === "real" || card.data_quality === "partial") && card.source_url != null
  );
}
