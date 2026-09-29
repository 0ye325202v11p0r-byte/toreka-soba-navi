const { chromium } = require("playwright");
const Stripe = require("/tmp/pgw/app/node_modules/stripe");
const { Client } = require("/tmp/pgw/e2e/node_modules/pg");
const BASE = "http://localhost:3300";
const stripe = new Stripe("sk_test_x");
const db = new Client({ host: "127.0.0.1", port: 55432, user: "postgres", database: "e2e" });
const results = [];
const ok = (name, cond, detail = "") => { results.push(`${cond ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function webhook(event, secret) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const r = await fetch(`${BASE}/api/webhooks/stripe`, { method: "POST", body: payload, headers: { "stripe-signature": header, "content-type": "application/json" } });
  return r.status;
}
async function newUser(browser, role, name, email) {
  const ctx = await browser.newContext();
  await ctx.route(/stripe\.(com|me)/, (route) => route.abort());
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/signup`);
  await page.check(`input[name=role][value=${role}]`);
  await page.fill("input[name=display_name]", name);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  await page.click("button:has-text('登録する')");
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  const [u] = await q("select id from auth.users where email=$1", [email]);
  return { ctx, page, id: u.id };
}
// Clicking a button whose server action redirects to Stripe: the redirect is
// aborted by the route above, so wait for the attempted request instead.
async function clickExpectingStripe(page, selector) {
  const req = page.waitForRequest(/stripe\.(com|me)/, { timeout: 15000 });
  await page.click(selector);
  const url = (await req).url();
  await page.waitForLoadState("load").catch(() => {});
  await sleep(1500);
  return url;
}
async function onboard(craft) {
  await craft.page.goto(`${BASE}/dashboard/payouts`);
  const url = await clickExpectingStripe(craft.page, "button:has-text('Stripeで振込先を設定する')");
  const [cp] = await q("select stripe_account_id from craftsman_profiles where profile_id=$1", [craft.id]);
  return { url, acct: cp.stripe_account_id };
}
async function createService(craft, title, price) {
  await craft.page.goto(`${BASE}/services/new`);
  await craft.page.fill("input[name=title]", title);
  await craft.page.selectOption("select[name=garment_type]", "訪問着");
  await craft.page.fill("textarea[name=description]", "テスト用の出品です");
  await craft.page.fill("input[name=price]", String(price));
  await craft.page.fill("input[name=delivery_days]", "14");
  await craft.page.click("button:has-text('出品する')");
  await sleep(2500);
  return q("select id, price from services where craftsman_id=$1 and title=$2", [craft.id, title]);
}
async function orderServiceAndPay(client, serviceId) {
  await client.page.goto(`${BASE}/services/${serviceId}`);
  const url = await clickExpectingStripe(client.page, "button:has-text('このサービスに依頼する')");
  const [order] = await q("select * from orders where service_id=$1 and client_id=$2 order by created_at desc limit 1", [serviceId, client.id]);
  return { url, order };
}
async function paidWebhook(orderId, pi) {
  return webhook({ id: "evt_" + pi, object: "event", type: "checkout.session.completed", api_version: "2026-08-26.dahlia", created: Math.floor(Date.now() / 1000),
    data: { object: { id: "cs_" + pi, object: "checkout.session", client_reference_id: orderId, metadata: { order_id: orderId }, payment_status: "paid", payment_intent: pi } } }, "whsec_e2e_account");
}
async function clickOnOrder(user, orderId, text) {
  await user.page.goto(`${BASE}/orders/${orderId}`);
  await user.page.click(`button:has-text('${text}')`);
  await sleep(3000);
}

