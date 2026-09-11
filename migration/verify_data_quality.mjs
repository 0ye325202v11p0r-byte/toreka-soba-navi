// Regression test for isAutoTracked() in src/lib/format.ts.
//
// Background (UX review, 2026-09-12; Codex follow-up same day): the "this
// price is not auto-updated" warnings in PortfolioClient.tsx/
// WatchlistClient.tsx used to check `data_quality === "partial"` directly,
// which silently omitted the warning for 'flat' (unsourced manual
// estimate) cards — a data_quality value that has occurred in production
// before (c9/c500/c503, until 2026-09-11). Codex's follow-up review pointed
// out that data_quality alone isn't actually what governs auto-updating:
// /api/cron/refresh-prices' real selection query is
// `.eq("data_quality","real").not("source_url","is",null)` — a 2-column
// AND. isAutoTracked() mirrors that exact condition so the UI warning and
// the cron's real behavior can't drift apart.
//
// Imports the REAL src/lib/format.ts (not a hand-copied reimplementation,
// per this project's established testing convention). Run:
// `node --experimental-strip-types migration/verify_data_quality.mjs`.
import { isAutoTracked } from "../src/lib/format.ts";

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${expected}, got ${actual}`);
  if (!ok) process.exitCode = 1;
}

// The common case: real + has a source_url (the actual shape of all 844
// onepiece-card-atari.jp cards per README.md).
assertEqual(
  isAutoTracked({ data_quality: "real", source_url: "https://onepiece-card-atari.jp/x" }),
  true,
  "T1 real + source_url present -> tracked"
);

// The edge case this whole check exists for: data_quality and source_url
// are independent columns (migration/migrate.mjs sets them from separate
// fields), so a 'real' row with a null source_url is possible in principle
// even though it's not known to occur in current data. refresh-prices'
// `.not("source_url","is",null)` would skip such a row, so it must NOT be
// treated as tracked.
assertEqual(
  isAutoTracked({ data_quality: "real", source_url: null }),
  false,
  "T2 real but source_url null -> NOT tracked (cron would skip it)"
);
assertEqual(
  isAutoTracked({ data_quality: "real", source_url: undefined }),
  false,
  "T3 real but source_url undefined -> NOT tracked"
);

// 'partial' (yuyu-tei, single-shop, real source but no tracked history):
// never tracked, regardless of source_url — refresh-prices only ever
// selects data_quality='real' rows.
assertEqual(
  isAutoTracked({ data_quality: "partial", source_url: "https://yuyu-tei.jp/x" }),
  false,
  "T4 partial (has a source_url, but wrong data_quality) -> NOT tracked"
);

// 'flat' (unsourced manual estimate): never tracked. This is the exact
// case that was silently missing the warning before this fix.
assertEqual(
  isAutoTracked({ data_quality: "flat", source_url: null }),
  false,
  "T5 flat + no source_url -> NOT tracked"
);

// null/undefined data_quality (legacy rows / unexpected values): must fail
// safe (NOT tracked), never crash.
assertEqual(isAutoTracked({ data_quality: null, source_url: null }), false, "T6 null data_quality -> NOT tracked");
assertEqual(
  isAutoTracked({ data_quality: undefined, source_url: "https://example.com" }),
  false,
  "T7 undefined data_quality (even with a source_url) -> NOT tracked"
);

console.log("\nAll isAutoTracked() checks completed.");
