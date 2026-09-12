// Pure, framework-free gating rules shared by PortfolioClient.tsx and
// WatchlistClient.tsx. Kept in a plain .ts file (no JSX) specifically so a
// Node regression test can import the REAL functions directly via
// `--experimental-strip-types` — a .tsx file containing JSX can't be loaded
// that way, only type-stripped.
//
// Both components' CardPicker used to default to cards[0] (an arbitrary
// real catalog entry, not "unselected"), so a user who never touched the
// picker could submit a transaction or watch rule for a card they never
// chose, with no error (found in UX review, 2026-09-12). These functions
// back both the submit button's disabled= state and the onSubmit handler's
// guard, so the two can't drift out of sync.

export function canSubmitTransaction(params: {
  cardId: string;
  isKnownCard: boolean;
  pricePerUnit: number | "";
  quantity: number;
  // Optional (added 2026-09-13 with fee-aware P&L) — "" or omitted means
  // "not entered," which is valid and defaults to 0 on submit, exactly the
  // same as every transaction recorded before this field existed. Only a
  // value the user actually typed gets validated.
  fee?: number | "";
}): boolean {
  const { cardId, isKnownCard, pricePerUnit, quantity, fee } = params;
  if (!cardId || !isKnownCard) return false;
  if (pricePerUnit === "" || !Number.isFinite(pricePerUnit)) return false;
  // transactions.quantity is a Postgres `integer` column (supabase/schema.sql)
  // with no client-side enforcement of its own — the <input type="number">
  // in PortfolioClient.tsx has no `step`, so a browser happily accepts "2.5"
  // and this function used to let it through (quantity < 1 was the only
  // check). The insert then failed with a raw, untranslated Postgres error
  // ("invalid input syntax for type integer") surfaced verbatim to the user
  // instead of a Japanese validation message — found via self-review,
  // 2026-09-12.
  if (!Number.isInteger(quantity) || quantity < 1) return false;
  // Matches the DB's `check (fee >= 0)` — catches a bad value here with a
  // friendly message instead of a raw Postgres constraint error, same
  // reasoning as the quantity check above.
  if (fee !== undefined && fee !== "" && (!Number.isFinite(fee) || fee < 0)) return false;
  return true;
}

export function canSubmitWatchItem(params: { cardId: string; isKnownCard: boolean }): boolean {
  return Boolean(params.cardId) && params.isKnownCard;
}