(async () => {
  await db.connect();
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const stamp = Date.now();

  // ---- 1. craftsman signup + payouts onboarding
  const craft = await newUser(browser, "craftsman", "テスト和裁士", `craft${stamp}@example.com`);
  ok("和裁士の新規登録", !!craft.id);
  const ob = await onboard(craft);
  ok("振込先設定ボタン → Stripeの登録画面へ移動", /stripe\.(com|me)/.test(ob.url), ob.url.slice(0, 60));
  ok("和裁士のStripeアカウントIDが保存される", /^acct_/.test(ob.acct || ""), ob.acct);

  // ---- 2. account.updated via the CONNECT-scoped secret
  let st = await webhook({ id: "evt_acct1", object: "event", type: "account.updated", account: ob.acct, created: Math.floor(Date.now()/1000),
    data: { object: { id: ob.acct, object: "account", capabilities: { transfers: "active" } } } }, "whsec_e2e_connect");
  let [cp] = await q("select stripe_transfers_enabled from craftsman_profiles where profile_id=$1", [craft.id]);
  ok("本人確認完了の通知（2つ目の鍵で署名）を受け付ける", st === 200 && cp.stripe_transfers_enabled === true, `HTTP ${st}`);
  st = await webhook({ id: "evt_bad", object: "event", type: "account.updated", data: { object: { id: ob.acct } } }, "whsec_WRONG");
  ok("偽の鍵で署名された通知は拒否される", st === 400, `HTTP ${st}`);

  // ---- 3. service with price validation
  let svc = await createService(craft, "テスト0円", 0);
  ok("0円の出品は拒否される", svc.length === 0);
  svc = await createService(craft, "テスト 袷の仕立て", 1000);
  ok("1000円で出品できる", svc.length === 1 && svc[0].price === 1000);

  // ---- 4. client orders and pays
  const client = await newUser(browser, "client", "テスト依頼者", `client${stamp}@example.com`);
  const o1 = await orderServiceAndPay(client, svc[0].id);
  ok("依頼 → Stripeの支払い画面へ移動", /stripe\.(com|me)/.test(o1.url), o1.url.slice(0, 60));
  ok("取引が「支払い待ち」で作成される", o1.order && o1.order.status === "pending_payment" && o1.order.payment_status === "unpaid" && o1.order.price === 1000);
  st = await paidWebhook(o1.order.id, "pi_e2e_1");
  let [ord] = await q("select * from orders where id=$1", [o1.order.id]);
  ok("支払い完了の通知で「進行中・支払い済み」になる", st === 200 && ord.status === "in_progress" && ord.payment_status === "paid", `HTTP ${st} ${ord.status}/${ord.payment_status}`);
  ok("手数料18%（180円）が支払い時点で確定する", ord.platform_fee_amount === 180, String(ord.platform_fee_amount));

  // ---- 5. attack: client tries to rewrite money columns directly through the REST API
  const sess = await client.ctx.cookies();
  const parts = sess.filter((c) => /^sb-localhost-auth-token(\.\d+)?$/.test(c.name)).sort((a, b) => a.name.localeCompare(b.name));
  let access = null;
  if (parts.length) {
    let v = parts.map((c) => decodeURIComponent(c.value)).join("");
    if (v.startsWith("base64-")) v = Buffer.from(v.slice(7), "base64").toString();
    try { access = JSON.parse(v).access_token; } catch {}
  }
  if (access) {
    const anon = require("fs").readFileSync("/tmp/pgw/e2e/keys.env", "utf8").match(/ANON=(.*)/)[1];
    const r = await fetch(`http://localhost:54321/rest/v1/orders?id=eq.${o1.order.id}`, { method: "PATCH",
      headers: { apikey: anon, Authorization: `Bearer ${access}`, "content-type": "application/json" }, body: JSON.stringify({ price: 1 }) });
    [ord] = await q("select price from orders where id=$1", [o1.order.id]);
    ok("依頼者がAPIを直接叩いて金額を書き換えようとしても拒否される", r.status >= 400 && ord.price === 1000, `HTTP ${r.status}`);
  } else ok("（攻撃テスト用のログイン情報を取得）", false, "cookie not found");

  // ---- 6. deliver + complete -> payout
  await clickOnOrder(craft, o1.order.id, "納品済みにする");
  [ord] = await q("select status, delivered_at from orders where id=$1", [o1.order.id]);
  ok("和裁士が納品できる", ord.status === "delivered" && !!ord.delivered_at, ord.status);
  await clickOnOrder(client, o1.order.id, "納品を確認して完了にする");
  [ord] = await q("select status, payment_status, stripe_transfer_id, completed_at from orders where id=$1", [o1.order.id]);
  ok("依頼者が完了 → 和裁士へ送金（transferred）", ord.status === "completed" && ord.payment_status === "transferred" && /^tr_shim_/.test(ord.stripe_transfer_id || ""), `${ord.status}/${ord.payment_status}/${ord.stripe_transfer_id}`);

  // ---- 7. negotiation: counter-offer accepted by the craftsman (was broken)
  await client.page.goto(`${BASE}/requests/new`);
  await client.page.fill("input[name=title]", "交渉テスト");
  await client.page.selectOption("select[name=garment_type]", "訪問着");
  await client.page.fill("textarea[name=description]", "交渉のテストです");
  await client.page.click("button:has-text('依頼を投稿する')");
  await sleep(2500);
  const [reqRow] = await q("select id from requests where client_id=$1 and title='交渉テスト'", [client.id]);
  await craft.page.goto(`${BASE}/requests/${reqRow.id}`);
  await craft.page.fill("input[name=price]", "30000");
  await craft.page.fill("textarea[name=message]", "お受けできます");
  await craft.page.click("button:has-text('提案を送る')");
  await sleep(2500);
  await client.page.goto(`${BASE}/requests/${reqRow.id}`);
  await client.page.click("button:has-text('金額を提示して交渉する')");
  await client.page.fill("input[name=countered_price]", "25000");
  await client.page.click("button:has-text('この価格を提示する')");
  await sleep(2500);
  let [prop] = await q("select status, countered_price, price from proposals where request_id=$1", [reqRow.id]);
  ok("依頼者が交渉価格を提示できる", prop && prop.status === "countered" && prop.countered_price === 25000, JSON.stringify(prop));
  await craft.page.goto(`${BASE}/requests/${reqRow.id}`);
  await craft.page.click("button:has-text('で承諾する')");
  await sleep(3500);
  const [o2] = await q("select * from orders where request_id=$1", [reqRow.id]);
  const [rq] = await q("select status from requests where id=$1", [reqRow.id]);
  ok("和裁士が交渉価格を承諾 → 取引が25,000円で作成される", o2 && o2.price === 25000 && o2.status === "pending_payment", o2 ? `${o2.price}/${o2.status}` : "no order");
  ok("和裁士はStripeの支払い画面ではなく取引ページへ移動する", /\/orders\//.test(craft.page.url()), craft.page.url());
  ok("依頼が「成立」になる", rq.status === "matched", rq.status);

  // ---- 8. payout left pending because craftsman2 hadn't onboarded, released once they do
  const craft2 = await newUser(browser, "craftsman", "テスト和裁士2", `craft2${stamp}@example.com`);
  const svc2 = await createService(craft2, "テスト 単衣の仕立て", 2000);
  const o3 = await orderServiceAndPay(client, svc2[0].id);
  await paidWebhook(o3.order.id, "pi_e2e_3");
  await clickOnOrder(craft2, o3.order.id, "納品済みにする");
  await clickOnOrder(client, o3.order.id, "納品を確認して完了にする");
  [ord] = await q("select status, payment_status from orders where id=$1", [o3.order.id]);
  ok("振込先未設定の和裁士の取引は完了しても「支払い済み（未送金）」で保留", ord.status === "completed" && ord.payment_status === "paid", `${ord.status}/${ord.payment_status}`);
  const ob2 = await onboard(craft2);
  st = await webhook({ id: "evt_acct2", object: "event", type: "account.updated", account: ob2.acct, created: Math.floor(Date.now()/1000),
    data: { object: { id: ob2.acct, object: "account", capabilities: { transfers: "active" } } } }, "whsec_e2e_connect");
  await sleep(1000);
  [ord] = await q("select payment_status, stripe_transfer_id, platform_fee_amount from orders where id=$1", [o3.order.id]);
  ok("本人確認が完了した時点で、保留分が自動で送金される", ord.payment_status === "transferred" && /^tr_shim_/.test(ord.stripe_transfer_id || ""), `${ord.payment_status}/${ord.stripe_transfer_id}`);

  // ---- 9. cancel a paid order -> refund
  const o4 = await orderServiceAndPay(client, svc[0].id);
  await paidWebhook(o4.order.id, "pi_e2e_4");
  await clickOnOrder(client, o4.order.id, "キャンセルする");
  [ord] = await q("select status, payment_status from orders where id=$1", [o4.order.id]);
  ok("支払い済みの取引をキャンセル → 返金（refunded）", ord.status === "cancelled" && ord.payment_status === "refunded", `${ord.status}/${ord.payment_status}`);

  // ---- 10. client goes silent after delivery -> daily cron auto-completes and pays out
  const o5 = await orderServiceAndPay(client, svc[0].id);
  await paidWebhook(o5.order.id, "pi_e2e_5");
  await clickOnOrder(craft, o5.order.id, "納品済みにする");
  await q("update orders set delivered_at = now() - interval '8 days' where id=$1", [o5.order.id]);
  let r = await fetch(`${BASE}/api/cron/auto-complete-orders`);
  ok("自動完了の処理は合言葉なしでは動かない", r.status === 401, `HTTP ${r.status}`);
  r = await fetch(`${BASE}/api/cron/auto-complete-orders`, { headers: { Authorization: "Bearer e2e-cron" } });
  [ord] = await q("select status, payment_status from orders where id=$1", [o5.order.id]);
  ok("納品から7日間反応がない取引は自動で完了・送金される", r.status === 200 && ord.status === "completed" && ord.payment_status === "transferred", `HTTP ${r.status} ${ord.status}/${ord.payment_status}`);

  // ---- 11. transfer succeeded but recording it failed -> a retry must not pay twice
  [ord] = await q("select stripe_transfer_id from orders where id=$1", [o1.order.id]);
  const firstTransfer = ord.stripe_transfer_id;
  await q("update orders set payment_status='paid', stripe_transfer_id=null where id=$1", [o1.order.id]);
  const postsBefore = (require("fs").readFileSync("/tmp/pgw/stripe-mock.log", "utf8").match(/POST \/v1\/transfers/g) || []).length;
  await webhook({ id: "evt_acct3", object: "event", type: "account.updated", account: ob.acct, created: Math.floor(Date.now()/1000),
    data: { object: { id: ob.acct, object: "account", capabilities: { transfers: "active" } } } }, "whsec_e2e_connect");
  await sleep(1000);
  const postsAfter = (require("fs").readFileSync("/tmp/pgw/stripe-mock.log", "utf8").match(/POST \/v1\/transfers/g) || []).length;
  [ord] = await q("select payment_status, stripe_transfer_id from orders where id=$1", [o1.order.id]);
  ok("送金済みなのに記録が消えた取引をやり直しても、二重送金しない", ord.payment_status === "transferred" && ord.stripe_transfer_id === firstTransfer && postsAfter === postsBefore, `${firstTransfer} -> ${ord.stripe_transfer_id}, new POSTs: ${postsAfter - postsBefore}`);

  // ---- 12. craftsman pauses / resumes / deletes a listing
  const svcUrl = `${BASE}/services/${svc[0].id}`;
  await craft.page.goto(svcUrl);
  await craft.page.click("button:has-text('出品を停止する')");
  await sleep(2500);
  let [sv] = await q("select status from services where id=$1", [svc[0].id]);
  let r2 = await client.page.goto(svcUrl);
  ok("和裁士が出品を停止 → 他の人には表示されない", sv.status === "draft" && r2.status() === 404, `${sv.status} / 依頼者側 HTTP ${r2.status()}`);
  await craft.page.goto(svcUrl);
  await craft.page.click("button:has-text('出品を再開する')");
  await sleep(2500);
  r2 = await client.page.goto(svcUrl);
  [sv] = await q("select status from services where id=$1", [svc[0].id]);
  ok("出品を再開 → また表示される", sv.status === "published" && r2.status() === 200, `${sv.status} / HTTP ${r2.status()}`);
  r2 = await fetch(`http://localhost:54321/rest/v1/services?id=eq.${svc[0].id}`, { method: "DELETE",
    headers: { apikey: require("fs").readFileSync("/tmp/pgw/e2e/keys.env", "utf8").match(/ANON=(.*)/)[1], Authorization: `Bearer ${access}` } });
  [sv] = await q("select count(*)::int as n from services where id=$1", [svc[0].id]);
  ok("依頼者が他人の出品を消そうとしても消えない", sv.n === 1, `HTTP ${r2.status}`);
  await craft.page.goto(svcUrl);
  await craft.page.click("button:has-text('この出品を削除する')");
  await craft.page.waitForURL("**/dashboard", { timeout: 15000 }).catch(() => {});
  [sv] = await q("select count(*)::int as n from services where id=$1", [svc[0].id]);
  [ord] = await q("select status, price, title, service_id from orders where id=$1", [o1.order.id]);
  ok("出品を削除 → 消えるが、過去の取引は残る", sv.n === 0 && ord && ord.status === "completed" && ord.price === 1000 && ord.service_id === null, JSON.stringify(ord));

  await browser.close();
  await db.end();
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
})().catch((e) => { console.error(results.join("\n")); console.error(e); process.exit(1); });
