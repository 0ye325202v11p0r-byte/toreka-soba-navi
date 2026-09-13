// Regression test for src/lib/dashboardSummary.ts's buildDashboardSummary()
// — the pure aggregation behind the new /dashboard page (added 2026-09-13
// in response to the user's request to make the app worth reopening
// weekly; see COORDINATION.md's design discussion). Imports the REAL
// implementation (buildDashboardSummary, which itself calls the real
// computePnl/conditionMet/isAutoTracked), not a hand-copied
// reimplementation — this project's established convention.
//
// Scenarios below simulate a real login session's worth of data end to
// end, not just isolated unit checks, per the request to show "an actual
// user flow."
//
// Run: node --experimental-strip-types migration/verify_dashboard_summary.mjs
//
// Registers the shared test-loader hook (see _test_mocks/loader.mjs) even
// though this file needs none of its @/ or Supabase mocking — it also now
// carries the fallback that resolves dashboardSummary.ts's own extensionless
// relative imports to its sibling lib modules (./pnl, ./watchlistRule,
// ./format), which plain Node ESM resolution can't do on its own.
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

// Dynamic import, not a static one — static imports are resolved during
// linking, before this file's own top-level code (including the
// register() call above) ever runs, so a static import here would resolve
// with plain Node ESM rules and fail the same way a static import of a
// cron route does in this project's other loader-hook-based tests (see
// verify_cron_time_budget.mjs).
const { buildDashboardSummary } = await import("../src/lib/dashboardSummary.ts");

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
function assert(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}

function card(id, overrides = {}) {
  return {
    id,
    name: `カード${id}`,
    current_price: 1000,
    pct_vs_avg30: null,
    data_quality: "real",
    source_url: `https://example.invalid/${id}`,
    updated_at: "2026-09-13T00:00:00.000Z",
    judgment: null,
    record_status: null,
    ...overrides,
  };
}
function txn(cardId, type, quantity, pricePerUnit, date) {
  return {
    id: `t-${cardId}-${date}-${type}`,
    user_id: "u1",
    card_id: cardId,
    type,
    quantity,
    price_per_unit: pricePerUnit,
    transaction_date: date,
    note: null,
    created_at: `${date}T00:00:00.000Z`,
  };
}
function watchItem(id, cardId, rule) {
  return { id, user_id: "u1", card_id: cardId, alert_rule: rule, last_triggered_at: null };
}

// Scenario 1: brand-new user, no transactions, no watchlist — this is the
// literal first thing a new subscriber sees, so it must read as an
// invitation, not an error.
{
  const s = buildDashboardSummary([], [], []);
  assert(s.hasNothing === true, "S1: hasNothing is true for a brand-new user");
  assertEqual(s.currentValue, 0, "S1: currentValue is 0");
  assertEqual(s.triggeredItems, [], "S1: no triggered items");
  assertEqual(s.gainers, [], "S1: no gainers");
}

