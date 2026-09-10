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
| `add_worlds_strongest_warriors.mjs` | sitemap-cards.xmlから発掘した「世界最強の戦士」(OP17)セットの新規カードを、個別ページのWebFetch検証済みデータ（カード名・価格・21日分の価格履歴）でSupabaseに追加した使い捨てスクリプト | 再実行不要（既に実行済み） |
| `find_new_candidates.mjs` | サイト全体の`sitemap-cards.xml`（生XMLを直接取得・自前パース。WebFetchの要約は大規模リストで抽出漏れ・混同が起きたため不使用）を、既存Supabaseデータ（card_number+rarity）と突き合わせ、未収録の候補一覧を`new_candidates.json`に出力する | カードデータをさらに拡充したくなったら再実行。事前に`node migration/sitemap-cards-raw.xml`相当の生XMLを取得する処理を内包していないので、実行前に別途sitemapを取得する必要がある（スクリプト冒頭のコメント参照） |
| `expand_catalog.mjs` | `new_candidates.json`の各URLを実際にfetchし、ページに埋め込まれたChart.jsの生データ（labels/data配列、通常25〜30週分の実測価格）を正規表現で直接パースして、WebFetch要約より遥かに正確な価格履歴を取得。本番cronと同じ礼儀正しいレート制限（1.2〜1.3秒間隔・正直なUser-Agent）でSupabaseに投入する。`--start N` `--limit N`で分割実行・再開が可能 | カードデータをさらに拡充する際の主力スクリプト。2026-09-11時点で`sitemap-cards.xml`の全894件（23の特別収録ボックス分）を処理済み＝このデータソースからは事実上枯渇状態。**このサイトは「特別収録ボックス」のパラレル/チェイスカードのみを個別ページ化しており、OP01〜OP17などメインブースターの通常レアリティ（ノーマルのC/UC/R/SR等）は元々サイトに個別ページが存在しない**（`sitemap-expansions.xml`で全23セットを確認済み・他に隠れたセットなし）。さらに枚数を増やすには、この1サイトへの依存を離れて別の相場サイト（カードラッシュ・遊々亭など）を新規に調査・スクレイピング対象に追加する必要があり、それは新しいrobots.txt確認や利用規約判断を伴う別スコープの作業になる |
| `fix_op13_r_variant_bugs.mjs` | 拡充中の監査で発見した印刷バリエーション混同バグ2件（c500, c503）の修正。パターンはc9/c2と同一（直近2件のスナップショットだけ別バリエーションの価格に汚染されている） | 再実行不要（既に実行済み） |

`cards_export/` は移行元のArtifact DBのスナップショット（379件のJSON）。移行元がもう存在しないため、参考記録として残してある。
