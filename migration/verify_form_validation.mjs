// Regression test for src/lib/formValidation.ts — the pure gating rules
// that back the "record a transaction" / "register a watch" submit buttons
// in PortfolioClient.tsx / WatchlistClient.tsx.
//
// Background (UX review, 2026-09-12): both components used to initialize
// their CardPicker's selected card to cards[0] (an arbitrary real catalog
// entry, not "unselected"), and the closed picker rendered that card's name
// indistinguishably from a deliberate choice. A user who never touched the
// picker could submit a transaction or watch rule for a card they never
// intended, with no error. Fix: default to "" (unselected), gate the submit
// button's disabled= on these functions, and re-check the same rule inside
// the onSubmit handler as defense-in-depth against implicit form submission
// bypassing a disabled button.
//
// Imports the REAL src/lib/formValidation.ts (not a hand-copied
// reimplementation, per this project's established testing convention —
// see verify_pnl_logic.mjs). Run: `node --experimental-strip-types
// migration/verify_form_validation.mjs`. A MODULE_TYPELESS_PACKAGE_JSON
// warning on stderr is expected and harmless.
import { canSubmitTransaction, canSubmitWatchItem } from "../src/lib/formValidation.ts";

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

// --- canSubmitTransaction ---

// No card selected at all (the exact pre-fix default state) must never be
// submittable, even with otherwise-valid quantity/price.
assertEqual(
  canSubmitTransaction({ cardId: "", isKnownCard: false, pricePerUnit: 500, quantity: 1 }),
  false,
  "T1 no card selected (cardId='') is rejected"
);

// A non-empty cardId that isn't actually in the current catalog (stale
// selection, or a caller bypassing the picker) must also be rejected —
// isKnownCard is the caller's cardById.has(cardId) check.
assertEqual(
  canSubmitTransaction({ cardId: "c-does-not-exist", isKnownCard: false, pricePerUnit: 500, quantity: 1 }),
  false,
  "T2 unknown/stale card id is rejected even though cardId is non-empty"
);

// A known, selected card with valid price/quantity is submittable — this is
// the "selected after / correct id would be saved" case. canSubmitTransaction
// itself doesn't carry the id anywhere (the caller uses the same cardId it
// already validated), so "correctness of the saved id" is proven by the
// caller (PortfolioClient) using the identical `cardId` variable for both
// this gate and the actual insert() call — there is no second code path
// that could substitute a different id.
assertEqual(
  canSubmitTransaction({ cardId: "c1", isKnownCard: true, pricePerUnit: 500, quantity: 1 }, ),
  true,
  "T3 known card + valid price/quantity is submittable"
);

// Price still empty (user hasn't typed one yet) blocks submission even with
// a card selected.
assertEqual(
  canSubmitTransaction({ cardId: "c1", isKnownCard: true, pricePerUnit: "", quantity: 1 }),
  false,
  "T4 empty price blocks submission"
);

// Non-finite price (defensive — shouldn't be reachable via the number
// input, but the function must not silently accept it) blocks submission.
assertEqual(
  canSubmitTransaction({ cardId: "c1", isKnownCard: true, pricePerUnit: NaN, quantity: 1 }),
  false,
  "T5 NaN price blocks submission"
);

// Quantity below 1 blocks submission.
assertEqual(
  canSubmitTransaction({ cardId: "c1", isKnownCard: true, pricePerUnit: 500, quantity: 0 }),
  false,
  "T6 quantity 0 blocks submission"
);

// Fractional quantity blocks submission — transactions.quantity is a
// Postgres `integer` column (supabase/schema.sql) with no client-side
// enforcement elsewhere (the quantity <input> has no `step`, so a browser
// accepts "2.5" as typed text). Before this check, a fractional quantity
// passed this gate and the insert failed with a raw, untranslated Postgres
// error instead of a friendly validation message (self-review, 2026-09-12).
assertEqual(
  canSubmitTransaction({ cardId: "c1", isKnownCard: true, pricePerUnit: 500, quantity: 1.5 }),
  false,
  "T6b fractional quantity (1.5) blocks submission"
);
assertEqual(
  canSubmitTransaction({ cardId: "c1", isKnownCard: true, pricePerUnit: 500, quantity: 2 }),
  true,
  "T6c whole-number quantity (2) is still submittable"
);

// --- canSubmitWatchItem ---

assertEqual(
  canSubmitWatchItem({ cardId: "", isKnownCard: false }),
  false,
  "T7 no card selected is rejected"
);
assertEqual(
  canSubmitWatchItem({ cardId: "c-does-not-exist", isKnownCard: false }),
  false,
  "T8 unknown/stale card id is rejected"
);
assertEqual(canSubmitWatchItem({ cardId: "c1", isKnownCard: true }), true, "T9 known selected card is submittable");

// --- Empty catalog (cards.length === 0) ---
// The catalog itself being empty is indistinguishable, from this function's
// point of view, from "nothing selected yet": cardId is "" either way
// (there is nothing to select), so it must still reject. This mirrors what
// PortfolioClient/WatchlistClient actually do with an empty `cards` prop —
// cardById.has("") is always false, so isKnownCard is always false too.
assertEqual(
  canSubmitTransaction({ cardId: "", isKnownCard: false, pricePerUnit: 500, quantity: 1 }),
  false,
  "T10 empty catalog: transaction submission stays blocked"
);
assertEqual(
  canSubmitWatchItem({ cardId: "", isKnownCard: false }),
  false,
  "T11 empty catalog: watch item submission stays blocked"
);

console.log("\nAll formValidation.ts checks completed.");