// Scenario 2: a realistic full login session — the actual "why did I open
// this app today" case this feature exists for. One user holds two cards
// (c1 up, c2 down since purchase), watches a third (c3) whose 30-day-average
// condition has now tripped, and also watches a fourth (c4) that is NOT
// auto-tracked (data_quality 'partial', no source_url) — testing all four
// summary sections together in one coherent scenario, not in isolation.
{
  const cards = [
    card("c1", { current_price: 1200, pct_vs_avg30: 25 }), // bought at 1000, now 1200 — up
    card("c2", { current_price: 700, pct_vs_avg30: -22 }), // bought at 1000, now 700 — down
    card("c3", { current_price: 500, pct_vs_avg30: -18 }), // watched, condition: pct_vs_avg30 <= -15
    card("c4", { data_quality: "partial", source_url: null, current_price: 300, pct_vs_avg30: null }), // untracked
  ];
  const transactions = [
    txn("c1", "buy", 2, 1000, "2026-08-01"),
    txn("c2", "buy", 1, 1000, "2026-08-01"),
  ];
  const watchlistItems = [
    watchItem("w1", "c3", { type: "pct_vs_avg30", op: "lte", value: -15 }), // TRIGGERED
    watchItem("w2", "c4", { type: "price", op: "lte", value: 100 }), // NOT triggered (300 > 100)
  ];

  const s = buildDashboardSummary(transactions, watchlistItems, cards);

  assert(s.hasNothing === false, "S2: hasNothing is false — this user has real activity");
  assertEqual(s.holdingsCount, 2, "S2: 2 distinct held cards (c1, c2)");
  // currentValue = c1(1200*2) + c2(700*1) = 2400 + 700 = 3100
  assertEqual(s.currentValue, 3100, "S2: currentValue sums current_price*quantity across holdings");
  // costBasisTotal = 1000*2 + 1000*1 = 3000; unrealizedPnl = 3100 - 3000 = 100
  assertEqual(s.unrealizedPnl, 100, "S2: unrealizedPnl reflects the real gain on c1 net of the loss on c2");
  assertEqual(s.realizedPnl, 0, "S2: no sells yet, so realizedPnl is 0");
  assertEqual(s.totalPnl, 100, "S2: totalPnl = unrealized + realized");

  assertEqual(s.triggeredItems.length, 1, "S2: exactly one watchlist item is currently triggered");
  assertEqual(s.triggeredItems[0].item.id, "w1", "S2: the triggered item is w1 (c3), not w2 (c4, condition not met)");
  assertEqual(s.triggeredItems[0].card.id, "c3", "S2: the triggered item's resolved card is c3");

  // Gainers/losers are scoped to c1/c2/c3 (held or watched AND has a
  // pct_vs_avg30) — c4 is excluded (null pct_vs_avg30, not auto-tracked).
  // Also filtered to their own sign (self-review, 2026-09-13, found while
  // rendering the full dashboard together for the first time): c3 at -18%
  // must NEVER appear under "📈 値上がり中" just for being the least-
  // negative of a small set — only c1 (the one genuinely-positive card) is
  // a gainer here, and both negative cards (c2, c3) are losers.
  assertEqual(s.gainers.map((c) => c.id), ["c1"], "S2: gainers contains ONLY the genuinely-positive card (c1, +25%) — c3 (-18%) is a loser, not a lesser gainer");
  assertEqual(s.losers.map((c) => c.id), ["c2", "c3"], "S2: losers contains both negative cards, sorted ascending (-22, -18)");

  assertEqual(s.untrackedCount, 1, "S2: exactly one relevant card (c4) is not auto-tracked");
}

// Scenario 3: gainers/losers must be capped at 3 and must never include a
// card with a null pct_vs_avg30 via some accidental 0-fallback.
{
  const cards = [
    card("g1", { pct_vs_avg30: 50 }),
    card("g2", { pct_vs_avg30: 40 }),
    card("g3", { pct_vs_avg30: 30 }),
    card("g4", { pct_vs_avg30: 20 }),
    card("untracked", { pct_vs_avg30: null }),
  ];
  const watchlistItems = cards.map((c, i) => watchItem(`w${i}`, c.id, { type: "price", op: "gte", value: 0 }));
  const s = buildDashboardSummary([], watchlistItems, cards);
  assertEqual(s.gainers.length, 3, "S3: gainers is capped at 3 even with 4 tracked candidates");
  assertEqual(s.gainers.map((c) => c.id), ["g1", "g2", "g3"], "S3: gainers is the top 3 by pct_vs_avg30");
  assert(!s.gainers.some((c) => c.id === "untracked"), "S3: the null-pct_vs_avg30 card never appears among gainers");
}

