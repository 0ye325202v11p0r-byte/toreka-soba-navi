import { yen } from "@/lib/format";
import type { YearlyRealized } from "@/lib/taxReport";

// Native <details>/<summary> for per-year collapse — no client-side state
// needed, so this stays a plain server-renderable component like
// PortfolioValueChart/HoldingsBreakdownPanel's non-interactive siblings.
export default function AnnualRealizedReport({ years }: { years: YearlyRealized[] }) {
  if (years.length === 0) return null;
  return (
    <div className="mb-6 rounded-lg border border-border bg-bg-elevated p-4">
      <h2 className="mb-1 text-sm font-bold text-ink-muted">📅 年間実現損益レポート</h2>
      <p className="mb-3 text-xs text-ink-faint">
        確定申告の参考情報です（実現損益の集計であり、税務上の判断ではありません）。所得区分や申告要否はご自身の状況により異なるため、税理士・税務署にご確認ください。
      </p>
      <div className="space-y-2">
        {years.map((y) => (
          <details key={y.year} open={years.indexOf(y) === 0}>
            <summary className="cursor-pointer text-sm font-semibold">
              {y.year}年：合計{" "}
              <span className={y.totalGain >= 0 ? "text-good" : "text-warn"}>{yen(y.totalGain)}</span>
            </summary>
            <div className="mt-1 space-y-0.5 pl-4 text-xs text-ink-muted">
              {y.months.map((m) => (
                <div key={m.month} className="flex justify-between">
                  <span>{Number(m.month)}月</span>
                  <span className={m.gain >= 0 ? "text-good" : "text-warn"}>{yen(m.gain)}</span>
                </div>
              ))}
            </div>
          </details>
        ))}
      </div>
    </div>
  );
}
