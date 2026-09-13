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

### 1. `/admin/sync-status` の管理者限定アクセス制御

**現状の懸念：** ログイン済みの任意ユーザー（パスワードレスの新規登録
含む）が、cronの実行履歴・内部カードID・エラー内容を閲覧できてしまう
可能性がある。

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

**現状：** `refresh-yuyutei-prices`のcronはコード完成済みだが、本番への
デプロイ自体（`vercel.json`のcronエントリ・関連コミット）が一切
反映されていない可能性がある。

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