// Scenario 3b (self-review, 2026-09-13 — found while rendering the full
// dashboard together with realistic data for the first time, not caught by
// any of this file's earlier per-section scenarios): with very few tracked
// cards, ALL of them negative, gainers must be EMPTY — not "the 3 least-bad
// losses," which would render under a "📈 値上がり中" header while every
// listed card is actually down. Symmetric case for losers when all cards
// are positive.
{
  const cards = [card("d1", { pct_vs_avg30: -5 }), card("d2", { pct_vs_avg30: -30 })];
  const watchlistItems = cards.map((c, i) => watchItem(`w${i}`, c.id, { type: "price", op: "gte", value: 0 }));
  const s = buildDashboardSummary([], watchlistItems, cards);
  assertEqual(s.gainers, [], "S3b: gainers is empty when every tracked card is actually down, never the 'least negative' ones");
  assertEqual(s.losers.map((c) => c.id), ["d2", "d1"], "S3b: losers still correctly lists both, sorted most-negative first");
}
{
  const cards = [card("u1", { pct_vs_avg30: 5 }), card("u2", { pct_vs_avg30: 30 })];
  const watchlistItems = cards.map((c, i) => watchItem(`w${i}`, c.id, { type: "price", op: "gte", value: 0 }));
  const s = buildDashboardSummary([], watchlistItems, cards);
  assertEqual(s.losers, [], "S3b: symmetric case — losers is empty when every tracked card is actually up");
  assertEqual(s.gainers.map((c) => c.id), ["u2", "u1"], "S3b: gainers still correctly lists both, sorted most-positive first");
}

// Scenario 4 (self-review, 2026-09-13 — found while re-checking this
// feature without Codex's parallel verification): a user who bought and
// later fully sold everything, with no active watchlist items, must NOT
// be shown the brand-new-user "hasNothing" empty state — they have real
// trading history (a nonzero realizedPnl), even though pnl.holdings.length
// is 0. hasNothing used to check holdings.length instead of
// transactions.length, which collapsed these two very different users
// into the same "start here" invitation.
{
  const cards = [card("c1", { current_price: 1500 })];
  const transactions = [
    txn("c1", "buy", 2, 1000, "2026-01-01"),
    txn("c1", "sell", 2, 1200, "2026-02-01"),
  ];
  const s = buildDashboardSummary(transactions, [], cards);
  assertEqual(s.hasNothing, false, "S4: a fully-sold-out user with real trading history is NOT the empty state");
  assertEqual(s.holdingsCount, 0, "S4: holdingsCount is correctly 0 (nothing currently held)");
  assertEqual(s.realizedPnl, 400, "S4: realizedPnl correctly reflects the completed round-trip (2*(1200-1000))");
}

// Scenario 5 (Codex independent review, 2026-09-13 — reproduction: a held
// card with current_price:null showed 保有評価額¥0・含み損益-原価全額,
// a confident-looking 100% loss that was actually just "price unknown").
// One held card has a real price and a real gain; a second held card's
// current_price is null. currentValue/unrealizedPnl must reflect ONLY the
// priced card, and unpricedHoldingsCount must flag the other one — never
// silently folding it in as a fabricated ¥0.
{
  const cards = [
    card("priced", { current_price: 1200 }), // bought at 1000 — +200 gain
    card("unpriced", { current_price: null }),
  ];
  const transactions = [
    txn("priced", "buy", 1, 1000, "2026-01-01"),
    txn("unpriced", "buy", 1, 10000, "2026-01-01"),
  ];
  const s = buildDashboardSummary(transactions, [], cards);
  assertEqual(s.currentValue, 1200, "S5: currentValue counts only the priced holding (1200), not a fabricated 0 for the unpriced one");
  assertEqual(s.unrealizedPnl, 200, "S5: unrealizedPnl is +200 (the priced holding's real gain), NOT -10000 from charging the unpriced holding's cost basis against a 0 value");
  assertEqual(s.unpricedHoldingsCount, 1, "S5: exactly 1 held card is flagged as unpriced");
  assertEqual(s.holdingsCount, 2, "S5: holdingsCount still counts both held cards (this is a display-total concern, not a holdings-count concern)");
}

// Scenario 6: a card's current_price is a genuine ¥0 — must be treated as a
// KNOWN value (unpricedHoldingsCount 0), distinct from null, per Codex's
// explicit callout ("実測0円は0円で正しいがnullとは区別が必要").
{
  const cards = [card("c1", { current_price: 0 })];
  const transactions = [txn("c1", "buy", 5, 100, "2026-01-01")];
  const s = buildDashboardSummary(transactions, [], cards);
  assertEqual(s.currentValue, 0, "S6: currentValue is 0 (a real value)");
  assertEqual(s.unrealizedPnl, -500, "S6: unrealizedPnl is a real -500 loss, computed against the known 0 price");
  assertEqual(s.unpricedHoldingsCount, 0, "S6: a genuine ¥0 price is NOT counted as unpriced");
}

