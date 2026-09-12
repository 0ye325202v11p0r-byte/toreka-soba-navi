// Regression test for src/lib/watchlistRule.ts's conditionMet() — extracted
// 2026-09-13 from two previously-identical copies (check-watchlist/
// route.ts's conditionMet(), WatchlistClient.tsx's ruleIsMet()) when a
// third call site (the new dashboard) needed the exact same "is this rule
// currently true" check. This project's established convention is to share
// logic once a third copy would otherwise appear.
//
// Imports the REAL src/lib/watchlistRule.ts. Run: `node
// --experimental-strip-types migration/verify_watchlist_rule.mjs`. A
// MODULE_TYPELESS_PACKAGE_JSON warning on stderr is expected and harmless.
import { conditionMet } from "../src/lib/watchlistRule.ts";

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

// --- pct_vs_avg30 rules ---
assertEqual(
  conditionMet({ type: "pct_vs_avg30", op: "lte", value: -15 }, { pctVsAvg30: -20, currentPrice: 1000 }),
  true,
  "T1 pct_vs_avg30 lte: -20 <= -15 is true"
);
assertEqual(
  conditionMet({ type: "pct_vs_avg30", op: "lte", value: -15 }, { pctVsAvg30: -10, currentPrice: 1000 }),
  false,
  "T2 pct_vs_avg30 lte: -10 <= -15 is false"
);
assertEqual(
  conditionMet({ type: "pct_vs_avg30", op: "gte", value: 15 }, { pctVsAvg30: 20, currentPrice: 1000 }),
  true,
  "T3 pct_vs_avg30 gte: 20 >= 15 is true"
);

// --- price rules ---
assertEqual(
  conditionMet({ type: "price", op: "lte", value: 500 }, { pctVsAvg30: null, currentPrice: 400 }),
  true,
  "T4 price lte: 400 <= 500 is true, even with pctVsAvg30 null (untracked card)"
);
assertEqual(
  conditionMet({ type: "price", op: "gte", value: 500 }, { pctVsAvg30: null, currentPrice: 400 }),
  false,
  "T5 price gte: 400 >= 500 is false"
);

// --- null/undefined handling (untracked or missing card) ---
assertEqual(
  conditionMet({ type: "pct_vs_avg30", op: "lte", value: -15 }, { pctVsAvg30: null, currentPrice: 400 }),
  false,
  "T6 pct_vs_avg30 rule never fires when pctVsAvg30 is null (card not auto-tracked)"
);
assertEqual(
  conditionMet({ type: "price", op: "lte", value: 500 }, { pctVsAvg30: null, currentPrice: null }),
  false,
  "T7 price rule never fires when currentPrice is null"
);
assertEqual(
  conditionMet({ type: "pct_vs_avg30", op: "lte", value: -15 }, undefined),
  false,
  "T8 undefined card (e.g. a stale card_id no longer in the lookup map) never fires"
);
assertEqual(
  conditionMet({ type: "price", op: "gte", value: 0 }, undefined),
  false,
  "T9 undefined card never fires even for a price rule"
);

console.log("\nAll watchlistRule.ts (conditionMet) checks completed.");
