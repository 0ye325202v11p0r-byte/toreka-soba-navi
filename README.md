# トレカ相場ナビ

ONE PIECEカードゲームの価格トラッカー。Claude Artifactのプロトタイプから、実際にサブスク課金できる本物のWebアプリへ移行中。

## 現在の進捗（2026-09-11時点）

- ✅ **Phase 1: コアアプリ**（DB・認証・マーケット一覧・個人ポートフォリオ）— 完成・動作確認済み
  - Supabase（Postgres + Auth）に847件のカードデータを収録（移行時379件 → 2026-09-11に「世界最強の戦士」セットで+29件 → 同日、サイト全体のsitemap-cards.xml（894件・全23の特別収録ボックス分）を精査して残り439件を追加。データソース側が個別ページを持つカードは現時点で網羅済み）
  - ログイン（メールのマジックリンク）
  - 個人ごとに独立したポートフォリオ（取引台帳ベース、FIFO損益計算で含み損益・実現損益を自動計算）
  - ウォッチリスト（価格条件のアラート登録）
  - 相場一覧（検索・弾フィルター・並び替え）、カード詳細（チャート・AI判定）、複数カード比較
  - スマホ対応・セキュリティヘッダー・RLS権限テスト・アクセシビリティ対応済み
- ✅ **Phase 2: 価格自動更新**（日次クロン）— 実装・動作確認済み
  - `/api/cron/refresh-prices` が844/847件のカードを自動追跡（残り3件=c9, c500, c503は印刷バリエーション混同の疑いがあるため意図的に対象外。詳細はgitログ参照）
  - 実行のたびに `sync_runs` テーブルに結果を記録し、`/admin/sync-status`（ログイン後）で可視化
  - AI判定コメントの文章も毎回の実行で数値と一致するよう再生成（当初は移行時のまま固定される不具合があったが修正済み）
  - `vercel.json` に日次スケジュール設定済み（デプロイ後に有効化）
  - 全378件を2回実行し、いずれも**成功率100%**を確認済み
  - ⚠️ **要判断：** Vercel Hobbyプランは関数の実行時間が最大60〜300秒、cronの頻度も1日1回までに制限されており、378件（約450秒かかる）を1回で処理しきれない。安全のため「時間切れになったら未処理分を次回に持ち越す」方式に変更済みなのでエラーにはならないが、**Hobbyのままだと全カードの更新が複数日おきになる**。毎日確実に全件更新したいなら Vercel Pro（月$20）が必要（詳細は計画ファイル参照）
- ⬜ **Phase 3: Stripe決済** — 未着手（Stripeアカウント作成が必要）
- ⬜ **Phase 4: メール通知** — 未着手（Resendアカウント作成が必要）

詳細な計画・進捗ログは `C:\Users\windows10\.claude\plans\kind-watching-cupcake.md` を参照。

## 🌅 起きたらまずやること

1. **Vercelへのデプロイ**（所要時間 目安5〜10分）
   1. [vercel.com](https://vercel.com) を開き「Continue with GitHub」でログイン（GitHubアカウントは作成済み: `0ye325202v11p0r-byte`）
   2. ダッシュボードで「Add New」→「Project」
   3. リポジトリ一覧から `toreka-soba-navi` を選んで「Import」
   4. 環境変数（Environment Variables）の設定画面で、下記を1つずつコピペ（値は `.env.local` と同じ、このファイルの隣にあります）：
      - `NEXT_PUBLIC_SUPABASE_URL`
      - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
      - `SUPABASE_SERVICE_ROLE_KEY`
      - `CRON_SECRET`
   5. 「Deploy」をクリック → 数分で本番URLが発行される
   6. **注意**：Vercel Hobby（無料）プランは商用利用を禁止しているため、Phase 3でStripe決済を有効化する前に Vercel Pro（月$20）への切替が必要になる見込み
2. **デプロイ後、実際にブラウザで確認**
   - 本番URLでトップページが開けるか
   - ログイン（自分のメールアドレスでマジックリンクを受け取れるか）
   - ポートフォリオで実際に取引を1件記録し、含み損益が計算されるか
   - `/admin/sync-status` でクロンの実行履歴が見えるか（初回のVercel Cron実行は翌日になるので、最初は「まだ実行履歴がありません」と出るのが正常）
3. ここまで確認できたら、Phase 3（Stripe）に進むか、Claudeに次の指示を出してください

## セットアップ（ローカル開発）

```bash
npm install
cp .env.local.example .env.local  # 値を埋める（Supabaseの3つの値は既に設定済みのはず）
npm run dev
```

## データベーススキーマ

`supabase/schema.sql` を Supabase の SQL Editor で実行済み（cards, price_snapshots, profiles, transactions, watchlist_items, subscriptions, sync_runs の7テーブル）。スキーマを変更した場合は、追加分のSQLだけをもう一度SQL Editorで実行すればよい（全体は`create table if not exists`で冪等）。

## 価格自動更新を手動で試す

```bash
# 3件だけテスト
curl "http://localhost:3000/api/cron/refresh-prices?limit=3" -H "Authorization: Bearer <CRON_SECRETの値>"

# 全件（378件、約8分）
curl "http://localhost:3000/api/cron/refresh-prices" -H "Authorization: Bearer <CRON_SECRETの値>"
```

## 次にやること（優先順）

1. Vercelへのデプロイ（上記チェックリスト参照）
2. Phase 3: Stripe決済の実装
3. Phase 4: メール通知の実装
4. c9（唯一の自動更新対象外カード）の赤文字バリエーションの実測データソースが見つかれば追跡を再開
5. AI市場サマリー機能の実装可否判断（有料Claude APIが必要なため、ユーザー判断待ち）

## データの正確性について

このセッションで、店頭平均価格と個人間フリマ（メルカリ等）の実売価格には差があることが判明している。価格データは複数のカードショップの平均価格であり、フリマ相場とは別の指標。UIにもその旨を明記している。

また、データ移行時に2件の重大なデータ誤り（c9, c2 — 印刷バリエーションの取り違え）を発見・修正済み。同種のリスクがある「品番が特殊な34件」は全件、実際のページと照合して検証済み（詳細はgitのコミット履歴参照、特に `04ff55c` と `7baef21`）。