// Scenario 7 (Codex's explicit "全件欠測" case): every held card is
// unpriced, not just one among several. currentValue/unrealizedPnl must
// both read 0 without crashing, unpricedHoldingsCount must cover every
// holding, and hasNothing must stay false (this user has real transactions,
// unlike the brand-new-user empty state from Scenario 1).
{
  const cards = [card("c1", { current_price: null }), card("c2", { current_price: null })];
  const transactions = [
    txn("c1", "buy", 1, 1000, "2026-01-01"),
    txn("c2", "buy", 2, 2000, "2026-01-01"),
  ];
  const s = buildDashboardSummary(transactions, [], cards);
  assertEqual(s.currentValue, 0, "S7: currentValue is 0 when every holding is unpriced (not a crash, not a fabricated total)");
  assertEqual(s.unrealizedPnl, 0, "S7: unrealizedPnl is 0, not a confident total loss of the full cost basis");
  assertEqual(s.unpricedHoldingsCount, 2, "S7: both held cards are flagged as unpriced");
  assertEqual(s.hasNothing, false, "S7: this user has real transactions, so it's not the brand-new-user empty state");
}

// Scenario 8 (Codex UX review, 2026-09-13, cycle 2 — dashboard never showed
// price freshness): a held, auto-tracked card whose updated_at is 3 days
// old (well past the 36h threshold) must be flagged as staleCard, with the
// `now` parameter injected for a deterministic result rather than reading
// the real clock.
{
  const now = new Date("2026-09-13T00:00:00.000Z");
  const cards = [card("c1", { updated_at: "2026-09-10T00:00:00.000Z" })]; // 3 days old
  const transactions = [txn("c1", "buy", 1, 1000, "2026-01-01")];
  const s = buildDashboardSummary(transactions, [], cards, now);
  assertEqual(
    s.staleCard,
    { name: "カードc1", updatedAt: "2026-09-10T00:00:00.000Z" },
    "S8: a held auto-tracked card 3 days stale is flagged as staleCard"
  );
}

// Scenario 9: a held card updated 2 hours ago (well within the 36h
// threshold) must NOT be flagged — staleCard stays null when everything is
// fresh, so the dashboard doesn't show an alarm for normal operation.
{
  const now = new Date("2026-09-13T12:00:00.000Z");
  const cards = [card("c1", { updated_at: "2026-09-13T10:00:00.000Z" })]; // 2 hours old
  const transactions = [txn("c1", "buy", 1, 1000, "2026-01-01")];
  const s = buildDashboardSummary(transactions, [], cards, now);
  assertEqual(s.staleCard, null, "S9: a card updated 2 hours ago is not flagged as stale");
}

// Scenario 10: a held card that is NOT auto-tracked (data_quality 'flat')
// with a very old updated_at must NOT be flagged — such a card is expected
// to never update (already labeled "not auto-updated" elsewhere), so
// treating its age as a problem would contradict that label and falsely
// alarm the user over normal, by-design behavior.
{
  const now = new Date("2026-09-13T00:00:00.000Z");
  const cards = [
    card("c1", { updated_at: "2026-01-01T00:00:00.000Z", data_quality: "flat", source_url: null }),
  ];
  const transactions = [txn("c1", "buy", 1, 1000, "2026-01-01")];
  const s = buildDashboardSummary(transactions, [], cards, now);
  assertEqual(s.staleCard, null, "S10: a not-auto-tracked (flat) card is never flagged as stale, regardless of age");
}

// Scenario 11: two held cards past the threshold — the MOST stale one (not
// just the first found) must be reported.
{
  const now = new Date("2026-09-13T00:00:00.000Z");
  const cards = [
    card("c1", { name: "新しい方", updated_at: "2026-09-11T00:00:00.000Z" }), // 2 days old
    card("c2", { name: "古い方", updated_at: "2026-09-05T00:00:00.000Z" }), // 8 days old
  ];
  const transactions = [
    txn("c1", "buy", 1, 1000, "2026-01-01"),
    txn("c2", "buy", 1, 1000, "2026-01-01"),
  ];
  const s = buildDashboardSummary(transactions, [], cards, now);
  assertEqual(s.staleCard?.name, "古い方", "S11: the MOST stale card is reported, not just the first one found");
}

