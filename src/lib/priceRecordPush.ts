import type { PriceRecordAlert } from "./priceRecordAlerts";

/**
 * "史上最高値・最安値更新" push payload (differentiation feature #6) — a
 * different KIND of trigger than weeklyDigest.ts's scheduled catch-up: this
 * fires on the specific day a held/watched card actually sets a record,
 * using a fact only this app's own daily-tracked price history can produce.
 * Returns null for an empty alert list (nothing to push about) — same
 * "don't send an empty/pointless notification" rule as weeklyDigest.ts.
 */
export function buildPriceRecordPushPayload(
  alerts: PriceRecordAlert[]
): { title: string; body: string; url: string } | null {
  if (alerts.length === 0) return null;

  const highs = alerts.filter((a) => a.status === "high");
  const lows = alerts.filter((a) => a.status === "low");

  const parts: string[] = [];
  if (highs.length > 0) {
    parts.push(`🔺${highs.map((a) => a.cardName).join("、")}が史上最高値を更新`);
  }
  if (lows.length > 0) {
    parts.push(`🔻${lows.map((a) => a.cardName).join("、")}が史上最安値を更新`);
  }

  return { title: "🏆 トレカ相場ナビ 価格更新アラート", body: parts.join("／"), url: "/dashboard" };
}
