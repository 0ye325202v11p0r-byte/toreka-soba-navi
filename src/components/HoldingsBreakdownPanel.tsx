import { yen } from "@/lib/format";
import { computeConcentration, type BreakdownGroup } from "@/lib/holdingsBreakdown";

// Two side-by-side breakdown boxes (レアリティ別／弾別), same visual weight
// as the dashboard's StatBox/MoverBox — see dashboard/page.tsx. A pure
// presentational component: all grouping/sorting logic lives in
// holdingsBreakdown.ts so it stays independently testable.
export default function HoldingsBreakdownPanel({
  byRarity,
  bySet,
}: {
  byRarity: BreakdownGroup[];
  bySet: BreakdownGroup[];
}) {
  const concentration = computeConcentration(bySet);
  return (
    <div className="mb-6">
      {concentration?.isConcentrated && (
        <p className="mb-3 text-xs text-warn">
          ⚠️ 保有評価額の{concentration.topSharePct}%が「{concentration.topLabel}」に集中しています。特定の弾の値動きに損益が左右されやすい状態です。
        </p>
      )}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <BreakdownBox title="レアリティ別内訳" groups={byRarity} />
        <BreakdownBox title="弾別内訳" groups={bySet} />
      </div>
    </div>
  );
}

function BreakdownBox({ title, groups }: { title: string; groups: BreakdownGroup[] }) {
  const total = groups.reduce((sum, g) => sum + g.value, 0);
  return (
    <div className="rounded-lg border border-border bg-bg-elevated p-3">
      <div className="mb-2 text-xs font-semibold text-ink-muted">{title}</div>
      {groups.length === 0 ? (
        <p className="text-sm text-ink-faint">保有カードがありません。</p>
      ) : (
        <div className="space-y-1.5">
          {groups.map((g) => (
            <div key={g.label} className="flex items-center justify-between text-sm">
              <span className="truncate">
                {g.label}
                <span className="ml-1 text-xs text-ink-faint">
                  （{g.cardCount}種・{g.quantity}枚）
                </span>
              </span>
              <span className="ml-2 shrink-0 font-mono">
                {yen(g.value)}
                {g.hasUnknownValue && <span className="ml-1 text-xs text-ink-faint">+価格未取得あり</span>}
                {total > 0 && !g.hasUnknownValue && (
                  <span className="ml-1 text-xs text-ink-faint">{Math.round((g.value / total) * 100)}%</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