// Scenario 12 (differentiation feature, 2026-09-13 — "あなたのポートフォリオ
// vs 市場平均"): end-to-end wiring through buildDashboardSummary itself,
// not just marketBenchmark.ts's own unit tests — confirms the real
// cardById map built inside buildDashboardSummary (not a hand-copied one)
// is what actually reaches computeMarketBenchmark().
{
  const cards = [card("c1", { current_price: 1200, pct_vs_avg30: 20 })]; // bought at 1000
  const transactions = [txn("c1", "buy", 1, 1000, "2026-01-01")];
  const catalogPctValues = [0, 10, -10, 20]; // avg = 5
  const s = buildDashboardSummary(transactions, [], cards, new Date(), catalogPctValues);
  assertEqual(s.benchmark.portfolioAvgPct, 20, "S12: portfolioAvgPct reflects the one held, tracked card");
  assertEqual(s.benchmark.marketAvgPct, 5, "S12: marketAvgPct is the mean of the supplied catalog sample");
  assertEqual(s.benchmark.excludedHoldingsCount, 0, "S12: the one holding contributed, nothing excluded");
}

// Scenario 13: catalogPctValues omitted entirely (the default []) — every
// pre-existing call site/test that doesn't pass it must keep working,
// with the benchmark simply reporting "nothing to compare" rather than
// throwing or requiring every caller to be updated.
{
  const cards = [card("c1", { current_price: 1200, pct_vs_avg30: 20 })];
  const transactions = [txn("c1", "buy", 1, 1000, "2026-01-01")];
  const s = buildDashboardSummary(transactions, [], cards);
  assertEqual(s.benchmark.marketAvgPct, null, "S13: omitting catalogPctValues defaults to an empty sample -> null, not a crash");
  assertEqual(s.benchmark.portfolioAvgPct, 20, "S13: the portfolio side still computes normally regardless of the catalog side");
}

// Scenario 14 (differentiation feature #4, 2026-09-13 — "利益確定を検討して
// もよいかもしれないカード"): end-to-end wiring through buildDashboardSummary,
// confirming the real cardById map (built inside the function) reaches
// findProfitTakingCandidates() correctly.
{
  const cards = [
    card("gain-and-overvalued", { current_price: 1500, judgment: "割高" }), // bought at 1000 -> flagged
    card("gain-but-fair", { current_price: 1500, judgment: "適正" }), // gain but not overvalued -> not flagged
  ];
  const transactions = [
    txn("gain-and-overvalued", "buy", 1, 1000, "2026-01-01"),
    txn("gain-but-fair", "buy", 1, 1000, "2026-01-01"),
  ];
  const s = buildDashboardSummary(transactions, [], cards);
  assertEqual(
    s.profitTakingCandidates.map((c) => c.cardId),
    ["gain-and-overvalued"],
    "S14: only the held card that is BOTH gaining AND judgment 割高 is flagged, via the real buildDashboardSummary wiring"
  );
}

// Scenario 15 (differentiation feature #6, 2026-09-13 — "史上最高値・最安値
// 更新"): end-to-end wiring through buildDashboardSummary, confirming
// findPriceRecordAlerts() runs against the real relevantCards computed
// inside the function (held + watched, in that combined order) and that a
// card with no record_status set is correctly excluded.
{
  const cards = [
    card("held-high", { record_status: "high" }),
    card("watched-low", { record_status: "low" }),
    card("no-record", { record_status: null }),
  ];
  const transactions = [txn("held-high", "buy", 1, 1000, "2026-01-01")];
  const watchlistItems = [watchItem("w1", "watched-low", { type: "price", op: "gte", value: 0 })];
  const s = buildDashboardSummary(transactions, watchlistItems, cards);
  assertEqual(
    s.priceRecords,
    [
      { cardId: "held-high", cardName: "カードheld-high", status: "high" },
      { cardId: "watched-low", cardName: "カードwatched-low", status: "low" },
    ],
    "S15: priceRecords lists both the held and watched cards with a set record_status, excluding the one with none"
  );
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
