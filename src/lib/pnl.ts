import type { Transaction, HoldingSummary, PnlSummary, RealizedEvent } from "./types";

interface Lot {
  quantity: number;
  pricePerUnit: number;
}

/**
 * Computes current holdings (FIFO cost basis) and lifetime realized P&L from
 * a user's full transaction history. Pure function, no DB access, so it can
 * run in a server component or be unit tested directly.
 */
export function computePnl(transactions: Transaction[]): PnlSummary {
  const byCard = new Map<string, Transaction[]>();
  for (const t of transactions) {
    const list = byCard.get(t.card_id) ?? [];
    list.push(t);
    byCard.set(t.card_id, list);
  }

  const holdings: HoldingSummary[] = [];
  let realizedPnl = 0;
  let costBasisTotal = 0;
  const realizedEvents: RealizedEvent[] = [];

  for (const [cardId, txns] of byCard) {
    // sort chronologically; when two transactions land on the same date, fall
    // back to created_at so FIFO consumption order is deterministic instead
    // of depending on whatever order the DB happened to return rows in
    const sorted = [...txns].sort((a, b) => {
      const dateDiff = new Date(a.transaction_date).getTime() - new Date(b.transaction_date).getTime();
      if (dateDiff !== 0) return dateDiff;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    const lots: Lot[] = [];

    for (const t of sorted) {
      // price_per_unit/fee are Postgres `numeric` columns, which PostgREST
      // may serialize as a JSON string to avoid float precision loss —
      // coerce explicitly rather than relying on operator coercion further
      // down. `t.fee ?? 0` covers transactions recorded before the fee
      // column existed (absent from the object entirely, not just 0).
      const quantity = Number(t.quantity);
      const pricePerUnit = Number(t.price_per_unit);
      const fee = Number(t.fee ?? 0);

      if (t.type === "buy") {
        // Fee raises the effective cost basis — a ¥100 fee on a ¥1000×2
        // purchase means the true cost is ¥1050/unit, not ¥1000/unit.
        // Folded into the lot's own pricePerUnit here (rather than tracked
        // separately) so every downstream FIFO consumption below needs no
        // changes at all — it already operates purely on lot.pricePerUnit
        // (self-review, 2026-09-13: without this, 含み損益/実現損益 never
        // reflected what actually left the user's pocket on a purchase).
        const effectiveCostPerUnit = (quantity * pricePerUnit + fee) / quantity;
        lots.push({ quantity, pricePerUnit: effectiveCostPerUnit });
        continue;
      }

      // sell: fee lowers the effective proceeds per unit, the same way —
      // a ¥100 fee on a ¥1200×2 sale means real proceeds are ¥1150/unit,
      // not ¥1200/unit.
      const effectiveProceedsPerUnit = (quantity * pricePerUnit - fee) / quantity;

      // consume oldest lots first (FIFO), realize gain/loss per unit sold
      let remainingToSell = quantity;
      let eventGain = 0;
      while (remainingToSell > 0 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(lot.quantity, remainingToSell);
        const gain = consumed * (effectiveProceedsPerUnit - lot.pricePerUnit);
        realizedPnl += gain;
        eventGain += gain;
        lot.quantity -= consumed;
        remainingToSell -= consumed;
        if (lot.quantity === 0) lots.shift();
      }
      // if remainingToSell > 0 here, the ledger sold more than was ever
      // bought (e.g. a transaction predating the ledger) — ignore the excess
      // rather than inventing a cost basis for it. eventGain still only
      // reflects the matched portion, same as realizedPnl itself — one
      // record per sell TRANSACTION (not per lot consumed), so a sell that
      // spans multiple buy lots still shows up as a single line in the
      // realized-P&L report a user would actually recognize.
      realizedEvents.push({ cardId, date: t.transaction_date, quantity, gain: eventGain });
    }

    const quantity = lots.reduce((sum, l) => sum + l.quantity, 0);
    const costBasis = lots.reduce((sum, l) => sum + l.quantity * l.pricePerUnit, 0);

    if (quantity > 0) {
      holdings.push({ cardId, quantity, costBasis, avgCost: costBasis / quantity });
      costBasisTotal += costBasis;
    }
  }

  return { holdings, realizedPnl, costBasisTotal, realizedEvents };
}
