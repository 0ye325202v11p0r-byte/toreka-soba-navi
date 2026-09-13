// Regression test for src/lib/taxReport.ts's buildAnnualRealizedReport() —
// "年間実現損益レポート" (2026-09-13, differentiation feature: only an app
// that already tracks a user's own transaction history can help with this).
//
// Run: node --experimental-strip-types migration/verify_tax_report.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

const { buildAnnualRealizedReport } = await import("../src/lib/taxReport.ts");

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

function event(cardId, date, quantity, gain) {
  return { cardId, date, quantity, gain };
}

// T1: no realized events at all (e.g. a brand-new user, or one who has
// never sold) -> an empty report, not a crash.
assertEqual(buildAnnualRealizedReport([]), [], "T1: no events -> empty report");

// T2: multiple sells within the same year/month must be summed into one
// monthly total, not listed as separate entries.
{
  const events = [event("c1", "2026-03-05", 1, 500), event("c2", "2026-03-20", 1, 300)];
  const report = buildAnnualRealizedReport(events);
  assertEqual(report, [{ year: "2026", totalGain: 800, months: [{ month: "03", gain: 800 }] }], "T2: same-month sells are summed into one monthly entry");
}

// T3: sells across different months in the same year produce separate
// month entries, sorted ascending by month, with a correct year total.
{
  const events = [event("c1", "2026-01-10", 1, 100), event("c1", "2026-06-10", 1, -50), event("c1", "2026-03-10", 1, 200)];
  const report = buildAnnualRealizedReport(events);
  assertEqual(
    report,
    [
      {
        year: "2026",
        totalGain: 250,
        months: [
          { month: "01", gain: 100 },
          { month: "03", gain: 200 },
          { month: "06", gain: -50 },
        ],
      },
    ],
    "T3: months sorted ascending regardless of input order, year total sums all of them"
  );
}

// T4: sells spanning multiple years produce separate year entries, sorted
// MOST RECENT YEAR FIRST (a user preparing this year's tax filing cares
// about this year, not scrolling past every prior year to find it).
{
  const events = [event("c1", "2024-05-01", 1, 100), event("c1", "2026-05-01", 1, 300), event("c1", "2025-05-01", 1, 200)];
  const report = buildAnnualRealizedReport(events);
  assertEqual(report.map((y) => y.year), ["2026", "2025", "2024"], "T4: years are sorted most-recent-first");
  assertEqual(report[0].totalGain, 300, "T4: 2026's total reflects only its own event");
}

// T5: a realized LOSS (negative gain) must flow through correctly, not be
// clamped to 0 or dropped — a tax report that hid losses would be actively
// harmful (losses can offset gains).
{
  const events = [event("c1", "2026-07-01", 1, -1000)];
  const report = buildAnnualRealizedReport(events);
  assertEqual(report[0].totalGain, -1000, "T5: a realized loss is reported as a real negative number, not clamped or dropped");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
