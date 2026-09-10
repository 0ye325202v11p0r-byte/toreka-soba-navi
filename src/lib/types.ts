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

export interface PriceSnapshot {
  id: string;
  card_id: string;
  snapshot_date: string;
  price: number;
}

export interface PortfolioItem {
  id: string;
  user_id: string;
  card_id: string;
  quantity: number;
  acquired_price: number | null;
  acquired_date: string | null;
  note: string | null;
}

export interface WatchlistAlertRule {
  type: "pct_vs_avg30";
  op: "lte" | "gte";
  value: number;
}

export interface WatchlistItem {
  id: string;
  user_id: string;
  card_id: string;
  alert_rule: WatchlistAlertRule;
  last_triggered_at: string | null;
}
