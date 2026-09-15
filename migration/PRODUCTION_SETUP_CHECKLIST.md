# 本番セットアップ・チェックリスト

このファイルは新規作成のみ（本番DBへの書き込み・デプロイは一切行っていない）。
これまで`migration/README.md`・各`retrofit_*.sql`・`supabase/schema.sql`に
散らばっていた「本番でまだ実行/設定されていないはずの項目」を、実行順に
1つにまとめたもの。**未完了の項目は全てユーザー自身がSupabase SQL Editor /
Vercelダッシュボードで行う必要がある**（このセッションは本番DBへの書き込み・
Vercelの環境変数設定を一切行っていない — 自己申告した制約による）。項目1・
1bは2026-09-13にユーザー本人により完了済み（該当箇所に明記）。

**2026-09-15更新：** サービスロールキーで本番Supabaseに直接クエリし、
項目2〜5のテーブル・列は全て本番に既に存在することを確認した（このファイル
は以前ガイド作業直後に更新し忘れていて、しばらく実態より古い内容のままに
なっていた）。残っている作業は実質的に**Vercelの環境変数2つ
（`VAPID_PRIVATE_KEY`・`NEXT_PUBLIC_TURNSTILE_SITE_KEY`）だけ**——どちらも
ユーザー本人の操作が必要（前者はこのセッションの秘密値自動入力ブロック、
後者はCloudflareアカウント作成が必要なため）。項目6（CHECK制約）のみ
未確認・任意。

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

### 1c. CAPTCHA（Cloudflare Turnstile + Supabase Attack Protection）✅ 完了（2026-09-15、本番`/login`で実際に検証成功まで確認済み）

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

**進捗（2026-09-15）：** ユーザー本人がCloudflareアカウントを作成済み。
Turnstileウィジェット（名前「トレカ相場ナビ」、ホスト名
`toreka-soba-navi.vercel.app`、Managedモード）を作成し、発行された
Site Key（`NEXT_PUBLIC_TURNSTILE_SITE_KEY`、非秘密のため今回このセッションが
Vercelに設定・再デプロイ済み）とSecret Key（秘密情報のため未設定——
ユーザー自身の入力が必要）を取得済み。

ユーザー本人がSupabaseダッシュボード → **Authentication** →
**Attack Protection** でCaptcha providerをTurnstileに変更しSecret Keyを
設定・保存。本番`/login`にアクセスし、Turnstileウィジェットが表示され
「成功しました！」と自動検証まで通ることを実際に確認済み。

**検証：** `/login`にアクセスし、CAPTCHAウィジェットが表示され、チェック
完了後にログイン/新規登録ボタンが押せるようになることを確認する。

---

## 🟡 機能を実際に動かすために必要（現在は黙ってスキップされている）

### 2. Web Push通知（ウォッチリスト成立・週次ダイジェスト・価格更新アラート、全部）✅ DB側は完了（2026-09-15、本番Supabaseに直接クエリして確認済み）・残るはVercel環境変数のみ

**現状（2026-09-15、本番を直接確認）：** `push_subscriptions`テーブル・
`watchlist_items.condition_was_met`列は**本番に既に存在**。Supabase側の
作業は完了している。残っているのはVercelの環境変数だけ：
- `NEXT_PUBLIC_VAPID_PUBLIC_KEY` ✅ 設定済み（2026-09-15確認）
- `VAPID_PRIVATE_KEY` ❌ **未設定**——これが無い限り3つのプッシュ通知cron
  はいずれも`{"skipped": true, "reason": "vapid_not_configured"}`を
  返すだけで、実際には何も送信しない。値そのものはこのセッションの
  自動入力ツールが「秘密鍵らしき値をフォームに入力する操作」を安全機構
  でブロックするため、**ユーザー本人がVercelダッシュボードで直接入力する
  必要がある**（キー名は入力済みで、値の入力欄が開いたところで止まって
  いる——`settings/environment-variables`から「Add Environment Variable」
  で`VAPID_PRIVATE_KEY`を追加すればよい。値はローカルで生成済みのはず、
  無ければ`node -e "console.log(require('web-push').generateVAPIDKeys())"`
  で再生成）。

**手順（残りはこれだけ）：**
1. Vercelの環境変数に `VAPID_PRIVATE_KEY` を追加（Type: Secret）
2. 再デプロイ

**検証：** `/watchlist` で通知を有効化し、実際に条件が成立する
ウォッチリスト項目を一時的に登録して、ブラウザに通知が届くか確認する
（確認後は削除する）。

### 3. 史上最高値・最安値アラート ✅ 完了（2026-09-15、本番Supabaseに直接クエリして確認済み）

`cards.all_time_high_price`/`all_time_low_price`等の列は本番に既に存在。
`refresh-prices`は列の存在を検出した瞬間から自動的に機能する設計なので、
これ以上の作業は不要。

**検証：** `/admin/sync-status`、またはSupabaseのTable Editorで
`all_time_high_price`/`all_time_low_price`にNULLでない値が入っている
ことを確認できる。

### 4. 遊々亭（yuyu-tei）の日次自動追跡（カタログの74%）✅ 完了（2026-09-15、本番Supabaseに直接クエリして確認済み）

`yuyutei_sync_runs`・`app_settings`テーブルは本番に既に存在。コードも
`git push`済みなので、これ以上の作業は不要。

---

## 🟢 データ整合性の強化（緊急ではないが望ましい）

### 5. `transactions.fee` 列 ✅ 完了（2026-09-15、本番Supabaseに直接クエリして確認済み）

`transactions.fee`列は本番に既に存在。これ以上の作業は不要。

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
