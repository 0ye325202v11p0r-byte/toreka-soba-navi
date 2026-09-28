# 決済フローのE2Eテスト（ローカル）

本物のSupabase/Stripeを使わずに、依頼→支払い→納品→完了→送金までを自動で通すテスト。
2026-09-27に23項目すべて合格。

## 構成
- PostgreSQL 16 ＋ `supabase-shim.sql`（auth.uid()/auth.role()・roles・storageの最小限の模倣）＋ `supabase/schema.sql`
- PostgREST 12.2.3（GitHub Releasesのバイナリ）… Supabaseの `/rest/v1`
- `fake-supabase.js` … `:54321` で `/rest/v1` をPostgRESTへ中継し、`/auth/v1`（signup・password login・user・logout）を最小限に模倣。JWTはHS256
- stripe-mock 0.197.0（GitHub Releasesのバイナリ）… Stripe APIの模倣（`:12111`）
- アプリは作業用コピーで `src/lib/stripe.ts` の `new Stripe(key)` を `new Stripe(key, { host: "localhost", port: 12111, protocol: "http" })` に書き換えてビルド（**本体には入れない**）
- Webhookは `stripe.webhooks.generateTestHeaderString` で署名して `/api/webhooks/stripe` に直接POST（アカウント用・Connect用の2つの鍵の両方を確認）
- Playwright（グローバル）で画面操作。Stripeへのリダイレクトはabortして、遷移しようとしたことだけ確認

`.env.local`（作業用コピー側）:
```
NEXT_PUBLIC_SUPABASE_URL=http://localhost:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<role=anonのJWT>
SUPABASE_SERVICE_ROLE_KEY=<role=service_roleのJWT>
NEXT_PUBLIC_SITE_URL= http://localhost:3300/   # わざと前後に空白・末尾スラッシュ（正規化の確認）
STRIPE_SECRET_KEY=sk_test_e2e
STRIPE_WEBHOOK_SECRET=whsec_e2e_account
STRIPE_CONNECT_WEBHOOK_SECRET=whsec_e2e_connect
CRON_SECRET=e2e-cron
```

## 確認している項目
新規登録／振込先設定（Stripeアカウント作成・業種等の自動入力）／本人確認完了通知（Connect用の鍵）と偽署名の拒否／50円未満の出品拒否／依頼→支払い待ち→支払い完了通知→手数料確定／依頼者によるAPI直叩きの金額改ざん拒否／納品→完了→送金／交渉価格の提示→和裁士の承諾→取引作成（和裁士は支払い画面に飛ばない）／振込先未設定の和裁士の送金保留→本人確認完了で自動送金／支払い済み取引のキャンセル→返金／7日無反応の自動完了→送金とcronの合言葉チェック

`phase29-guard-test.sql` はDBトリガー（Phase 29）単体のテスト（21項目）。

## 模倣では確認できないこと
- stripe-mockのPaymentIntentは`latest_charge`が空なので、送金の`source_transaction`指定は通っていない（本物のStripeのテスト環境で確認する）
- Stripeの支払い画面・本人確認画面そのもの
