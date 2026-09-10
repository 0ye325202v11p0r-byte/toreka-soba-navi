# トレカ相場ナビ

ONE PIECEカードゲームの価格トラッカー。Claude Artifactのプロトタイプから、実際にサブスク課金できる本物のWebアプリへ移行中。

## 現在の進捗

- ✅ **Phase 1: コアアプリ**（DB・認証・マーケット一覧・個人ポートフォリオ）— 完成・動作確認済み
  - Supabase（Postgres + Auth）に379件のカードデータを移行済み
  - ログイン（メールのマジックリンク）
  - 個人ごとに独立したポートフォリオ（取引台帳ベース、FIFO損益計算で含み損益・実現損益を自動計算）
  - ウォッチリスト（価格条件のアラート登録）
  - 相場一覧（検索・弾フィルター・並び替え）、カード詳細（チャート・AI判定）、複数カード比較
  - スマホ対応済み
- ✅ **Phase 2: 価格自動更新**（日次クロン）— 実装・動作確認済み
  - `/api/cron/refresh-prices` が365件中345件のカードを自動追跡（残り34件は品番が特殊で自動URL生成の対象外、うち33件は手動検証済み）
  - 実行のたびに `sync_runs` テーブルに結果を記録（失敗検知用）
  - `vercel.json` に日次スケジュール設定済み（デプロイ後に有効化）
- ⬜ **Phase 3: Stripe決済** — 未着手（Stripeアカウント作成が必要）
- ⬜ **Phase 4: メール通知** — 未着手（Resendアカウント作成が必要）

詳細な計画は `C:\Users\windows10\.claude\plans\kind-watching-cupcake.md` を参照。

## セットアップ

```bash
npm install
cp .env.local.example .env.local  # 値を埋める（Supabaseの3つの値は既に設定済みのはず）
npm run dev
```

`.env.local` に必要な値：
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` — 設定済み
- `CRON_SECRET` — 設定済み（ランダム生成済みの値）
- Stripe・Resend関連は Phase 3/4 着手時に設定

## データベーススキーマ

`supabase/schema.sql` を Supabase の SQL Editor で実行済み（cards, price_snapshots, profiles, transactions, watchlist_items, subscriptions, sync_runs の7テーブル）。

## 価格自動更新を手動で試す

```bash
# 3件だけテスト
curl "http://localhost:3000/api/cron/refresh-prices?limit=3" -H "Authorization: Bearer <CRON_SECRETの値>"

# 全件（345件、約7分）
curl "http://localhost:3000/api/cron/refresh-prices" -H "Authorization: Bearer <CRON_SECRETの値>"
```

## 次にやること（優先順）

1. **Vercelへのデプロイ**（ユーザー操作が必要）
   - [vercel.com](https://vercel.com) で GitHub ログイン → 「Add New」→「Project」→ `toreka-soba-navi` リポジトリを Import
   - 環境変数を Vercel の Environment Variables に設定（`.env.local` と同じ内容）
   - デプロイ後、Vercel Cron が自動的に毎日 `/api/cron/refresh-prices` を実行するようになる
   - **注意**：Vercel Hobby（無料）プランは商用利用を禁止しているため、Stripe決済を有効化する前に Vercel Pro（月$20）への切替が必要になる見込み（詳細は計画ファイル参照）
2. Phase 3: Stripe決済の実装
3. Phase 4: メール通知の実装
4. 残り34件中の品番不明カード（c353など）の追跡URL確定
5. AI市場サマリー機能の実装可否判断（有料Claude APIが必要なため、ユーザー判断待ち）

## データの正確性について

このセッションで、店頭平均価格と個人間フリマ（メルカリ等）の実売価格には差があることが判明している。価格データは複数のカードショップの平均価格であり、フリマ相場とは別の指標。UIにもその旨を明記している。

また、データ移行時に2件の重大なデータ誤り（c9, c2 — 印刷バリエーションの取り違え）を発見・修正済み。同種のリスクがある「品番が特殊な34件」は個別に実際のページと照合して検証済み（詳細はgitのコミット履歴 `04ff55c` 参照）。
