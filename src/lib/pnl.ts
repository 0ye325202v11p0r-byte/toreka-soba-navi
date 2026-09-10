import type { Transaction, HoldingSummary, PnlSummary } from "./types";

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
      // price_per_unit is a Postgres `numeric` column, which PostgREST may
      // serialize as a JSON string to avoid float precision loss — coerce
      // explicitly rather than relying on operator coercion further down.
      const quantity = Number(t.quantity);
      const pricePerUnit = Number(t.price_per_unit);

      if (t.type === "buy") {
        lots.push({ quantity, pricePerUnit });
        continue;
      }

      // sell: consume oldest lots first (FIFO), realize gain/loss per unit sold
      let remainingToSell = quantity;
      while (remainingToSell > 0 && lots.length > 0) {
        const lot = lots[0];
        const consumed = Math.min(lot.quantity, remainingToSell);
        realizedPnl += consumed * (pricePerUnit - lot.pricePerUnit);
        lot.quantity -= consumed;
        remainingToSell -= consumed;
        if (lot.quantity === 0) lots.shift();
      }
      // if remainingToSell > 0 here, the ledger sold more than was ever
      // bought (e.g. a transaction predating the ledger) — ignore the excess
      // rather than inventing a cost basis for it.
    }

    const quantity = lots.reduce((sum, l) => sum + l.quantity, 0);
    const costBasis = lots.reduce((sum, l) => sum + l.quantity * l.pricePerUnit, 0);

    if (quantity > 0) {
      holdings.push({ cardId, quantity, costBasis, avgCost: costBasis / quantity });
      costBasisTotal += costBasis;
    }
  }

  return { holdings, realizedPnl, costBasisTotal };
}
