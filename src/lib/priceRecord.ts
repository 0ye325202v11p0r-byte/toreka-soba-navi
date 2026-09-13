export interface PriceRecordResult {
  // "high"/"low" means newPrice STRICTLY beat the known record — a price
  // merely tying the existing high/low is not new news and reports null,
  // same "only flag a genuine change" philosophy as dashboardSummary.ts's
  // gainers/losers sign filter.
  status: "high" | "low" | null;
  newHigh: number;
  newLow: number;
}

/**
 * "史上最高値・最安値更新" (added 2026-09-13, differentiation feature #6 —
 * a genuine retention TRIGGER, not another dashboard-analysis reward: it
 * needs only this app's own daily-tracked price history, which a plain
 * price-checking page never accumulates). Incrementally maintained against
 * cards.all_time_high_price/all_time_low_price rather than recomputed from
 * full price_snapshots history on every run — see
 * src/lib/priceRecordUpdate.ts for how the two nullable priors get their
 * one-time seed value on a card's first sighting.
 */
export function computePriceRecord(
  newPrice: number,
  priorHigh: number | null,
  priorLow: number | null
): PriceRecordResult {
  if (priorHigh === null || newPrice > priorHigh) {
    return { status: "high", newHigh: newPrice, newLow: priorLow === null ? newPrice : priorLow };
  }
  if (priorLow === null || newPrice < priorLow) {
    return { status: "low", newHigh: priorHigh, newLow: newPrice };
  }
  return { status: null, newHigh: priorHigh, newLow: priorLow };
}
