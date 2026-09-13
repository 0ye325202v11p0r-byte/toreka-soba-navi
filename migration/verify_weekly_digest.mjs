// Regression test for src/lib/weeklyDigest.ts's buildWeeklyDigestPayload()
// — the weekly re-engagement push notification (2026-09-13, a different
// retention lever than this session's dashboard-analysis features: this
// one proactively pulls a user back instead of rewarding a visit they
// already made).
//
// Run: node --experimental-strip-types migration/verify_weekly_digest.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { buildWeeklyDigestPayload } = await import("../src/lib/weeklyDigest.ts");

let pass = 0;
let fail = 0;
function assertEqual(actual, expected, label) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    pass++;
  } else {
    fail++;
    console.error(`FAIL: ${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

// Minimal fixture matching DashboardSummary's shape — only the fields
// buildWeeklyDigestPayload actually reads are populated per test.
function summary(overrides = {}) {
  return {
    currentValue: 0,
    unrealizedPnl: 0,
    realizedPnl: 0,
    totalPnl: 0,
    holdingsCount: 0,
    triggeredItems: [],
    gainers: [],
    losers: [],
    untrackedCount: 0,
    unpricedHoldingsCount: 0,
    staleCard: null,
    benchmark: { portfolioAvgPct: null, marketAvgPct: null, excludedHoldingsCount: 0 },
    profitTakingCandidates: [],
    hasNothing: false,
    ...overrides,
  };
}

// T1: a brand-new user (hasNothing:true) gets NO digest at all — a "your
// portfolio is empty" push would be an annoying nudge, not a helpful one.
assertEqual(buildWeeklyDigestPayload(summary({ hasNothing: true })), null, "T1: hasNothing -> no digest sent");

// T2: an active user with holdings and a nonzero total P&L gets a digest
// naming their actual P&L.
{
  const result = buildWeeklyDigestPayload(summary({ holdingsCount: 2, totalPnl: 12345 }));
  assertEqual(result.body.includes("¥12,345"), true, "T2: the digest body includes the user's actual total P&L");
  assertEqual(result.url, "/dashboard", "T2: the digest links to the dashboard");
}

// T3: a user with triggered watchlist items gets that count mentioned.
{
  const result = buildWeeklyDigestPayload(summary({ triggeredItems: [{}, {}] }));
  assertEqual(result.body.includes("ウォッチ条件成立 2件"), true, "T3: triggered watchlist count is mentioned when nonzero");
}

// T4: a user with profit-taking candidates gets that count mentioned too —
// multiple noteworthy facts can appear in the same digest, not just one.
{
  const result = buildWeeklyDigestPayload(summary({ holdingsCount: 1, totalPnl: 500, profitTakingCandidates: [{}] }));
  assertEqual(result.body.includes("合計損益"), true, "T4: P&L is still mentioned");
  assertEqual(result.body.includes("利益確定候補 1件"), true, "T4: profit-taking candidate count is also mentioned in the same digest");
}

// T5: a user who only watches cards (no holdings, no realized history, no
// triggered conditions, no candidates) but is NOT hasNothing (they do have
// watchlist items) still gets a generic nudge, not nothing.
{
  const result = buildWeeklyDigestPayload(summary({ hasNothing: false }));
  assertEqual(result !== null, true, "T5: a user with nothing noteworthy but hasNothing:false still gets a generic nudge");
  assertEqual(result.body, "今週の相場・保有状況を確認してみましょう。", "T5: the generic fallback message is used when no specific fact applies");
}

// T6: a fully-sold-out user (holdingsCount:0 but realizedPnl nonzero) still
// gets their P&L mentioned — matches dashboardSummary's own "holdingsCount
// > 0 || realizedPnl !== 0" display-gating principle, not holdingsCount alone.
{
  const result = buildWeeklyDigestPayload(summary({ holdingsCount: 0, realizedPnl: 400, totalPnl: 400 }));
  assertEqual(result.body.includes("¥400"), true, "T6: a fully-sold-out user's realized P&L is still surfaced, not hidden because holdingsCount is 0");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
