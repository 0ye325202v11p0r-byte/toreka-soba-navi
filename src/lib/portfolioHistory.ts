import { computePnl } from "./pnl";
import type { Transaction, PriceSnapshot } from "./types";

export interface PortfolioValuePoint {
  date: string; // YYYY-MM-DD
  value: number;
}

// Evaluates portfolio value at every distinct transaction_date the user
// has (added 2026-09-13 — a "why open this weekly" feature: seeing net
// worth trend over time is a hallmark of any serious portfolio tracker).
// Deliberately reuses the REAL computePnl() as the FIFO engine (called
// once per evaluation date, replaying only the transactions up to and
// including that date) rather than reimplementing lot-consumption logic a
// second time — this project's established "don't duplicate tested logic"
// principle. Performance is a non-issue at the O(N²) this implies: a
// personal portfolio realistically has tens to a few hundred transactions,
// not thousands.
//
// Deliberately evaluates only at transaction dates, not every calendar day
// in between — a portfolio's value only actually CHANGES (from this
// function's perspective) either because a transaction happened or because
// a card's price moved, and this project doesn't have per-card price
// history at every single calendar day either (yuyu-tei-sourced cards can
// go weeks between the daily cron catching them, and 'flat' cards have no
// tracked history at all) — so filling in every calendar day would just
// forward-fill the same holdings at whatever the nearest earlier price
// happens to be, adding density without adding information. If a smoother
// day-by-day line is ever wanted, that's a display-layer interpolation
// decision, not something this function needs to fabricate.
export function buildPortfolioValueHistory(
  transactions: Transaction[],
  snapshotsByCard: Map<string, PriceSnapshot[]>
): PortfolioValuePoint[] {
  const sorted = [...transactions].sort((a, b) => {
    const dateDiff = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
    if (dateDiff !== 0) return dateDiff;
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });
  const evalDates = Array.from(new Set(sorted.map((t) => t.transaction_date))).sort();

  // Snapshots pre-sorted once per card (ascending by date) so
  // priceOnOrBefore() below can do a simple forward scan per lookup rather
  // than re-sorting on every one of the O(dates * holdings) calls.
  const sortedSnapshotsByCard = new Map<string, PriceSnapshot[]>();
  for (const [cardId, snaps] of snapshotsByCard) {
    sortedSnapshotsByCard.set(
      cardId,
      [...snaps].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))
    );
  }

  function priceOnOrBefore(cardId: string, date: string): number | null {
    const snaps = sortedSnapshotsByCard.get(cardId);
    if (!snaps) return null;
    let result: number | null = null;
    for (const s of snaps) {
      if (s.snapshot_date > date) break;
      result = Number(s.price);
    }
    return result;
  }

  const points: PortfolioValuePoint[] = [];
  for (const date of evalDates) {
    const upToDate = sorted.filter((t) => t.transaction_date <= date);
    const pnl = computePnl(upToDate);
    let value = 0;
    for (const h of pnl.holdings) {
      const price = priceOnOrBefore(h.cardId, date);
      // A held card with no price data at or before this date (e.g. a
      // 'flat' card with zero tracked snapshot history, or a card bought
      // before its own first recorded snapshot) contributes nothing to
      // this point rather than being silently valued at 0 — the latter
      // would make the line dip in a way that misrepresents an actual
      // loss, when it's really just missing data.
      if (price !== null) value += price * h.quantity;
    }
    points.push({ date, value });
  }
  return points;
}
