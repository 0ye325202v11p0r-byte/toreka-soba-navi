import type { RealizedEvent } from "./types";

/**
 * "年間実現損益レポート" (added 2026-09-13, differentiation feature) —
 * groups the FIFO engine's per-sell realizedEvents by year and month, for
 * the one thing a plain price-checking site structurally cannot help
 * with: preparing to report trading-card gains at tax time. A hobbyist
 * currently has to reconstruct this by hand from memory or spreadsheets;
 * this app already has the full FIFO cost-basis history.
 *
 * Deliberately NOT tax advice: this is a computational aid (accurate
 * arithmetic over the user's own recorded transactions), not a judgment
 * about which tax category applies, what's exempt, or what's owed — the
 * caller-facing text must say so explicitly. Kept pure/framework-free like
 * pnl.ts itself, since it's just a different grouping of the same numbers.
 */
export interface MonthlyRealized {
  month: string; // "01".."12"
  gain: number;
}

export interface YearlyRealized {
  year: string; // "2026"
  totalGain: number;
  months: MonthlyRealized[]; // only months with at least one sell, ascending
}

export function buildAnnualRealizedReport(events: RealizedEvent[]): YearlyRealized[] {
  const byYear = new Map<string, Map<string, number>>();
  for (const e of events) {
    const year = e.date.slice(0, 4);
    const month = e.date.slice(5, 7);
    const months = byYear.get(year) ?? new Map<string, number>();
    months.set(month, (months.get(month) ?? 0) + e.gain);
    byYear.set(year, months);
  }
  return [...byYear.entries()]
    .sort((a, b) => b[0].localeCompare(a[0])) // most recent year first
    .map(([year, months]) => {
      const monthList = [...months.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, gain]) => ({ month, gain }));
      return {
        year,
        totalGain: monthList.reduce((sum, m) => sum + m.gain, 0),
        months: monthList,
      };
    });
}
