// "予算" on a request: either end may be blank. Shown as ¥A〜¥B, ¥A〜 or
// 〜¥B (previously a blank lower end printed as 「〜 〜 ¥10,000」).
export function formatBudget(min: number | null, max: number | null): string | null {
  const yen = (n: number) => `¥${n.toLocaleString()}`;
  if (min && max) return `${yen(min)}〜${yen(max)}`;
  if (min) return `${yen(min)}〜`;
  if (max) return `〜${yen(max)}`;
  return null;
}
