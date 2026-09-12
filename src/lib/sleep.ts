// Extracted 2026-09-12 from two identical copies (refresh-prices,
// refresh-yuyutei-prices route handlers) — both pace their external
// per-request fetch loops with this between iterations.
export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
