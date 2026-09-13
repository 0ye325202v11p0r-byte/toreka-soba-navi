/**
 * Pure helpers for the check-watchlist cron's push-notification step (added
 * 2026-09-13). Split out from the route so the two easy-to-get-backwards
 * pieces — "is this a NEW trigger, not a repeat of an already-known one"
 * and "what does the notification say" — are independently testable
 * without mocking Supabase or web-push.
 */

// A condition is worth pushing about exactly on the false->true transition
// — not every run it happens to still be true (that would mean a daily
// push for as long as the condition holds, which is spam, not an alert),
// and never while it's false. See watchlist_items.condition_was_met's
// schema.sql comment for why last_triggered_at alone can't answer this.
export function isNewlyTriggered(previouslyMet: boolean, currentlyMet: boolean): boolean {
  return currentlyMet && !previouslyMet;
}

export interface WatchlistPushPayload {
  title: string;
  body: string;
  url: string;
}

export function buildWatchlistPushPayload(cardName: string, cardId: string): WatchlistPushPayload {
  return {
    title: "トレカ相場ナビ",
    body: `${cardName}が設定した条件を満たしました。`,
    url: `/cards/${cardId}`,
  };
}
