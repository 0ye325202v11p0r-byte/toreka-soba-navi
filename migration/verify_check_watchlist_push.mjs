// Regression test for the Web Push notification step added to
// src/app/api/cron/check-watchlist/route.ts (2026-09-13) — kept in its own
// process/file, separate from verify_check_watchlist.mjs, because route.ts
// reads NEXT_PUBLIC_VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY once at module load
// time; a single process can only ever exercise one of "configured" / "not
// configured" (verify_check_watchlist.mjs covers "not configured" — this
// file covers "configured, actually sends notifications").
//
// Imports the REAL GET() handler (not a hand-copied reproduction), with the
// Supabase client AND "web-push" both mocked via the shared loader hook —
// no real network or database calls, no real push service contacted.
//
// Run: node --experimental-strip-types migration/verify_check_watchlist_push.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

process.env.CRON_SECRET = "test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
process.env.ADMIN_EMAIL = "admin@example.invalid";

function makeMocks({
  allItems = [],
  allCards = [],
  subscriptionsByUser = {},
  pushSubscriptionsTableMissing = false,
  sendNotificationImpl = async () => {},
}) {
  const calls = { updates: [], deletedSubscriptionIds: [], sentTo: [] };
  const supabaseMock = {
    from(table) {
      if (table === "watchlist_items") {
        return {
          select: () => ({
            order: () => ({
              range: (from, to) => ({
                abortSignal: () => (async () => ({ data: allItems.slice(from, to + 1), error: null }))(),
              }),
            }),
          }),
          update: (payload) => {
            const built = {
              eq(_col, id) {
                calls.updates.push({ id, payload });
                this._id = id;
                return this;
              },
              abortSignal: () => (async () => ({ error: null }))(),
            };
            return built;
          },
        };
      }
      if (table === "cards") {
        return {
          select: () => ({
            in: (_col, ids) => ({
              abortSignal: () =>
                (async () => {
                  const set = new Set(ids);
                  return { data: allCards.filter((c) => set.has(c.id)), error: null };
                })(),
            }),
          }),
        };
      }
      if (table === "push_subscriptions") {
        return {
          select: () => ({
            in: (_col, userIds) => ({
              abortSignal: () =>
                (async () => {
                  if (pushSubscriptionsTableMissing) {
                    return { data: null, error: { code: "42P01", message: "relation does not exist" } };
                  }
                  const rows = [];
                  for (const uid of userIds) {
                    for (const sub of subscriptionsByUser[uid] ?? []) rows.push({ user_id: uid, ...sub });
                  }
                  return { data: rows, error: null };
                })(),
            }),
          }),
          delete: () => ({
            in: (_col, ids) => {
              calls.deletedSubscriptionIds.push(...ids);
              return Promise.resolve({ error: null });
            },
          }),
        };
      }
      throw new Error(`verify_check_watchlist_push: unexpected table "${table}"`);
    },
  };
  const webPushMock = {
    sendNotification: async (subscription, payload) => {
      calls.sentTo.push({ endpoint: subscription.endpoint, payload: JSON.parse(payload) });
      return sendNotificationImpl(subscription, payload);
    },
  };
  return { supabaseMock, webPushMock, calls };
}

const { GET } = await import("../src/app/api/cron/check-watchlist/route.ts");

async function run(label, opts) {
  const { supabaseMock, webPushMock, calls } = makeMocks(opts);
  globalThis.__SUPABASE_MOCK__ = supabaseMock;
  globalThis.__WEB_PUSH_MOCK__ = webPushMock;
  const request = new Request("http://localhost/api/cron/check-watchlist", {
    headers: { Authorization: "Bearer test-secret" },
  });
  const res = await GET(request);
  const body = await res.json();
  console.log(`\n--- ${label} ---`);
  console.log(`body=${JSON.stringify(body)} calls=${JSON.stringify(calls)}`);
  return { body, calls };
}

