// Regression test for src/lib/yuyuteiParser.ts's parseSetPage() — the HTML
// parsing logic shared by migration/scrape_yuyutei.mjs (one-time catalog
// insert) and src/app/api/cron/refresh-yuyutei-prices/route.ts (daily price
// tracking, added 2026-09-12). Extracted from scrape_yuyutei.mjs into its
// own module specifically so both callers exercise the identical regex —
// this test imports that REAL module, not a reimplementation.
//
// The fixture (migration/_test_fixtures/yuyutei_op01_sample.html) is a
// real ~2.8KB excerpt saved from a live fetch of
// https://yuyu-tei.jp/sell/opc/s/op01 on 2026-09-12 (one rarity header +
// two card listings), not hand-written markup — so this test fails loudly
// if yuyu-tei's actual page structure ever drifts from what the regex
// expects, rather than only ever validating against markup this project
// invented itself.
//
// Run: `node --experimental-strip-types migration/verify_yuyutei_parser.mjs`
import { readFileSync } from "fs";
import { parseSetPage, RARITY_MAP, ALL_YUYUTEI_SETS } from "../src/lib/yuyuteiParser.ts";

function assertEqual(actual, expected, label) {
  const ok = actual === expected;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  if (!ok) process.exitCode = 1;
}

const html = readFileSync(new URL("./_test_fixtures/yuyutei_op01_sample.html", import.meta.url), "utf8");
const { setName, cards } = parseSetPage(html);

assertEqual(setName, "ROMANCE DAWN", "T1 set name parsed from <title>");
assertEqual(cards.length, 2, "T2 both card listings under the one rarity header are found");

assertEqual(cards[0].cardNumber, "OP01-120", "T3 card 1 number");
assertEqual(cards[0].name, "シャンクス(パラレル)", "T4 card 1 name (decoded, trimmed)");
assertEqual(cards[0].price, 3980, "T5 card 1 price (comma stripped, parsed as number)");
assertEqual(cards[0].rarityLabel, "P-SEC", "T6 card 1 rarity label (from the preceding header)");
assertEqual(RARITY_MAP[cards[0].rarityLabel], "SECパラレル", "T7 card 1 rarity label maps to this project's rarity string");
assertEqual(cards[0].url, "https://yuyu-tei.jp/sell/opc/card/op01/10151", "T8 card 1 url (used as the join key by the daily-tracking cron)");

assertEqual(cards[1].cardNumber, "OP01-120", "T9 card 2 number (same card, different print — kizu/刻印なし variant)");
assertEqual(cards[1].name, "シャンクス(パラレル)(スーパーパラレル)(刻印なし)", "T10 card 2 name");
assertEqual(cards[1].price, 148000, "T11 card 2 price");
assertEqual(cards[1].rarityLabel, "P-SEC", "T12 card 2 rarity label (still under the same header — no header reset between listings)");

// ALL_YUYUTEI_SETS: the daily cron fetches every set this project has ever
// scraped from yuyu-tei (migration/README.md: OP01-17, all ST starters,
// all EB extra boosters). A regression here (wrong count, or a stray
// duplicate) would silently under- or over-fetch every single day.
assertEqual(ALL_YUYUTEI_SETS.length, 57, "T13 total set count (17 OP + 36 ST + 4 EB)");
assertEqual(new Set(ALL_YUYUTEI_SETS).size, 57, "T14 no duplicate set slugs");
assertEqual(ALL_YUYUTEI_SETS.includes("op01"), true, "T15 includes op01");
assertEqual(ALL_YUYUTEI_SETS.includes("st36"), true, "T16 includes st36 (last starter deck)");
assertEqual(ALL_YUYUTEI_SETS.includes("eb04"), true, "T17 includes eb04 (last extra booster)");

console.log("\nAll yuyuteiParser.ts checks completed.");
