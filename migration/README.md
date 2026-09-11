# migration/

Supabaseへのデータ移行・検証用の一回限りのスクリプト置き場。実行には環境変数
`SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY`（`NEXT_PUBLIC_SUPABASE_ANON_KEY`
を使うものは `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`）が必要。

⚠️ **新しいスクリプトを書くときの注意**：`cards`テーブルの全件を`.select()`する
処理は、必ずページネーション（`.range(from, from+999)`で1000件ずつ）すること。
Supabase/PostgRESTは明示的なlimit/rangeなしだと暗黙に1000件で打ち切る仕様で、
カタログが2026-09-11に1000件を超えた際、これに未対応だった複数のスクリプトと
本番の`src/app/page.tsx`で実際に問題が発生した（詳細はgitログとREADME.mdの
「カードデータの収録範囲」参照）。このディレクトリの既存スクリプトは全て
対応済みだが、新規スクリプトでは同じ落とし穴に注意すること。

| ファイル | 役割 | 再実行の必要性 |
|---|---|---|
| `migrate.mjs` | Claude Artifact DBのエクスポート（`cards_export/`）をSupabaseへ一括投入する初回移行スクリプト | 実行済み。再実行は基本不要（冪等・upsert） |
| `backfill_source_urls.mjs` | 各カードの `card_number`+`set_name`+`rarity` から onepiece-card-atari.jp のURLを自動生成し `source_url` を埋める（Phase 2の自動更新に必須） | 新しくカードを追加した時に再実行すると便利 |
| `fix_c2.mjs` / `fix_null_cardnumbers.mjs` | データ品質監査で見つかった個別カードの誤りを直した使い捨てスクリプト（詳細はgitログ参照） | 再実行不要（履歴として残してあるだけ） |
| `audit_supabase_data.mjs` | 重複・極端値・欠落フィールド・スナップショット0件のカードなどを検出する統計的異常検知 | 大量にカードを追加/更新した後に実行すると良い |
| `test_rls.mjs` | anon（公開）キーだけを使い、RLS/権限設定が意図通り機能しているかを検証するセキュリティテスト | スキーマやRLSポリシーを変更した後は必ず再実行すること |
| `verify_pnl_logic.mjs` | `src/lib/pnl.ts` の実体を直接importして、手計算した期待値と突き合わせる検証スクリプト（単純購入・利益確定売却・複数ロットのFIFO消費順・複数カードの独立性・オーバーセル時の安全性の5シナリオ）。2026-09-11に独立レビューの指摘を受け、手書きのコピー実装を検証する方式から本体を直接importする方式に変更（コピーだと本体が変わってもテストが追従しない） | `pnl.ts` のロジックを変更したら必ず再実行すること（DB接続不要）。`node --experimental-strip-types migration/verify_pnl_logic.mjs` で実行（Node 24の型ストリッピング機能を使って.tsを直接import。MODULE_TYPELESS_PACKAGE_JSONという警告がstderrに出るが無害） |
| `add_worlds_strongest_warriors.mjs` | sitemap-cards.xmlから発掘した「世界最強の戦士」(OP17)セットの新規カードを、個別ページのWebFetch検証済みデータ（カード名・価格・21日分の価格履歴）でSupabaseに追加した使い捨てスクリプト | 再実行不要（既に実行済み） |
| `find_new_candidates.mjs` | サイト全体の`sitemap-cards.xml`（生XMLを直接取得・自前パース。WebFetchの要約は大規模リストで抽出漏れ・混同が起きたため不使用）を、既存Supabaseデータ（card_number+rarity）と突き合わせ、未収録の候補一覧を`new_candidates.json`に出力する | カードデータをさらに拡充したくなったら再実行。事前に`node migration/sitemap-cards-raw.xml`相当の生XMLを取得する処理を内包していないので、実行前に別途sitemapを取得する必要がある（スクリプト冒頭のコメント参照） |
| `expand_catalog.mjs` | `new_candidates.json`の各URLを実際にfetchし、ページに埋め込まれたChart.jsの生データ（labels/data配列、通常25〜30週分の実測価格）を正規表現で直接パースして、WebFetch要約より遥かに正確な価格履歴を取得。本番cronと同じ礼儀正しいレート制限（1.2〜1.3秒間隔・正直なUser-Agent）でSupabaseに投入する。`--start N` `--limit N`で分割実行・再開が可能 | カードデータをさらに拡充する際の主力スクリプト。2026-09-11時点で`sitemap-cards.xml`の全894件（23の特別収録ボックス分）を処理済み＝このデータソースからは事実上枯渇状態。**このサイトは「特別収録ボックス」のパラレル/チェイスカードのみを個別ページ化しており、OP01〜OP17などメインブースターの通常レアリティ（ノーマルのC/UC/R/SR等）は元々サイトに個別ページが存在しない**（`sitemap-expansions.xml`で全23セットを確認済み・他に隠れたセットなし）。この通常レアリティのギャップは`scrape_yuyutei.mjs`（第2のデータソース）で埋めた |
| `fix_op13_r_variant_bugs.mjs` | 拡充中の監査で発見した印刷バリエーション混同バグ2件（c500, c503）の修正。パターンはc9/c2と同一（直近2件のスナップショットだけ別バリエーションの価格に汚染されている） | 再実行不要（既に実行済み） |
| `scrape_yuyutei.mjs` | 第2のデータソース、yuyu-tei.jp（遊々亭）の店頭販売価格を取得。`--sets op01,op02,...`でセットのURLスラッグを指定（1セット=1フェッチで全カードのレアリティ・価格を取得できる効率的な構造）。`--dry-run`で実投入せず件数だけ確認可能。取得したカードは`data_quality: 'partial'`・統計値なし・単発スナップショットとして投入される（詳細はスクリプト冒頭のコメントとREADME.mdの「カードデータの収録範囲」参照）。cross-set（Don!!カード等、別セット由来の番号を持つカード）は誤ったset_name付与を避けるため自動的にスキップする | OP01〜OP17（17主要セット）・ST01〜ST36（全スターターデッキ）・EB01〜EB04（全エクストラブースター）は2026-09-11に実行済み。プロモ（P-XXX）はまだ未実行 — さらに拡充する場合の次の候補 |
| `fix_html_entities.mjs` | `scrape_yuyutei.mjs`の初回実行時（HTMLエンティティのデコード処理を実装する前）に投入されたカード名に残っていた`&amp;`等のエンティティを一括修正した使い捨てスクリプト | 再実行不要（既に実行済み。スクリプト自体は修正済みなので今後は発生しない） |
| `fix_akaji_variants_real_source.mjs` | c9/c500/c503（印刷バリエーション混同で`data_quality: 'flat'`・未ソースの手動参考値のままだった3件）について、遊々亭に「特別パラレル」という別商品ページ（白文字版とは別のproduct ID）が存在することを発見し、実測ソース付きの`data_quality: 'partial'`に格上げした | 再実行不要（既に実行済み）。同種の「-R」サフィックスの赤文字カードが他にも見つかった場合のテンプレートとして使える |
| `fix_avg_window_bug.mjs` | 2026-09-11発見：avg30/avg90が「直近30/90件のスナップショット」を「直近30/90日」の代わりに使っていたバグ（`src/lib/priceStats.ts`の`computeStats`に集約・修正済み）の、既存カードへの一括再計算。カレンダー日付で日数を判定し直し、`data_quality='real'`の844件のうち438件（うち230件は割安/割高/適正の判定自体が変わっていた）を修正。`--apply`なしはdry-run | 再実行不要（既に実行済み）。同種のバグが再発した場合の修正テンプレートとして使える。`node --experimental-strip-types migration/fix_avg_window_bug.mjs --apply` で実行（`verify_pnl_logic.mjs`と同じNode 24の型ストリッピング機能を使用） |
| `verify_price_stats.mjs` | `src/lib/priceStats.ts`の`computeStats`本体を直接importする回帰テスト（`verify_pnl_logic.mjs`と同じ方式）。上記`fix_avg_window_bug.mjs`のバグが再発しないよう、密な日次履歴・疎な履歴（bulk import想定）・30日境界のフェンスポスト（29日前は含む・30日前は除く）・判定しきい値の4シナリオ、計13アサーションを検証 | `priceStats.ts`のロジックを変更したら必ず再実行すること（DB接続不要）。`node --experimental-strip-types migration/verify_price_stats.mjs` で実行 |
| `fix_verdict_wording.mjs` | 2026-09-11発見：`buildVerdictText()`（`src/lib/ai-verdict.ts`）の90日トレンド文の動詞（切り上がって/落ち着いて/安定して）が、90日平均比自体の大きさではなく30日ベースの`judgment`から選ばれていたため、「judgment='適正'だが90日平均比は+44.7%」のようなカードで「価格が安定してきた」という数値と矛盾する文言になっていた。動詞選択を`pctVsAvg90`自体の大きさ基準に修正し、既存844件のai_verdict_textを再生成（204件が変化） | 再実行不要（既に実行済み）。ロジック側は修正済みなので、日次cronの通常実行では常に正しい文言が生成される |
| `verify_cron_time_budget.mjs`（＋`_test_mocks/`） | 2026-09-11、独立レビュー（Codex）で発見：`refresh-prices/route.ts`のループ内で残り時間予算（`remainingMs`）がイテレーション開始時に一度だけ計算され、fetch後の3回のDB呼び出し（upsert・history select・cards update）全てで使い回されていた（修正はコミット462d471）。この回帰テストは`route.ts`の`GET`を**実際にimportして**実行する（コピーではない）。`_test_mocks/loader.mjs`というNodeモジュール解決フック（`node:module`の`register()`）で`@supabase/supabase-js`をモックへ差し替え、`@/...`パスエイリアスとNext.jsの`next/server`（package.jsonにexportsマップが無く素のNodeでは解決できない）を解決する。`Date.now()`とグローバル`fetch`もモックし、仮想時計で「fetch後」「upsert後」「history select後」の3箇所で予算切れを起こし、それぞれ次のDB呼び出しが一切発生しないこと（15アサーション）を検証 | `refresh-prices/route.ts`の時間予算まわりのロジックを変更したら必ず再実行すること（DB接続・外部通信なし）。`node --experimental-strip-types migration/verify_cron_time_budget.mjs` で実行。実時間の境界（Vercelの実際のmaxDurationに対する動作）はこのテストの対象外 |
| `verify_check_watchlist.mjs`（`_test_mocks/`を共用） | 2026-09-12、独立レビュー（Codex）で発見の2件を修正・検証：①`alert_rule`はJSONBでスキーマ制約が無く、JSON nullや不正な形が保存されうる。`conditionMet()`が無検証でこれを読むと例外を投げ、ループにper-item分離が無かったため1利用者の不正な行で全体が停止しうる状態だった（`isValidAlertRule()`で事前検証するよう修正）。②個別DBタイムアウト（10秒）だけでは、トリガーする行が多い場合に`update`呼び出しの累積時間がmaxDuration(60秒)を超えうる状態だった（`TIME_BUDGET_MS=45_000`の全体予算ガードを追加）。`verify_cron_time_budget.mjs`と同じ方式で`route.ts`の`GET`を実際にimportして実行。JSON null・不正な型（type/op/valueが期待外）・時間予算超過（複数件トリガーで累積超過）・コントロール（正常系）の4シナリオ、計16アサーション全てPASS | `check-watchlist/route.ts`のロジックを変更したら必ず再実行すること（DB接続・外部通信なし）。`node --experimental-strip-types migration/verify_check_watchlist.mjs` で実行 |

`cards_export/` は移行元のArtifact DBのスナップショット（379件のJSON）。移行元がもう存在しないため、参考記録として残してある。
