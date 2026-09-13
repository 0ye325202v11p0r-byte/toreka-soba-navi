// Regression test for the check-price-records cron
// (src/app/api/cron/check-price-records/route.ts, added 2026-09-13,
// differentiation feature #6 "史上最高値・最安値更新") — imports the REAL
// GET() handler, with Supabase and "web-push" both mocked via the shared
// loader hook. No real network or database calls.
//
// Run: node --experimental-strip-types migration/verify_check_price_records.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

process.env.CRON_SECRET = "test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
process.env.ADMIN_EMAIL = "admin@example.invalid";

function makeMocks({
  allPushSubscriptions = [],
  transactionsByUser = {},
  watchlistByUser = {},
  allCards = [],
  pushSubscriptionsTableMissing = false,
  sendNotificationImpl = async () => {},
}) {
  const calls = { deletedSubscriptionIds: [], sentTo: [] };
  const supabaseMock = {
    from(table) {
      if (table === "push_subscriptions") {
        return {
          select: () => ({
            order: () => ({
              range: () => ({
                abortSignal: () =>
                  (async () => {
                    if (pushSubscriptionsTableMissing) {
                      return { data: null, error: { code: "42P01", message: "relation does not exist" } };
                    }
                    return { data: allPushSubscriptions, error: null };
                  })(),
              }),
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
      if (table === "transactions") {
        return {
          select: () => ({
            eq: (_col, userId) => ({
              order: () => ({
                order: () => ({
                  range: () => ({
                    abortSignal: () =>
                      (async () => ({ data: transactionsByUser[userId] ?? [], error: null }))(),
                  }),
                }),
              }),
            }),
          }),
        };
      }
      if (table === "watchlist_items") {
        return {
          select: () => ({
            eq: (_col, userId) => ({
              abortSignal: () => (async () => ({ data: watchlistByUser[userId] ?? [], error: null }))(),
            }),
          }),
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
      throw new Error(`verify_check_price_records: unexpected table "${table}"`);
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

const { GET } = await import("../src/app/api/cron/check-price-records/route.ts");

async function run(label, opts) {
  const { supabaseMock, webPushMock, calls } = makeMocks(opts);
  globalThis.__SUPABASE_MOCK__ = supabaseMock;
  globalThis.__WEB_PUSH_MOCK__ = webPushMock;
  const request = new Request("http://localhost/api/cron/check-price-records", {
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
  assert(
    JSON.stringify(actual) === JSON.stringify(expected),
    `${label} — expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`
  );
}

function txn(cardId, type, quantity, pricePerUnit, date) {
  return {
    id: `t-${cardId}-${date}-${type}`,
    user_id: "irrelevant",
    card_id: cardId,
    type,
    quantity,
    price_per_unit: pricePerUnit,
    fee: 0,
    transaction_date: date,
    note: null,
    created_at: `${date}T00:00:00.000Z`,
  };
}
function watchItem(id, cardId) {
  return { id, user_id: "irrelevant", card_id: cardId, alert_rule: { type: "price", op: "gte", value: 0 }, last_triggered_at: null };
}
function card(id, overrides = {}) {
  return {
    id,
    name: `カード${id}`,
    current_price: 1000,
    pct_vs_avg30: null,
    data_quality: "real",
    source_url: "https://example.invalid",
    updated_at: "2026-09-13T00:00:00.000Z",
    judgment: null,
    record_status: null,
    ...overrides,
  };
}

// T1: a held card just hit a new all-time high -> the user's subscription
// receives a push naming it.
{
  const { body, calls } = await run("held card at a new all-time high triggers a push", {
    allPushSubscriptions: [{ id: "s1", user_id: "u1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }],
    transactionsByUser: { u1: [txn("c1", "buy", 1, 1000, "2026-01-01")] },
    allCards: [card("c1", { record_status: "high" })],
  });
  assertEqual(body.usersWithRecords, 1, "T1: exactly one user had a fresh record among their relevant cards");
  assertEqual(calls.sentTo.length, 1, "T1: sendNotification was actually called");
  assert(calls.sentTo[0].payload.body.includes("史上最高値"), "T1: the push body mentions the all-time-high event");
  assert(calls.sentTo[0].payload.body.includes("カードc1"), "T1: the push body names the actual card");
}

// T2: a watched (not held) card hits a new all-time low -> still triggers a
// push, since this feature covers both held AND watched cards, not just
// holdings.
{
  const { calls } = await run("watched card at a new all-time low triggers a push", {
    allPushSubscriptions: [{ id: "s1", user_id: "u1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }],
    watchlistByUser: { u1: [watchItem("w1", "c1")] },
    allCards: [card("c1", { record_status: "low" })],
  });
  assert(calls.sentTo[0]?.payload.body.includes("史上最安値"), "T2: a watched (not held) card's new low still triggers the push");
}

// T3: no relevant card currently has a record_status set -> no push sent,
// no false "you have an update" notification.
{
  const { body, calls } = await run("no fresh records -> no push", {
    allPushSubscriptions: [{ id: "s1", user_id: "u1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }],
    transactionsByUser: { u1: [txn("c1", "buy", 1, 1000, "2026-01-01")] },
    allCards: [card("c1", { record_status: null })],
  });
  assertEqual(body.usersWithRecords, 0, "T3: no user is counted as having a record");
  assertEqual(calls.sentTo.length, 0, "T3: sendNotification is never called when nothing set a fresh record");
}

// T4: no push subscriptions at all -> clean no-op.
{
  const { body } = await run("no push subscriptions at all", { allPushSubscriptions: [] });
  assertEqual(body, { totalUsers: 0, pushSent: 0 }, "T4: an empty push_subscriptions table produces a clean no-op response");
}

// T5: push_subscriptions table doesn't exist yet in production -> a clean
// skip, not a 500.
{
  const { body } = await run("push_subscriptions table missing", { pushSubscriptionsTableMissing: true });
  assertEqual(body, { skipped: true, reason: "push_subscriptions_table_missing" }, "T5: a missing table degrades to a clean skip, not an error");
}

// T6: a stale (410 Gone) subscription is deleted, same cleanup behavior as
// every other push-sending cron in this project.
{
  const { body, calls } = await run("a 410 Gone subscription is deleted", {
    allPushSubscriptions: [{ id: "s-dead", user_id: "u1", endpoint: "https://push.example/dead", p256dh: "p", auth_key: "a" }],
    transactionsByUser: { u1: [txn("c1", "buy", 1, 1000, "2026-01-01")] },
    allCards: [card("c1", { record_status: "high" })],
    sendNotificationImpl: async () => {
      const err = new Error("Gone");
      err.statusCode = 410;
      throw err;
    },
  });
  assertEqual(body.pushFailed, 1, "T6: the failed send is counted");
  assertEqual(calls.deletedSubscriptionIds, ["s-dead"], "T6: the stale subscription is queued for deletion");
}

// T7: two users, each with their own cards — one user's record alert must
// never leak into another user's push (the exact per-user isolation bug
// class this project's other multi-user crons already guard against).
{
  const { calls } = await run("two users get independently correct pushes", {
    allPushSubscriptions: [
      { id: "s1", user_id: "u1", endpoint: "https://push.example/u1", p256dh: "p", auth_key: "a" },
      { id: "s2", user_id: "u2", endpoint: "https://push.example/u2", p256dh: "p", auth_key: "a" },
    ],
    transactionsByUser: {
      u1: [txn("c1", "buy", 1, 1000, "2026-01-01")],
      u2: [txn("c2", "buy", 1, 1000, "2026-01-01")],
    },
    allCards: [card("c1", { name: "カードc1", record_status: "high" }), card("c2", { name: "カードc2", record_status: "low" })],
  });
  const u1Msg = calls.sentTo.find((s) => s.endpoint.endsWith("/u1"));
  const u2Msg = calls.sentTo.find((s) => s.endpoint.endsWith("/u2"));
  assert(u1Msg?.payload.body.includes("カードc1") && !u1Msg.payload.body.includes("カードc2"), "T7: user 1's push mentions only their own card's record");
  assert(u2Msg?.payload.body.includes("カードc2") && !u2Msg.payload.body.includes("カードc1"), "T7: user 2's push mentions only their own card's record");
}

// Note: "VAPID not configured" is deliberately NOT tested in this file —
// webPushServer.ts's pushConfigured is computed once at module import time
// from process.env, so it can't be toggled mid-process the way
// pushSubscriptionsTableMissing above can. This project's established
// pattern (see verify_check_watchlist.mjs vs. verify_check_watchlist_push.mjs)
// is to cover that branch in a separate file that never sets the VAPID env
// vars at all, rather than a broken same-file toggle — not duplicated here
// since check-price-records shares the exact same pushConfigured check
// already covered by those two files' pattern for every other push route.

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
