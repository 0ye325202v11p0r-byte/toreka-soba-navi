import type { DashboardCardInfo } from "./types";

export interface PriceRecordAlert {
  cardId: string;
  cardName: string;
  status: "high" | "low";
}

/**
 * "史上最高値・最安値更新" (differentiation feature #6) — surfaces exactly
 * the relevant (held or watched) cards whose record_status is currently
 * set. record_status is recomputed to null by refresh-prices' cron on every
 * run where the latest price does NOT beat the known record (see
 * priceRecord.ts), so a non-null status here always means "as of the most
 * recent price update," never a stale flag from days ago — this function
 * needs no date filtering of its own.
 */
export function findPriceRecordAlerts(relevantCards: DashboardCardInfo[]): PriceRecordAlert[] {
  const alerts: PriceRecordAlert[] = [];
  for (const c of relevantCards) {
    if (c.record_status === "high" || c.record_status === "low") {
      alerts.push({ cardId: c.id, cardName: c.name, status: c.record_status });
    }
  }
  return alerts;
}
