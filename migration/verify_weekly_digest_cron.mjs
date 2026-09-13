// Regression test for the weekly-digest cron
// (src/app/api/cron/weekly-digest/route.ts, added 2026-09-13) — imports
// the REAL GET() handler, with Supabase and "web-push" both mocked via the
// shared loader hook. No real network or database calls.
//
// Run: node --experimental-strip-types migration/verify_weekly_digest_cron.mjs
import { register } from "node:module";
register("./_test_mocks/loader.mjs", import.meta.url);

process.env.CRON_SECRET = "test-secret";
process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.invalid";
process.env.SUPABASE_SERVICE_ROLE_KEY = "test-key";
process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-vapid-public-key";
process.env.VAPID_PRIVATE_KEY = "test-vapid-private-key";
process.env.ADMIN_EMAIL = "admin@example.invalid";

function fluentCardsTable(allCards, catalogRealPct) {
  // Supports both real call shapes this route makes against "cards":
  //   .select("pct_vs_avg30").eq("data_quality","real").not(...).abortSignal()
  //   .select(...).in("id", ids).abortSignal()
  const builder = {
    _mode: null,
    eq(_col, _val) {
      this._mode = "catalog";
      return this;
    },
    not() {
      return this;
    },
    in(_col, ids) {
      this._mode = "byIds";
      this._ids = ids;
      return this;
    },
    abortSignal: () =>
      (async () => {
        if (builder._mode === "catalog") {
          return { data: catalogRealPct.map((pct_vs_avg30) => ({ pct_vs_avg30 })), error: null };
        }
        const set = new Set(builder._ids);
        return { data: allCards.filter((c) => set.has(c.id)), error: null };
      })(),
  };
  return { select: () => builder };
}

function makeMocks({
  allPushSubscriptions = [],
  transactionsByUser = {},
  watchlistByUser = {},
  allCards = [],
  catalogRealPct = [],
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
        return fluentCardsTable(allCards, catalogRealPct);
      }
      throw new Error(`verify_weekly_digest_cron: unexpected table "${table}"`);
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

const { GET } = await import("../src/app/api/cron/weekly-digest/route.ts");

async function run(label, opts) {
  const { supabaseMock, webPushMock, calls } = makeMocks(opts);
  globalThis.__SUPABASE_MOCK__ = supabaseMock;
  globalThis.__WEB_PUSH_MOCK__ = webPushMock;
  const request = new Request("http://localhost/api/cron/weekly-digest", {
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
    ...overrides,
  };
}

// T1: an active user with real gains and a push subscription receives a
// digest naming their actual P&L.
{
  const { body, calls } = await run("active user with a real gain receives a digest", {
    allPushSubscriptions: [{ id: "s1", user_id: "u1", endpoint: "https://push.example/1", p256dh: "p", auth_key: "a" }],
    transactionsByUser: { u1: [txn("c1", "buy", 1, 1000, "2026-01-01")] },
    allCards: [card("c1", { current_price: 1500 })],
  });
  assertEqual(body.totalUsers, 1, "T1: exactly one user has a push subscription");
  assertEqual(body.digestsSent, 1, "T1: a digest was sent for the active user");
  assertEqual(calls.sentTo.length, 1, "T1: sendNotification was actually called");
  assert(calls.sentTo[0].payload.body.includes("¥500"), "T1: the digest names the actual +500 unrealized gain");
}

// T2: a user with a push subscription but NO holdings/watchlist at all
// (hasNothing:true) receives NO digest — sending "your portfolio is empty"
// every week would be exactly the kind of notification-fatigue mistake
// this feature must avoid.
{
  const { body, calls } = await run("a user with nothing recorded gets no digest", {
    allPushSubscriptions: [{ id: "s1", user_id: "u-empty", endpoint: "https://push.example/2", p256dh: "p", auth_key: "a" }],
    transactionsByUser: {},
    allCards: [],
  });
  assertEqual(body.digestsSent, 0, "T2: no digest sent for a user with nothing recorded");
  assertEqual(body.digestsSkippedNothing, 1, "T2: explicitly counted as skipped-for-nothing-to-report, not silently dropped");
  assertEqual(calls.sentTo.length, 0, "T2: sendNotification was never called for this user");
}

// T3: no push subscriptions exist at all -> the route does nothing, cleanly.
{
  const { body } = await run("no push subscriptions at all", { allPushSubscriptions: [] });
  assertEqual(body, { totalUsers: 0, digestsSent: 0 }, "T3: an empty push_subscriptions table produces a clean no-op response");
}

// T4: push_subscriptions table doesn't exist yet in production -> reported
// as skipped, not a 500 error.
{
  const { body } = await run("push_subscriptions table missing", { pushSubscriptionsTableMissing: true });
  assertEqual(body, { skipped: true, reason: "push_subscriptions_table_missing" }, "T4: a missing table degrades to a clean skip, not an error");
}

// T5: a stale (410 Gone) subscription is deleted, same as check-watchlist's
// own cleanup behavior — this cron must not accumulate dead subscriptions
// forever just because it's a different route.
{
  const { body, calls } = await run("a 410 Gone subscription is deleted", {
    allPushSubscriptions: [{ id: "s-dead", user_id: "u1", endpoint: "https://push.example/dead", p256dh: "p", auth_key: "a" }],
    transactionsByUser: { u1: [txn("c1", "buy", 1, 1000, "2026-01-01")] },
    allCards: [card("c1", { current_price: 1500 })],
    sendNotificationImpl: async () => {
      const err = new Error("Gone");
      err.statusCode = 410;
      throw err;
    },
  });
  assertEqual(body.pushFailed, 1, "T5: the failed send is counted");
  assertEqual(calls.deletedSubscriptionIds, ["s-dead"], "T5: the stale subscription is queued for deletion");
}

// T6: two users, each with their OWN transactions — one user's digest must
// never leak or mix in another user's numbers (the exact bug a shared
// catalogPctValues variable, computed once for everyone, must not cause
// for the per-user totalPnl figures).
{
  const { calls } = await run("two users get independently correct digests", {
    allPushSubscriptions: [
      { id: "s1", user_id: "u1", endpoint: "https://push.example/u1", p256dh: "p", auth_key: "a" },
      { id: "s2", user_id: "u2", endpoint: "https://push.example/u2", p256dh: "p", auth_key: "a" },
    ],
    transactionsByUser: {
      u1: [txn("c1", "buy", 1, 1000, "2026-01-01")], // +500 unrealized (current_price 1500)
      u2: [txn("c2", "buy", 1, 1000, "2026-01-01")], // -300 unrealized (current_price 700)
    },
    allCards: [card("c1", { current_price: 1500 }), card("c2", { current_price: 700 })],
  });
  const u1Msg = calls.sentTo.find((s) => s.endpoint.endsWith("/u1"));
  const u2Msg = calls.sentTo.find((s) => s.endpoint.endsWith("/u2"));
  assert(u1Msg?.payload.body.includes("¥500") && !u1Msg.payload.body.includes("¥-300"), "T6: user 1's digest reflects only their own +500 gain");
  assert(u2Msg?.payload.body.includes("¥-300") && !u2Msg.payload.body.includes("¥500"), "T6: user 2's digest reflects only their own -300 loss");
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail > 0) process.exitCode = 1;
