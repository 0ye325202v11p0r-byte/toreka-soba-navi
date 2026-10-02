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
async function newUser(browser, role, name, email, { skipConsent = false } = {}) {
  const ctx = await browser.newContext();
  await ctx.route(/stripe\.(com|me)/, (route) => route.abort());
  const page = await ctx.newPage();
  page.on("dialog", (d) => d.accept());
  await page.goto(`${BASE}/signup`);
  await page.check(`input[name=role][value=${role}]`);
  await page.fill("input[name=display_name]", name);
  await page.fill("input[name=email]", email);
  await page.fill("input[name=password]", "password123");
  if (skipConsent) {
    // Get past the browser's own `required` check so the server-side one is what's tested.
    await page.evaluate(() => document.querySelectorAll("input[type=checkbox]").forEach((el) => el.removeAttribute("required")));
    if (skipConsent === "agency") await page.check("input[name=agree_terms]");
    await page.click("button:has-text('登録する')");
    await sleep(2500);
    const alert = await page.locator("p[role=alert]").textContent().catch(() => "");
    const rows = await q("select id from auth.users where email=$1", [email]);
    await ctx.close();
    return { alert, created: rows.length > 0 };
  }
  await page.check("input[name=agree_terms]");
  if (role === "craftsman") await page.check("input[name=agree_payment_agency]");
  await page.click("button:has-text('登録する')");
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  const [u] = await q("select id, raw_user_meta_data as meta from auth.users where email=$1", [email]);
  return { ctx, page, id: u.id, meta: u.meta };
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
  const consent = craft.page.locator("input[name=agree_payment_agency]");
  if (await consent.count()) await consent.check();
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
  const url = await clickExpectingStripe(client.page, "button:has-text('お支払い画面へ進む')");
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

  // ---- 0. consent is enforced server-side, not just by the checkbox's `required`
  let refused = await newUser(browser, "client", "同意なし", `noconsent${stamp}@example.com`, { skipConsent: true });
  ok("規約に同意しないと登録できない（サーバー側でも拒否）", !refused.created && /同意.*が必要/.test(refused.alert || ""), refused.alert);
  refused = await newUser(browser, "craftsman", "同意なし和裁士", `noconsent-c${stamp}@example.com`, { skipConsent: "agency" });
  ok("和裁士は規約に同意しても、代金受領に同意しないと登録できない", !refused.created && /代金の受け取りに関する同意/.test(refused.alert || ""), refused.alert);

  // ---- 1. craftsman signup + payouts onboarding
  const craft = await newUser(browser, "craftsman", "テスト和裁士", `craft${stamp}@example.com`);
  ok("和裁士の新規登録", !!craft.id);
  ok("和裁士の同意（規約の版・日時・代金受領）が記録される", !!(craft.meta && craft.meta.terms_version && craft.meta.terms_agreed_at && craft.meta.payment_agency_agreed_at), JSON.stringify(craft.meta));
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
  ok("依頼者の規約同意が記録され、代金受領の同意は付かない", !!(client.meta && client.meta.terms_agreed_at && !client.meta.payment_agency_agreed_at), JSON.stringify(client.meta));
  await client.page.goto(`${BASE}/services/${svc[0].id}`);
  const summary = await client.page.locator("text=お申込み前にご確認ください").locator("..").textContent();
  ok("申込み前の最終確認（金額・納期・キャンセル・確定の時点）が表示される", /¥1,000/.test(summary) && /約14日/.test(summary) && /全額返金/.test(summary) && /お申込みが確定/.test(summary), summary.slice(0, 80));
  const o1 = await orderServiceAndPay(client, svc[0].id);
  ok("依頼 → Stripeの支払い画面へ移動", /stripe\.(com|me)/.test(o1.url), o1.url.slice(0, 60));
  const lastCheckout = await (await fetch("http://localhost:12110/__last_checkout")).json();
  const submitMsg = (lastCheckout && lastCheckout["custom_text[submit][message]"]) || "";
  ok("Stripeの支払い画面の「支払う」横にも確定の時点・納期・キャンセルを表示", /お申込み/.test(submitMsg) && /約14日/.test(submitMsg) && /全額返金/.test(submitMsg) && submitMsg.length <= 1200, `${submitMsg.length}文字`);
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
  await craft.page.fill("input[name=delivery_days]", "21");
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
  await client.page.goto(`${BASE}/orders/${o2.id}`);
  const payBox = await client.page.locator("text=お申込み前にご確認ください").locator("..").textContent().catch(() => "");
  const payUrl = await clickExpectingStripe(client.page, "button:has-text('お支払い画面へ進む')");
  ok("交渉成立後、依頼者は取引ページで最終確認を見てから支払いへ進める（提案の納期目安21日も表示）", /¥25,000/.test(payBox) && /約21日/.test(payBox) && /stripe\.(com|me)/.test(payUrl), payBox.slice(0, 60));
  const [pr] = await q("select delivery_days from proposals where request_id=$1", [reqRow.id]);
  const lastCo = await (await fetch("http://localhost:12110/__last_checkout")).json();
  ok("提案の納期目安が保存され、Stripeの支払い画面の文言にも入る", pr.delivery_days === 21 && /約21日/.test((lastCo && lastCo["custom_text[submit][message]"]) || ""), String(pr.delivery_days));

  // ---- 8. payout left pending because craftsman2 hadn't onboarded, released once they do
  const craft2 = await newUser(browser, "craftsman", "テスト和裁士2", `craft2${stamp}@example.com`);
  // craft2 plays a craftsman registered before signup asked for the
  // payment-agency consent: they must give it on the payouts page instead.
  await q("update auth.users set raw_user_meta_data = raw_user_meta_data - 'payment_agency_agreed_at' where id=$1", [craft2.id]);
  const svc2 = await createService(craft2, "テスト 単衣の仕立て", 2000);
  const o3 = await orderServiceAndPay(client, svc2[0].id);
  await paidWebhook(o3.order.id, "pi_e2e_3");
  await clickOnOrder(craft2, o3.order.id, "納品済みにする");
  await clickOnOrder(client, o3.order.id, "納品を確認して完了にする");
  [ord] = await q("select status, payment_status from orders where id=$1", [o3.order.id]);
  ok("振込先未設定の和裁士の取引は完了しても「支払い済み（未送金）」で保留", ord.status === "completed" && ord.payment_status === "paid", `${ord.status}/${ord.payment_status}`);
  await craft2.page.goto(`${BASE}/dashboard/payouts`);
  await craft2.page.evaluate(() => document.querySelectorAll("input[type=checkbox]").forEach((el) => el.removeAttribute("required")));
  await craft2.page.click("button:has-text('Stripeで振込先を設定する')");
  await sleep(2500);
  const payoutAlert = await craft2.page.locator("p[role=alert]").textContent().catch(() => "");
  let [c2] = await q("select stripe_account_id from craftsman_profiles where profile_id=$1", [craft2.id]);
  ok("以前からの和裁士は、代金受領に同意しないと振込先を設定できない", /同意.*が必要/.test(payoutAlert || "") && !c2.stripe_account_id, `${payoutAlert} / acct=${c2 && c2.stripe_account_id}`);
  const ob2 = await onboard(craft2);
  const [m2] = await q("select raw_user_meta_data as meta from auth.users where id=$1", [craft2.id]);
  ok("振込先設定の画面で同意すると記録される", !!m2.meta.payment_agency_agreed_at && /stripe\.(com|me)/.test(ob2.url), JSON.stringify(m2.meta));
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

  // ---- 13. after delivery the client can no longer cancel (= full refund) on their own (Phase 30)
  const svc3 = await createService(craft, "テスト 納品後の扱い", 1000);
  const buttonsOn = async (user, orderId) => { await user.page.goto(`${BASE}/orders/${orderId}`); return (await user.page.locator("button").allTextContents()).join("|"); };
  const oA = await orderServiceAndPay(client, svc3[0].id);
  await paidWebhook(oA.order.id, "pi_e2e_A");
  await clickOnOrder(craft, oA.order.id, "納品済みにする");
  let btns = await buttonsOn(client, oA.order.id);
  [ord] = await q("select revision_limit from orders where id=$1", [oA.order.id]);
  ok("納品後、依頼者の画面に「キャンセル」は無く、修正依頼（出品の修正回数1回）と運営への相談が出る", !/キャンセルする/.test(btns) && /修正を依頼する（残り1回）/.test(btns) && /運営に相談する/.test(btns) && ord.revision_limit === 1, btns);
  let r3 = await fetch(`http://localhost:54321/rest/v1/orders?id=eq.${oA.order.id}`, { method: "PATCH",
    headers: { apikey: require("fs").readFileSync("/tmp/pgw/e2e/keys.env", "utf8").match(/ANON=(.*)/)[1], Authorization: `Bearer ${access}`, "content-type": "application/json" }, body: JSON.stringify({ status: "cancelled" }) });
  [ord] = await q("select status, payment_status from orders where id=$1", [oA.order.id]);
  ok("納品後に依頼者がAPIを直接叩いてキャンセルしようとしても拒否される", r3.status >= 400 && ord.status === "delivered" && ord.payment_status === "paid", `HTTP ${r3.status} ${ord.status}/${ord.payment_status}`);
  await clickOnOrder(client, oA.order.id, "修正を依頼する");
  [ord] = await q("select status, revision_requests_used from orders where id=$1", [oA.order.id]);
  btns = await buttonsOn(client, oA.order.id);
  ok("修正を依頼 → 進行中に戻る（回数を記録）。戻っても依頼者からはキャンセルできない", ord.status === "in_progress" && ord.revision_requests_used === 1 && !/キャンセルする/.test(btns), `${ord.status}/${ord.revision_requests_used} ${btns}`);
  await clickOnOrder(craft, oA.order.id, "納品済みにする");
  btns = await buttonsOn(client, oA.order.id);
  ok("修正回数を使い切ると、修正依頼のボタンは出ない", !/修正を依頼する/.test(btns) && /運営に相談する/.test(btns), btns);
  await clickOnOrder(client, oA.order.id, "運営に相談する");
  await q("update orders set delivered_at = now() - interval '8 days' where id=$1", [oA.order.id]);
  await fetch(`${BASE}/api/cron/auto-complete-orders`, { headers: { Authorization: "Bearer e2e-cron" } });
  [ord] = await q("select status, disputed_at from orders where id=$1", [oA.order.id]);
  ok("運営に相談中の取引は、7日たっても自動で完了しない", ord.status === "delivered" && !!ord.disputed_at, `${ord.status} ${ord.disputed_at}`);

  const oB = await orderServiceAndPay(client, svc3[0].id);
  await paidWebhook(oB.order.id, "pi_e2e_B");
  await clickOnOrder(craft, oB.order.id, "納品済みにする");
  await clickOnOrder(client, oB.order.id, "運営に相談する");

  // operator: ADMIN_EMAIL in the test app's .env.local
  const [oldAdmin] = await q("select id from auth.users where email='admin@example.com'");
  if (oldAdmin) { await q("delete from notifications where user_id=$1", [oldAdmin.id]); await q("delete from profiles where id=$1", [oldAdmin.id]); await q("delete from auth.users where id=$1", [oldAdmin.id]); }
  const op = await newUser(browser, "client", "運営", "admin@example.com");
  await op.page.goto(`${BASE}/dashboard`);
  const opBanner = await op.page.locator("text=運営：相談中の取引").textContent().catch(() => "");
  const outsider = await client.page.goto(`${BASE}/admin/orders`);
  ok("運営のマイページに相談中の件数が出る／運営以外は管理画面を開けない", /相談中の取引 [1-9]\d*件/.test(opBanner) && outsider.status() === 404, `${opBanner} / 依頼者 HTTP ${outsider.status()}`);
  const resolve = async (orderId, label) => {
    await op.page.goto(`${BASE}/admin/orders`);
    const item = op.page.locator(`li[data-order-id="${orderId}"]`);
    if (!(await item.count())) return false;
    await item.locator(`button:has-text('${label}')`).click();
    await sleep(3500);
    return true;
  };
  const didA = await resolve(oA.order.id, "依頼者に返金する");
  [ord] = await q("select status, payment_status from orders where id=$1", [oA.order.id]);
  ok("運営が「依頼者に返金する」→ キャンセル・返金", didA && ord.status === "cancelled" && ord.payment_status === "refunded", `${didA} ${ord.status}/${ord.payment_status}`);
  const didB = await resolve(oB.order.id, "和裁士に支払う");
  [ord] = await q("select status, payment_status from orders where id=$1", [oB.order.id]);
  ok("運営が「和裁士に支払う」→ 完了・送金", didB && ord.status === "completed" && ord.payment_status === "transferred", `${didB} ${ord.status}/${ord.payment_status}`);

  const oC = await orderServiceAndPay(client, svc3[0].id);
  await paidWebhook(oC.order.id, "pi_e2e_C");
  await clickOnOrder(craft, oC.order.id, "納品済みにする");
  await clickOnOrder(craft, oC.order.id, "キャンセルに応じる");
  [ord] = await q("select status, payment_status from orders where id=$1", [oC.order.id]);
  ok("納品後でも、和裁士が話し合いの結果キャンセルに応じれば返金される", ord.status === "cancelled" && ord.payment_status === "refunded", `${ord.status}/${ord.payment_status}`);

  // ---- 14. the client closes their own request; waiting quotes are declined
  await client.page.goto(`${BASE}/requests/new`);
  await client.page.fill("input[name=title]", "締め切りテスト");
  await client.page.selectOption("select[name=garment_type]", "訪問着");
  await client.page.fill("textarea[name=description]", "締め切りのテストです");
  await client.page.click("button:has-text('依頼を投稿する')");
  await sleep(2500);
  const [rq2] = await q("select id from requests where client_id=$1 and title='締め切りテスト'", [client.id]);
  await craft.page.goto(`${BASE}/requests/${rq2.id}`);
  await craft.page.fill("input[name=price]", "20000");
  await craft.page.fill("input[name=delivery_days]", "10");
  await craft.page.fill("textarea[name=message]", "お受けできます");
  await craft.page.click("button:has-text('提案を送る')");
  await sleep(2500);
  const craftSeesClose = await (await craft.page.locator("button:has-text('この依頼を締め切る')").count());
  await client.page.goto(`${BASE}/requests/${rq2.id}`);
  await client.page.click("button:has-text('この依頼を締め切る')");
  await sleep(3500);
  const [rq2s] = await q("select status from requests where id=$1", [rq2.id]);
  const [pr2] = await q("select status from proposals where request_id=$1", [rq2.id]);
  const [nt] = await q("select count(*)::int as n from notifications where user_id=$1 and type='request_closed'", [craft.id]);
  await client.page.goto(`${BASE}/requests`);
  const onBoard = await client.page.locator(`a[href="/requests/${rq2.id}"]`).count();
  ok("依頼者が依頼を締め切れる → 掲示板から消え、届いていた提案は見送り、和裁士に通知", rq2s.status === "closed" && pr2.status === "declined" && nt.n >= 1 && onBoard === 0 && craftSeesClose === 0, `${rq2s.status}/${pr2.status}/通知${nt.n}/掲示板${onBoard}/和裁士にボタン${craftSeesClose}`);
  await craft.page.goto(`${BASE}/requests/${rq2.id}`);
  const canPropose = await craft.page.locator("button:has-text('提案を送る')").count();
  ok("締め切った依頼には提案できない", canPropose === 0, String(canPropose));

  // ---- 15. feedback round 1 (Phase 33)
  // contact form instead of a published mail address
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(`${BASE}/tokushoho`);
  const tok = await visitor.locator("main").innerText();
  ok("特商法の表示に個人の氏名・メールアドレスが出ない（請求により開示・フォームへの案内）", !/@/.test(tok) && /遅滞なく電子メールでお知らせ/.test(tok) && /お問い合わせフォーム/.test(tok), tok.slice(0, 60));
  await visitor.goto(`${BASE}/contact?category=特商法の表示事項の請求`);
  await visitor.fill("input[name=name]", "問い合わせテスト");
  await visitor.fill("input[name=email]", `inq${stamp}@example.com`);
  await visitor.fill("textarea[name=body]", "氏名と住所を教えてください");
  await visitor.click("button:has-text('送信する')");
  await sleep(2500);
  const [inq] = await q("select category, status from inquiries where email=$1", [`inq${stamp}@example.com`]);
  const thanks = await visitor.locator("text=お問い合わせを受け付けました").count();
  await op.page.goto(`${BASE}/admin/inquiries`);
  const inbox = await op.page.locator("main").innerText();
  ok("お問い合わせフォーム → 保存され、運営の受信箱に未対応で出る", inq && inq.category === "特商法の表示事項の請求" && inq.status === "open" && thanks === 1 && inbox.includes(`inq${stamp}@example.com`), JSON.stringify(inq));
  await visitor.goto(`${BASE}/contact`);
  await visitor.fill("input[name=name]", "bot"); await visitor.fill("input[name=email]", `bot${stamp}@example.com`);
  await visitor.selectOption("select[name=category]", "その他"); await visitor.fill("textarea[name=body]", "spam");
  await visitor.evaluate(() => { document.querySelector("input[name=website]").value = "http://spam.example"; });
  await visitor.click("button:has-text('送信する')"); await sleep(2000);
  const [bot] = await q("select count(*)::int as n from inquiries where email=$1", [`bot${stamp}@example.com`]);
  ok("見えない欄まで埋めるロボットの送信は保存しない", bot.n === 0, String(bot.n));

  // active tab
  await client.page.goto(`${BASE}/requests`);
  const current = await client.page.locator("header [aria-current=page]").allTextContents();
  ok("選んでいるメニューに印が付く", current.join("") === "依頼掲示板", current.join("|"));

  // measurements on a public request: client and craftsmen see them, a signed-out visitor doesn't
  await client.page.goto(`${BASE}/requests/new`);
  await client.page.fill("input[name=title]", "寸法テスト");
  await client.page.selectOption("select[name=garment_type]", "訪問着");
  await client.page.fill("textarea[name=description]", "寸法のテストです");
  await client.page.fill("input[name=height_cm]", "158");
  await client.page.fill("input[name=yuki_cm]", "64.5");
  await client.page.fill("input[name=hip_cm]", "92");
  await client.page.click("button:has-text('依頼を投稿する')");
  await sleep(2500);
  const [rq3] = await q("select r.id, m.height_cm, m.yuki_cm, m.hip_cm from requests r join request_measurements m on m.request_id=r.id where r.client_id=$1 and r.title='寸法テスト'", [client.id]);
  await craft.page.goto(`${BASE}/requests/${rq3.id}`);
  const craftSees = /裄（ゆき）\s*64\.5cm/.test(await craft.page.locator("main").innerText());
  await visitor.goto(`${BASE}/requests/${rq3.id}`);
  const anonSees = /64\.5cm/.test(await visitor.locator("main").innerText());
  ok("寸法は別の欄で保存され、和裁士には見え、ログインしていない人には見えない", rq3 && Number(rq3.yuki_cm) === 64.5 && craftSees && !anonSees, `${rq3 && rq3.yuki_cm} 和裁士${craftSees} 未ログイン${anonSees}`);

  // 相談する (directed request) from a craftsman page, starting signed out
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(`${BASE}/craftsmen/${craft.id}`);
  await guest.click("a:has-text('相談する')");
  await guest.waitForURL(/\/login\?next=/);
  await guest.fill("input[name=email]", `client${stamp}@example.com`);
  await guest.fill("input[name=password]", "password123");
  await guest.click("button[type=submit]");
  await guest.waitForURL(/\/requests\/new\?to=/, { timeout: 15000 }).catch(() => {});
  ok("ログインしていなくても「相談する」→ログイン後に相談の画面へ戻る", /\/requests\/new\?to=/.test(guest.url()), guest.url());
  await guest.fill("input[name=title]", "指名の相談テスト");
  await guest.selectOption("select[name=garment_type]", "訪問着");
  await guest.fill("textarea[name=description]", "相談です");
  const gradeShown = await guest.locator("select[name=min_grade]").count();
  ok("相談の画面では「相談を送る」ボタンになり、資格級位の指定は出ない", gradeShown === 0 && (await guest.locator("button:has-text('相談を送る')").count()) === 1, `級位の欄${gradeShown}`);
  await guest.click("button:has-text('相談を送る')");
  await sleep(2500);
  const [dr] = await q("select id, directed_to from requests where client_id=$1 and title='指名の相談テスト'", [client.id]);
  await client.page.goto(`${BASE}/requests`);
  const onBoard2 = await client.page.locator(`a[href="/requests/${dr.id}"]`).count();
  const otherSees = await craft2.page.goto(`${BASE}/requests/${dr.id}`);
  await craft.page.goto(`${BASE}/dashboard`);
  const inbox2 = await craft.page.locator("text=あなたへの相談").count();
  const [ntf] = await q("select count(*)::int as n from notifications where user_id=$1 and type='directed_request'", [craft.id]);
  ok("相談はその和裁士にだけ届く（掲示板に出ない・ほかの和裁士は開けない・本人のマイページと通知に出る）", dr.directed_to === craft.id && onBoard2 === 0 && otherSees.status() === 404 && inbox2 >= 1 && ntf.n >= 1, `掲示板${onBoard2} 他の和裁士HTTP${otherSees.status()} マイページ${inbox2} 通知${ntf.n}`);
  await craft.page.goto(`${BASE}/requests/${dr.id}`);
  await craft.page.fill("input[name=price]", "15000");
  await craft.page.fill("input[name=delivery_days]", "20");
  await craft.page.fill("textarea[name=message]", "お受けできます");
  await craft.page.click("button:has-text('提案を送る')");
  await sleep(2500);
  const [dp] = await q("select count(*)::int as n from proposals where request_id=$1 and craftsman_id=$2", [dr.id, craft.id]);
  ok("指名された和裁士は相談に見積りを送れる", dp.n === 1, String(dp.n));

  // favorites
  await client.page.goto(`${BASE}/craftsmen/${craft.id}`);
  await client.page.click("button:has-text('お気に入りに追加')");
  await sleep(2000);
  const [fv] = await q("select count(*)::int as n from favorites where client_id=$1 and craftsman_id=$2", [client.id, craft.id]);
  await client.page.goto(`${BASE}/dashboard`);
  const favSection = await client.page.locator("text=お気に入りの和裁士").count();
  await client.page.goto(`${BASE}/craftsmen/${craft.id}`);
  await client.page.click("button:has-text('お気に入りに登録済み')");
  await sleep(2000);
  const [fv2] = await q("select count(*)::int as n from favorites where client_id=$1 and craftsman_id=$2", [client.id, craft.id]);
  ok("お気に入りに追加 → マイページに出る → もう一度押すと外れる", fv.n === 1 && favSection === 1 && fv2.n === 0, `${fv.n}/${favSection}/${fv2.n}`);

  await browser.close();
  await db.end();
  console.log(results.join("\n"));
  console.log(`\n${results.filter((r) => r.startsWith("PASS")).length}/${results.length} passed`);
})().catch((e) => { console.error(results.join("\n")); console.error(e); process.exit(1); });
