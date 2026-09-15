# 和裁マッチ（wasai-match）

和裁士と、着物の仕立て・お直しを依頼したい人を直接つなぐマッチングサービス。ココナラ型（固定価格の「出品」＋要望を投げる「依頼掲示板」の両対応）。

このディレクトリは、リポジトリ内の既存プロダクト「トレカ相場ナビ」（ルート直下、ONE PIECEカードゲームの価格トラッカー）とは**完全に独立した別プロジェクト**です。`node_modules`・依存関係・DBスキーマ・デプロイ設定を一切共有しません。

## 現在の進捗（2026-09-15）

### Phase 1: マッチングの基本機能

- ✅ 認証（メール+パスワード、依頼者/和裁士の役割選択つき新規登録・ログイン・ログアウト）
  - トレカ相場ナビでの実運用の教訓を踏まえ、**最初からメール+パスワード方式のみ採用**（マジックリンクは不採用）。Supabaseのデフォルトメール送信は1時間あたり2通というプロジェクト共通の上限があり、公開の新規登録フォームとは根本的に相性が悪いため
  - Supabase Authの「Confirm email」設定をOFFにする前提（README下記セットアップ参照）。ONのままだと新規登録直後にセッションが発行されず、プロフィール作成が失敗する
- ✅ 和裁士プロフィール（資格級位・経験年数・得意分野・実績写真URL・受注可否）の編集・公開ページ・検索/絞り込み
- ✅ サービス出品（固定価格メニュー）のCRUD・一覧・詳細・依頼者からの依頼作成
- ✅ 依頼掲示板（見積り依頼の投稿・和裁士からの提案・依頼者による承諾/見送り→承諾で自動的に取引を作成）
- ✅ 取引ページ（ステータス管理・メッセージのやり取り・完了後のレビュー投稿）
- ✅ ダッシュボード（役割別に自分の依頼/出品/提案/取引を一覧表示）
- ✅ Supabase RLS（`supabase/schema.sql`）で全テーブルのアクセス制御を実装（サーバー側でservice roleを使わず、通常のログインユーザーとしてのクエリのみで権限が正しく効く設計）

### Phase 2: Stripe Connectによるエスクロー決済

「マッチングだけ提供して決済を挟まないと、2回目以降アプリの外（LINE等）で完結してしまい存在意義が薄れる」という指摘を受けて実装。

- ✅ 和裁士のStripe Connect（Express）オンボーディング（`/dashboard/payouts`）。振込先口座の登録・本人確認をStripeホスト画面で行う
- ✅ 取引はまず`pending_payment`（支払い待ち）状態で作成され、依頼者がStripe Checkoutで支払いを完了して初めて`in_progress`（作業開始）に進む——直接`destination charge`にせず、**プラットフォームの口座でいったん課金を受け、取引完了時に和裁士の接続アカウントへ`Transfer`で送金する「separate charges and transfers」方式**を採用。理由は、取引完了（依頼者の受領確認）より前に和裁士へ資金が渡ってしまう構成を避けるため
- ✅ 手数料は`src/lib/stripe.ts`の`PLATFORM_FEE_RATE`（現在15%）で一元管理。取引ページ・振込先設定ページ・フッターの表示は全てこの定数を参照するため、料率を変える場合は1箇所の変更で済む
- ✅ `/api/webhooks/stripe`：`checkout.session.completed`で支払い確定を検知し取引を`in_progress`へ、`account.updated`で和裁士のStripe側の本人確認状況（`stripe_transfers_enabled`）を追随更新。いずれもservice roleクライアントを使用（Stripeからの呼び出しにはユーザーセッションが無いため）
- ⚠️ **未検証**: 実際のStripeアカウント・Webhookの疎通は行っていない（このプロジェクトにはStripeの認証情報がない）。コードはStripe公式ドキュメントのAPI仕様に基づいて実装済みだが、test modeキーでの動作確認は次のステップとして必要
- ⬜ 返金フロー・キャンセル時の自動返金は未実装（`payment_status`に`refunded`の値は用意済みだが、実際にStripe Refundを叩く処理は無い。現状「キャンセルする」ボタンは取引ステータスを変えるだけで、支払い済みなら手動対応が必要）

### Phase 2': 資格級位限定の依頼（価格競争の回避策）

「提案制（依頼掲示板）は複数の和裁士が同じ案件に群がって買い叩き合う構造になりがち」という指摘への対策。

- ✅ 依頼投稿時に「資格級位の指定」（1級のみ／2級以上／3級以上／資格保有者のみ／指定なし）を設定可能（`requests.min_grade`）
- ✅ 資格要件を満たさない和裁士は`submitProposal`アクション側で提案自体をブロック（依頼詳細ページでも提案フォームの代わりに理由を表示）
- ✅ 依頼掲示板の一覧・詳細に「◯級以上限定」バッジを表示、一覧では資格指定での絞り込みも可能

### Phase 3: 相場データの公開ページ（差別化コンテンツ）

