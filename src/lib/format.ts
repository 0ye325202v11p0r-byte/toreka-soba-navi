import type { Judgment } from "./types";

// PostgREST can return Postgres `numeric` columns as JSON strings (to avoid
// float precision loss), so every value coming from Supabase is typed
// `number` here but must be coerced defensively before calling
// Number.prototype methods like toFixed().
export function yen(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  return "¥" + Math.round(n).toLocaleString("ja-JP");
}

export function pct(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(1)}%`;
}

export function judgmentClasses(judgment: Judgment | null | undefined): string {
  switch (judgment) {
    case "割安":
      return "bg-good-soft text-good";
    case "割高":
      return "bg-warn-soft text-warn";
    default:
      return "bg-accent-soft text-accent-strong";
  }
}

export function dataQualityLabel(quality: string | null | undefined): {
  label: string;
  cls: string;
} {
  switch (quality) {
    case "real":
      return { label: "実測データ", cls: "bg-good-soft text-good" };
    case "partial":
      return { label: "1店舗の参考価格", cls: "bg-accent-soft text-accent-strong" };
    default:
      return { label: "参考値", cls: "bg-warn-soft text-warn" };
  }
}
