# 本番セットアップ・チェックリスト

このファイルは新規作成のみ（本番DBへの書き込み・デプロイは一切行っていない）。
これまで`migration/README.md`・各`retrofit_*.sql`・`supabase/schema.sql`に
散らばっていた「本番でまだ実行/設定されていないはずの項目」を、実行順に
1つにまとめたもの。**すべてユーザー自身がSupabase SQL Editor / Vercel
ダッシュボードで行う必要がある**（このセッションは本番DBへの書き込み・
Vercelの環境変数設定を一切行っていない — 自己申告した制約による）。

各項目は「今まだ本番で反映されていないはず」という**推測**であり、本番
DB/Vercel環境を直接確認した結果ではない。実行前に念のため現状を確認す
ることを推奨する。

---

## 🔴 最優先（セキュリティ）

### 1. `/admin/sync-status` の管理者限定アクセス制御 ✅ 完了（2026-09-13）

**現状の懸念：** ログイン済みの任意ユーザー（自己申告のみで作れる新規
登録含む）が、cronの実行履歴・内部カードID・エラー内容を閲覧できてしまう
可能性がある。

**→ ユーザー本人がSupabase SQL Editorで実行し、Vercelに`ADMIN_EMAIL`を
設定・再デプロイ済み。完了確認済み。**

### 1b. ログイン方式をパスワード認証に変更 ✅ 完了（2026-09-13）