「専門特化のマッチングが勝つ条件は、その業界の構造データを持っていること」という指摘への対応。ココナラのような汎用マッチングには無い、和裁専門だからこそ集まるデータを公開する。

- ✅ `/market-rates`（ログイン不要）：実際に完了した取引を着物の種類別に集計し、件数・平均価格・最安・最高を公開。成立件数が3件未満の種類は非表示（少数サンプルだと個別の取引価格が事実上特定できてしまうため）
- ✅ 集計は`orders`テーブルへの直接アクセスではなく、`security definer`のPostgres関数（`market_rate_summary()`、`supabase/schema.sql`参照）経由。ordersテーブル自体のRLS（取引参加者のみ閲覧可）はそのまま維持しつつ、集計値だけを公開する設計

**未実装（意図的に見送り、次フェーズ）：**
- 📎 画像アップロード（Supabase Storage）。実績写真は現状「外部URLを貼り付ける」方式（`portfolio_urls`がtext[]）
- 🔔 通知（メール/プッシュ）。新着提案・新着メッセージのお知らせは未実装（ダッシュボードで能動的に確認する必要がある）
- 💬 メッセージのリアルタイム更新。現状はServer Actionで送信後にページを再検証する方式（送信すると自分の画面には即反映されるが、相手の画面は再読み込みが必要）
- 🔍 SEO（sitemap/robots/OGP画像等）。トレカ相場ナビには実装済みのパターンがあるので、必要になれば移植可能
- 🔑 パスワードリセットフロー
- 💸 Stripeの返金フロー（上記参照）

## セットアップ（ローカル開発）

```bash
cd wasai-app
npm install
cp .env.local.example .env.local  # Supabaseの値を埋める
npm run dev
```

### Supabaseプロジェクトの準備

1. 新しいSupabaseプロジェクトを作成（トレカ相場ナビとは別プロジェクトにすること — テーブル名が競合しないよう完全に分離する）
2. SQL Editorで `supabase/schema.sql` を**全文**実行（Phase 1〜3のテーブル・カラム追加・RLSポリシー・`market_rate_summary()`関数がすべて含まれる。`add column if not exists`等で冪等なので、スキーマ変更時は差分だけ再実行すればよい）
3. Authentication > Providers > Email で **「Confirm email」をOFF**にする（上記の理由により必須。ONのままだと新規登録後にプロフィール作成が失敗する）
4. Project Settings > API から `Project URL` / `anon public` キーを `.env.local` に設定

### Stripe Connectの準備（決済機能を使う場合）

1. Stripeアカウントを作成し、ダッシュボードでtest modeの `Secret key` を取得 → `.env.local`の`STRIPE_SECRET_KEY`
2. Stripeダッシュボード > Settings > Connect で、Express アカウントタイプを有効化
3. Webhookエンドポイント`https://<デプロイ先ドメイン>/api/webhooks/stripe`を登録し、`checkout.session.completed`と`account.updated`の2イベントを購読 → 発行されるsigning secretを`.env.local`の`STRIPE_WEBHOOK_SECRET`へ
   - ローカル開発では`stripe listen --forward-to localhost:3000/api/webhooks/stripe`を使うと、コマンドがそのままsigning secretを表示する
4. `NEXT_PUBLIC_SITE_URL`を実際のURLに設定（StripeのCheckout成功/キャンセルURL、Connectオンボーディングのreturn/refresh URLの生成に使われる）
5. Stripeが未設定の間は、出品への依頼・提案の承諾はいずれも「決済機能は準備中です」というエラーで止まる（取引が中途半端な状態で作成されることはない）

## ディレクトリ構成のポイント

- `src/lib/supabase/{client,server,middleware}.ts`：トレカ相場ナビと同じ`@supabase/ssr`ベースのCookie管理パターン
- `src/lib/supabase/admin.ts`：service roleクライアント。Stripe Webhook（`src/app/api/webhooks/stripe/route.ts`）のみが使用——ユーザーセッションが無いリクエストのため
- `src/lib/auth.ts`：サーバーコンポーネントから「ログイン中ユーザー＋自分のprofilesレコード」を1回で取得するヘルパー
- `src/lib/stripe.ts`：Stripeクライアントの初期化・手数料率（`PLATFORM_FEE_RATE`）の一元管理
- `src/lib/orderPayment.ts`：Checkout Session作成の共通処理（出品への直接依頼・提案承諾・支払いのやり直しの3箇所から呼ばれる）
- 各機能ディレクトリ（`services/`, `requests/`, `orders/`, `dashboard/payouts/`）配下の`actions.ts`：Server Actionでミューテーションを実装。RLSポリシーがそのまま権限チェックとして働くため、アプリケーションコード側で二重に権限判定ロジックを持たずに済む設計
- `supabase/schema.sql`：スキーマ変更時はこのファイルに追記し、Supabase側で再実行する運用（マイグレーション管理ツールは導入していない、MVPスコープ）

## デプロイ

トレカ相場ナビとは別のVercelプロジェクトとしてデプロイすることを想定。モノレポ内の別ディレクトリなので、Vercel側の「Root Directory」設定を `wasai-app` に指定する。
