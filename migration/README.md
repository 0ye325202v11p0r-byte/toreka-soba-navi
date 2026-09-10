# migration/

Supabaseへのデータ移行・検証用の一回限りのスクリプト置き場。実行には環境変数
`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY`（`NEXT_PUBLIC_SUPABASE_ANON_KEY`
を使うものは `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）が必要。

| ファイル | 役割 | 再実行の必要性 |
|---|---|---|
| `migrate.mjs` | Claude Artifact DBのエクスポート（`cards_export/`）をSupabaseへ一括投入する初回移行スクリプト | 実行済み。再実行は基本不要（冪等・upsert） |
| `backfill_source_urls.mjs` | 各カードの `card_number`+`set_name`+`rarity` から onepiece-card-atari.jp のURLを自動生成し `source_url` を埋める（Phase 2の自動更新に必須） | 新しくカードを追加した時に再実行すると便利 |
| `fix_c2.mjs` / `fix_null_cardnumbers.mjs` | データ品質監査で見つかった個別カードの誤りを直した使い捨てスクリプト（詳細はgitログ参照） | 再実行不要（履歴として残してあるだけ） |
| `audit_supabase_data.mjs` | 重複・極端値・欠落フィールド・スナップショット0件のカードなどを検出する統計的異常検知 | 大量にカードを追加/更新した後に実行すると良い |
| `test_rls.mjs` | anon（公開）キーだけを使い、RLS/権限設定が意図通り機能しているかを検証するセキュリティテスト | スキーマやRLSポリシーを変更した後は必ず再実行すること |
| `verify_pnl_logic.mjs` | `src/lib/pnl.ts` のFIFO損益計算ロジックを、手計算した期待値と突き合わせる検証スクリプト（単純購入・利益確定売却・複数ロットのFIFO消費順・複数カードの独立性・オーバーセル時の安全性の5シナリオ） | `pnl.ts` のロジックを変更したら必ず再実行すること（DB接続不要、`node migration/verify_pnl_logic.mjs` だけで動く） |
| `add_worlds_strongest_warriors.mjs` | sitemap-cards.xmlから発掘した「世界最強の戦士」(OP17)セットの新規カードを、個別ページのWebFetch検証済みデータ（カード名・価格・21日分の価格履歴）でSupabaseに追加した使い捨てスクリプト。同じ手法で他セットを拡充する際のテンプレートとしても使える | 再実行不要（既に実行済み・冪等ではないので再実行すると重複が発生する点に注意） |

`cards_export/` は移行元のArtifact DBのスナップショット（379件のJSON）。移行元がもう存在しないため、参考記録として残してある。
