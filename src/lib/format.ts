import type { Judgment } from "./types";

export function yen(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return "¥" + Math.round(value).toLocaleString("ja-JP");
}

export function pct(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
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
      return { label: "ランキング由来", cls: "bg-accent-soft text-accent-strong" };
    default:
      return { label: "参考値", cls: "bg-warn-soft text-warn" };
  }
}
