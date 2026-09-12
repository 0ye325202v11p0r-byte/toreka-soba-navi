// Supabase/PostgREST errors are typically plain objects (code/message/
// details/hint), not `instanceof Error` — `String(err)` on one of those
// prints the unhelpful "[object Object]" instead of the actual message.
// Extracted 2026-09-12 from three near-identical copies (refresh-prices,
// check-watchlist, refresh-yuyutei-prices route handlers) into one shared
// place — found while looking for other easy wins after the appSettings.ts
// review; kept as a small pure function so it stays trivially safe to
// change in one spot rather than three.
export function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string") {
    return (err as { message: string }).message;
  }
  return String(err);
}
