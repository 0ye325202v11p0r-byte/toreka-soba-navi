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
}): boolean {
  const { cardId, isKnownCard, pricePerUnit, quantity } = params;
  if (!cardId || !isKnownCard) return false;
  if (pricePerUnit === "" || !Number.isFinite(pricePerUnit)) return false;
  if (!Number.isFinite(quantity) || quantity < 1) return false;
  return true;
}

export function canSubmitWatchItem(params: { cardId: string; isKnownCard: boolean }): boolean {
  return Boolean(params.cardId) && params.isKnownCard;
}