**発覚した問題：** 上記1の確認作業中、Supabaseのデフォルトメール送信は
**プロジェクト全体で1時間に2通まで**という上限があることが判明
（[出典](https://axonbuild.com/blog/supabase-email-rate-limit/)）。
それまでのマジックリンク（パスワードレス）ログインは毎回必ずメールを
送るため、「無料でまず試す」つもりが、実際には**1時間に2人しか
ログインできない**という致命的な制約になっていた。

**対応：** `src/app/login/page.tsx`をメール+パスワード方式に書き換え済み
（コミット済み）。ただしこれだけでは不十分——**Supabase側の「Confirm
email」設定がオンのままだと、新規登録時に依然として確認メールが送られ、
同じ制限に引っかかる。**

**残作業（ユーザー自身が行う必要あり）：**
1. Supabaseダッシュボード → **Authentication** → **Sign In / Providers**
   （またはEmailプロバイダの設定画面）を開く
2. **「Confirm email」**（メール確認を必須にする設定）を**オフ**にする
3. 保存

これを行うまでは、新規登録のたびに確認メールが送られ、同じ1時間2通の
壁に引っかかり続ける。オフにすれば、ログイン・新規登録は一切メールを
送らなくなる。パスワードを忘れた場合の再設定フロー（`/reset-password`）
は2026-09-13中に追加実装済み。

### 1c. CAPTCHA（Cloudflare Turnstile + Supabase Attack Protection）— コード側は準備済み、有効化は未実施

**発覚した問題（セキュリティ監査）：** 新規登録・ログインの両方に
リクエスト回数の上限が無く、①誰でも無制限に適当なアカウントを作れる
②Supabaseのデフォルトのログイン試行回数制限はIPアドレス単位（アカウント
単位ではない）ため、複数IP経由でのパスワード総当たりが理論上可能
——という2つの懸念があった。

**対応（コード側、完了済み）：** `src/components/TurnstileWidget.tsx`
（新規）と、ログイン・新規登録・パスワード再設定リクエストの各フォーム
への組み込みを実装済み。`NEXT_PUBLIC_TURNSTILE_SITE_KEY`が未設定の間は
ウィジェット自体が表示されず、既存の動作と完全に同じ
（グレースフルデグレード）。next.config.tsのCSPにも
`challenges.cloudflare.com`を許可済み。Cloudflareが公開している
アカウント登録不要のテスト用サイトキー（`1x00000000000000000000AA`、
常に成功）を使い、ローカルで実際にウィジェットが表示・自動検証され、
Supabaseへの認証リクエストが正常に通ることまで確認済み。

**残作業（ユーザー自身が行う必要あり——アカウント作成を伴うためこの
セッションでは実施不可）：**
1. [Cloudflareダッシュボード](https://dash.cloudflare.com/)で無料アカウントを作成（未作成の場合）
2. **Turnstile** → **Add site** で新しいサイトを追加し、Site KeyとSecret Keyを取得
3. Vercelの環境変数に `NEXT_PUBLIC_TURNSTILE_SITE_KEY`（Site Key）を追加
4. Supabaseダッシュボード → **Authentication** → **Attack Protection**
   で有効化し、Secret Keyを設定
5. 再デプロイ

**検証：** `/login`にアクセスし、CAPTCHAウィジェットが表示され、チェック
完了後にログイン/新規登録ボタンが押せるようになることを確認する。

**手順：**
1. `migration/retrofit_admin_only_sync_runs.sql` を開き、
   `'REPLACE_WITH_YOUR_ADMIN_EMAIL'` を実際の管理者メールアドレスに
   置き換える
2. Supabase SQL Editorで実行する
3. Vercelの環境変数に `ADMIN_EMAIL`（同じメールアドレス）を追加する
4. 再デプロイする（環境変数追加後、Vercelダッシュボードから
   Redeployするか、次回のgit pushで反映される）

**検証：** 別のメールアドレスで新規登録し、`/admin/sync-status` に
アクセスしても閲覧できないことを確認する。管理者本人のメールアドレスで
ログインした場合は正常に閲覧できることも確認する（自己ロックアウトの
チェック）。

---

## 🟡 機能を実際に動かすために必要（現在は黙ってスキップされている）

### 2. Web Push通知（ウォッチリスト成立・週次ダイジェスト・価格更新アラート、全部）

**現状：** VAPID鍵未設定・`push_subscriptions`テーブル未作成のため、
3つのプッシュ通知cron（`check-watchlist`・`weekly-digest`・
`check-price-records`）はいずれも`{"skipped": true, "reason":
"vapid_not_configured"}`を返すだけで、実際には何も送信していない。

**手順：**
1. ローカルでVAPID鍵ペアを生成：
   ```
   node -e "console.log(require('web-push').generateVAPIDKeys())"
   ```
2. Vercelの環境変数に追加：
   - `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
3. `migration/retrofit_push_subscriptions.sql` をSupabase SQL Editorで
   実行（`push_subscriptions`テーブルを新規作成）
4. `migration/retrofit_add_watchlist_condition_was_met.sql` を実行
   （`watchlist_items.condition_was_met`列を追加——これが無いと
   「新規成立」の検知ができず、プッシュは送られない）
5. 再デプロイ

**検証：** `/watchlist` で通知を有効化し、実際に条件が成立する
ウォッチリスト項目を一時的に登録して、ブラウザに通知が届くか確認する
（確認後は削除する）。

### 3. 史上最高値・最安値アラート

**現状：** `cards`テーブルに`all_time_high_price`等の4列が無いため、
`refresh-prices`はこの機能を検出して黙ってスキップし続けている。

**手順：**
1. `migration/retrofit_add_price_records.sql` をSupabase SQL Editorで
   実行
2. 再デプロイ不要（コードは既にデプロイ済み——列の存在を検出した瞬間から
   自動的に機能し始める設計）

**検証：** 列追加の翌日以降、`refresh-prices`が処理したカードの
`all_time_high_price`/`all_time_low_price`にNULLでない値が入り始める
ことを`/admin/sync-status`経由、またはSupabaseのTable Editorで確認する。

### 4. 遊々亭（yuyu-tei）の日次自動追跡（カタログの74%）

**現状（2026-09-14更新）：** `refresh-yuyutei-prices`のcronはコード完成
済みで、`vercel.json`のcronエントリ含め`git push`済み（`origin/main`との
差分なしを確認済み）。残るはSupabase側のテーブル作成のみ。

**手順：** `migration/README.md`の「遊々亭の日次自動追跡を本番で有効に
する手順」セクション（15-23行目）を参照——`yuyutei_sync_runs`テーブルの
作成（`supabase/schema.sql`該当ブロック、admin email置き換え含む）と
`app_settings`テーブルの作成が必要。

---

## 🟢 データ整合性の強化（緊急ではないが望ましい）

### 5. `transactions.fee` 列

**現状：** アプリ側は`fee`列が無くてもエラー時に自動フォールバックする
設計になっているため、これが未実行でも壊れない。ただし手数料込みの
損益計算をしたい場合は必要。

**手順：** `migration/retrofit_add_transaction_fee.sql` を実行。

### 6. `cards`テーブルのCHECK制約

**現状：** アプリ側は常に正しい値しか書き込まない設計になっているため、
これが未実行でも実害は無い想定（未検証）。DB側でも保証したい場合のみ。

**手順：** `migration/retrofit_check_constraints.sql` 冒頭のSELECT文
（読み取り専用）を先に実行し、既存データが制約に違反していないことを
確認してから、ALTER TABLE文を実行する。

---

## 実行後の総合確認

すべて完了したら、`/admin/sync-status`（管理者アカウントでログイン）で
各cronの直近の実行結果を確認し、想定通りに動いているか（成功件数・
`syncRunLogged: true`等）をチェックすることを推奨する。
