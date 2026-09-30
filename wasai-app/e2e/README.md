# 決済フローのE2Eテスト（ローカル）

本物のSupabase/Stripeを使わずに、依頼→支払い→納品→完了→送金までを自動で通すテスト。
2026-09-30に47項目すべて合格（Phase 30・31の後）。

## 構成
- PostgreSQL 16 ＋ `supabase-shim.sql`（auth.uid()/auth.role()・roles・storageの最小限の模倣）＋ `supabase/schema.sql`
- PostgREST 12.2.3（GitHub Releasesのバイナリ）… Supabaseの `/rest/v1`
- `fake-supabase.js` … `:54321` で `/rest/v1` をPostgRESTへ中継し、`/auth/v1`（signup・password login・user（取得と更新）・logout）を最小限に模倣。signup時の`options.data`と`updateUser({data})`は`auth.users.raw_user_meta_data`に保存（更新は本物と同じく上書きでなく統合）。JWTはHS256
- stripe-mock 0.197.0（GitHub Releasesのバイナリ）… Stripe APIの模倣（`:12111`）
- `stripe-shim.js`（`:12110`）… stripe-mockは一覧取得で絞り込み条件を無視して見本データを返すため、`GET /v1/transfers?transfer_group=…` だけを実際に作られた送金から答え、残りをstripe-mockへ中継する（これが無いと「送金済みなので作らない」の分岐しか通らない）。また最後に作られた支払い画面（Checkout Session）の送信内容を `GET /__last_checkout` で返す（支払い画面に出す文言の確認用）
- `up-local-backends.sh` … PostgreSQL・PostgREST・stripe-mock・fake-supabase・stripe-shimの起動（パスは作業環境の/tmp/pgw前提）
- アプリは作業用コピーで `src/lib/stripe.ts` の `new Stripe(key)` を `new Stripe(key, { host: "localhost", port: 12110, protocol: "http" })` に書き換えてビルド（**本体には入れない**）
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
提案の納期目安（Phase 31）：提案時に保存され、依頼者の最終確認とStripeの支払い画面の文言に入る

納品後の扱い（Phase 30）：納品後は依頼者の画面に「キャンセル」が出ない／APIを直接叩いても拒否／修正の依頼で進行中に戻り、戻っても依頼者からはキャンセル不可／修正回数の上限／運営に相談中は自動完了しない／運営のマイページに件数、運営以外は管理画面に入れない／運営の判断で返金・支払い／和裁士が応じればキャンセル・返金

規約・同意まわり：同意しないと登録できない（画面のチェックを外してもサーバー側で拒否）／和裁士は代金受領の同意も必須／同意の日時・規約の版の記録／以前からの和裁士は振込先設定の前に同意が必要／申込み前の最終確認（金額・納期・キャンセル・確定の時点）の表示／Stripeの支払い画面の「支払う」横への同じ内容の表示（1200文字以内）

新規登録／振込先設定（Stripeアカウント作成・業種等の自動入力）／本人確認完了通知（Connect用の鍵）と偽署名の拒否／50円未満の出品拒否／依頼→支払い待ち→支払い完了通知→手数料確定／依頼者によるAPI直叩きの金額改ざん拒否／納品→完了→送金／交渉価格の提示→和裁士の承諾→取引作成（和裁士は支払い画面に飛ばない）／振込先未設定の和裁士の送金保留→本人確認完了で自動送金／支払い済み取引のキャンセル→返金／7日無反応の自動完了→送金とcronの合言葉チェック／送金は成功したが記録に失敗した取引をやり直しても二重送金しない／出品の停止・再開・削除（削除しても過去の取引は残る、他人の出品は消せない）

`phase29-guard-test.sql` はDBトリガー（Phase 29）単体のテスト（21項目）、`phase30-guard-test.sql` は納品後のキャンセル規則（Phase 30）単体のテスト（13項目）、`phase31-guard-test.sql` は提案の納期目安（Phase 31）単体のテスト（5項目）。どちらも新しいデータベースに `supabase-shim.sql` と `supabase/schema.sql` を流してから実行する。

## 模倣では確認できないこと
- stripe-mockのPaymentIntentは`latest_charge`が空なので、送金の`source_transaction`指定は通っていない（2026-09-29に本物のStripeサンドボックスで送られていることを確認済み）
- Stripeの支払い画面・本人確認画面そのもの
