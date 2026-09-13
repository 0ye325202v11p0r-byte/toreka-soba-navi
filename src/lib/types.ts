export type Judgment = "割安" | "適正" | "割高";
export type DataQuality = "real" | "partial" | "flat";

export interface Card {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  card_number: string | null;
  source_url: string | null;
  current_price: number | null;
  avg30: number | null;
  avg90: number | null;
  pct_vs_avg30: number | null;
  pct_vs_avg90: number | null;
  low30: number | null;
  change_amt30: number | null;
  judgment: Judgment | null;
  trend_direction: "rising" | "declining" | "flat" | null;
  data_quality: DataQuality | null;
  history_is_estimated: boolean | null;
  ai_verdict: Judgment | null;
  ai_verdict_text: string | null;
  ai_verdict_at: string | null;
  source_note: string | null;
  updated_at: string;
}

// Subset of Card used by the market list page (src/app/page.tsx) and its
// child components (MarketTable/TodaysPicks/MoverStrip) — none of them
// touch avg30/avg90/ai_verdict_text/source_url/etc, so the market list
// query selects only these columns instead of `select("*")`. ai_verdict_text
// alone is a full paragraph per card; fetching it (and everything else
// unused) for all ~3,270 cards on every request was pure waste on the
// highest-traffic page.
export interface MarketListCard {
  id: string;
  name: string;
  rarity: string;
  set_name: string | null;
  current_price: number | null;
  pct_vs_avg30: number | null;
  judgment: Judgment | null;
  data_quality: DataQuality | null;
}

// Subset of Card used by the dashboard (src/app/dashboard/page.tsx) — only
// ever queried for the cards a specific user actually holds or watches
// (never the full ~3,270-card catalog), so this is deliberately narrower
// than MarketListCard: no rarity/set_name, since the dashboard doesn't
// render them.
export interface DashboardCardInfo {
  id: string;
  name: string;
  current_price: number | null;
  pct_vs_avg30: number | null;
  data_quality: DataQuality | null;
  source_url: string | null;
  // Added 2026-09-13 (Codex UX review, cycle 2) for price-freshness display
  // on revisit — see dashboardSummary.ts's staleCard.
  updated_at: string;
  // Added 2026-09-13 (differentiation feature #4) for profitTaking.ts's
  // "judgment === 割高" check.
  judgment: Judgment | null;
  // Added 2026-09-13 (differentiation feature #6, "史上最高値・最安値更新")
  // — see priceRecord.ts. Optional in practice until
  // migration/retrofit_add_price_records.sql is run against production;
  // callers read this via a `?? null`-style coalesce on a select("*") row
  // rather than naming it in an explicit column list, so a page never
  // errors just because the column doesn't exist in production yet.
  record_status: "high" | "low" | null;
}

export interface PriceSnapshot {
  id: string;
  card_id: string;
  snapshot_date: string;
  price: number;
}

export type TransactionType = "buy" | "sell";

export interface Transaction {
  id: string;
  user_id: string;
  card_id: string;
  type: TransactionType;
  quantity: number;
  price_per_unit: number;
  // Total fee/commission paid on this transaction (added 2026-09-13) —
  // `not null default 0` in the DB, so this is always a real number, never
  // null, even for transactions recorded before the column existed.
  fee: number;
  transaction_date: string;
  note: string | null;
  created_at: string;
}

export interface HoldingSummary {
  cardId: string;
  quantity: number;
  costBasis: number; // remaining FIFO cost of current holdings
  avgCost: number; // costBasis / quantity
}

// One sell transaction's realized gain/loss (added 2026-09-13 for the
// annual realized-P&L report — a plain price-checking site has no notion
// of a user's own transaction history, so it can never help with this;
// see taxReport.ts). `quantity` is the full quantity recorded on the sell
// even if it exceeded what computePnl() could actually match against real
// lots (see pnl.ts's "ignore the excess" comment) — `gain` reflects only
// the matched portion, same as realizedPnl itself.
export interface RealizedEvent {
  cardId: string;
  date: string; // the sell transaction's transaction_date
  quantity: number;
  gain: number;
}

export interface PnlSummary {
  holdings: HoldingSummary[];
  realizedPnl: number; // lifetime realized profit/loss from sells
  costBasisTotal: number; // total cost basis of current holdings
  // Per-sell-transaction detail behind the aggregate realizedPnl above —
  // needed to group realized gains by year/month for tax-report purposes.
  realizedEvents: RealizedEvent[];
}

export type WatchlistAlertRule =
  | { type: "pct_vs_avg30"; op: "lte" | "gte"; value: number }
  | { type: "price"; op: "lte" | "gte"; value: number };

export interface WatchlistItem {
  id: string;
  user_id: string;
  card_id: string;
  alert_rule: WatchlistAlertRule;
  last_triggered_at: string | null;
}

// A browser Web Push subscription (added 2026-09-13, watchlist push
// notifications) — one row per subscribed device/browser, not per user (a
// user with two browsers has two rows).
export interface PushSubscriptionRow {
  id: string;
  user_id: string;
  endpoint: string;
  p256dh: string;
  auth_key: string;
}