let pass = 0;
let fail = 0;
function assert(cond, label) {
  if (cond) pass++;
  else {
    fail++;
    console.error(`FAIL: ${label}`);
  }
}
function assertEqual(actual, expected, label) {
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

const cardMet = [{ id: "c1", name: "テストカード", pct_vs_avg30: null, current_price: 100 }];

// T1: a newly-triggered item (condition_was_met: false, now met) sends a
// push to the user's one subscription, and the update payload marks
// condition_was_met: true for next time.
{
  const allItems = [
    { id: "w1", user_id: "u1", card_id: "c1", condition_was_met: false, alert_rule: { type: "price", op: "lte", value: 999 } },
  ];
  const { body, calls } = await run("newly triggered item sends a push", {
    allItems,
    allCards: cardMet,
    subscriptionsByUser: { u1: [{ endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }] },
  });
  assertEqual(body.push.newlyTriggered, 1, "T1: exactly one item is newly triggered");
  assertEqual(body.push.sent, 1, "T1: exactly one push was sent");
  assertEqual(calls.sentTo.length, 1, "T1: sendNotification was actually called once");
  assert(calls.sentTo[0].payload.body.includes("テストカード"), "T1: the push payload names the specific card");
  const update = calls.updates.find((u) => u.id === "w1");
  assertEqual(update?.payload.condition_was_met, true, "T1: the DB update marks condition_was_met:true for next run's transition detection");
}

// T2: an item that was ALREADY met (condition_was_met: true) and is STILL
// met must NOT send a repeat push (not a new transition), even though
// last_triggered_at is still refreshed as before this feature existed.
{
  const allItems = [
    { id: "w1", user_id: "u1", card_id: "c1", condition_was_met: true, alert_rule: { type: "price", op: "lte", value: 999 } },
  ];
  const { body, calls } = await run("already-triggered item does not repeat-push", {
    allItems,
    allCards: cardMet,
    subscriptionsByUser: { u1: [{ endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }] },
  });
  assertEqual(body.push.newlyTriggered, 0, "T2: not counted as newly triggered");
  assertEqual(body.push.sent, 0, "T2: no push sent for a repeat");
  const update = calls.updates.find((u) => u.id === "w1");
  assert(update?.payload.last_triggered_at !== undefined, "T2: last_triggered_at is still refreshed (unchanged prior behavior)");
}

// T3: a condition that WAS met and is now NOT met must reset
// condition_was_met to false (so a future re-trigger is detected again),
// via its own update call distinct from the last_triggered_at path.
{
  const allItems = [
    { id: "w1", user_id: "u1", card_id: "c1", condition_was_met: true, alert_rule: { type: "price", op: "lte", value: 1 } }, // 100 > 1, not met
  ];
  const { body, calls } = await run("condition clearing resets condition_was_met", {
    allItems,
    allCards: cardMet,
    subscriptionsByUser: {},
  });
  assertEqual(body.push.newlyTriggered, 0, "T3: clearing a condition is not a trigger");
  const update = calls.updates.find((u) => u.id === "w1");
  assertEqual(update?.payload, { condition_was_met: false }, "T3: the reset update writes exactly condition_was_met:false, nothing else");
}

// T4: a not-met item that was ALSO not met before gets no update call at
// all — the common case (most watchlist items, most days) must stay as
// cheap as it was before this feature existed.
{
  const allItems = [
    { id: "w1", user_id: "u1", card_id: "c1", condition_was_met: false, alert_rule: { type: "price", op: "lte", value: 1 } },
  ];
  const { calls } = await run("still-not-met item gets zero update calls", { allItems, allCards: cardMet });
  assertEqual(calls.updates.length, 0, "T4: no DB write at all for the steady-state not-met case");
}

// T5: a newly-triggered user with NO push subscriptions at all — counted,
// but sends nothing, no crash.
{
  const allItems = [
    { id: "w1", user_id: "u-no-subs", card_id: "c1", condition_was_met: false, alert_rule: { type: "price", op: "lte", value: 999 } },
  ];
  const { body } = await run("newly triggered user with no subscriptions", {
    allItems,
    allCards: cardMet,
    subscriptionsByUser: {},
  });
  assertEqual(body.push.newlyTriggered, 1, "T5: still counted as newly triggered");
  assertEqual(body.push.sent, 0, "T5: nothing sent (no subscriptions to send to)");
  assertEqual(body.push.failed, 0, "T5: not counted as a failure either — there was simply nothing to attempt");
}

// T6: a stale subscription (push service returns 410 Gone) is deleted from
// push_subscriptions so it's never retried on a future trigger.
{
  const allItems = [
    { id: "w1", user_id: "u1", card_id: "c1", condition_was_met: false, alert_rule: { type: "price", op: "lte", value: 999 } },
  ];
  const { body, calls } = await run("a 410 Gone subscription is deleted", {
    allItems,
    allCards: cardMet,
    subscriptionsByUser: {
      u1: [{ id: "sub-dead-1", endpoint: "https://push.example/dead", p256dh: "p", auth_key: "a" }],
    },
    sendNotificationImpl: async () => {
      const err = new Error("Gone");
      err.statusCode = 410;
      throw err;
    },
  });
  assertEqual(body.push.failed, 1, "T6: the failed send is counted");
  assertEqual(calls.deletedSubscriptionIds, ["sub-dead-1"], "T6: the stale subscription's real id was queued for deletion");
}

// T7: the push_subscriptions table doesn't exist yet in production — the
// CORE watchlist-checking job (triggered/last_triggered_at) must still
// succeed exactly as before this feature existed; only the push phase
// reports itself skipped.
{
  const allItems = [
    { id: "w1", user_id: "u1", card_id: "c1", condition_was_met: false, alert_rule: { type: "price", op: "lte", value: 999 } },
  ];
  const { body } = await run("push_subscriptions table missing degrades gracefully", {
    allItems,
    allCards: cardMet,
    pushSubscriptionsTableMissing: true,
  });
  assertEqual(body.triggered, 1, "T7: the core job (triggered count) is unaffected by push infra being absent");
  assertEqual(body.push.skippedReason, "push_subscriptions_table_missing", "T7: the push phase honestly reports why it skipped");
  assertEqual(body.push.sent, 0, "T7: nothing sent");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
