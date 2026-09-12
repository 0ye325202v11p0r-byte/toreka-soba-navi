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

## ⚠️ 遊々亭の日次自動追跡（2026-09-12実装）を本番で有効にする手順（未実施）

`/api/cron/refresh-yuyutei-prices`はコード・テストとも完成していますが、**本番へは一切反映していません**（push・デプロイ・本番DB変更は今回のセッションで意図的に行っていません）。実際に有効化するには、ユーザー自身が以下を順に行う必要があります：

1. Supabase SQL Editorで`supabase/schema.sql`の`yuyutei_sync_runs`テーブル定義（`create table if not exists`のブロック）と`app_settings`テーブル定義（同ブロック内の初期行insertまで含む）を実行する（どちらも新規テーブルなので、既存テーブルへの影響なし）。**実行前に、`yuyutei_sync_runs`のポリシー内`'REPLACE_WITH_YOUR_ADMIN_EMAIL'`を実際の管理者メールアドレス（`.env.local`の`ADMIN_EMAIL`と同じ値）に置き換えること**——詳細は下記「🔒 `/admin/sync-status`のアクセス制御修正」参照。
2. このリポジトリを通常通りgit push（→Vercelが自動デプロイ）。これで`vercel.json`に追加済みの新規cronエントリ（`/api/cron/refresh-yuyutei-prices`、毎日UTC20:30）が有効になります。
3. デプロイ後、`/admin/sync-status`の「参考価格（yuyu-tei.jp・単一店舗）」セクションで初回実行を確認してください。

これらを行うまでは、遊々亭ソースの2,426件は引き続き登録時点の価格のまま自動更新されません（現状と変わりません）。

## 🔒 `/admin/sync-status`のアクセス制御修正（2026-09-12、セルフレビューで発見・未反映）

**⚠️ これは本番（https://toreka-soba-navi.vercel.app、既にデプロイ・稼働中）に現在も存在する、実際に悪用可能な穴です。** `/admin/sync-status`は「ログイン済みかどうか」しかチェックしておらず、「管理者かどうか」は一度も検証していませんでした。本サイトのログインはパスワードレスのメールリンク方式（`signInWithOtp`）で許可リストも無いため、**任意のメールアドレスで誰でも新規登録した瞬間に、このページ（クロンの実行履歴・成功/失敗件数・内部カードIDを含む生のエラーサンプル）が閲覧できてしまう状態**でした。

さらに、ページ側のチェックだけでは不十分です。`sync_runs`/`yuyutei_sync_runs`テーブルのRLSポリシーが`auth.role() = 'authenticated'`（＝ログイン済みなら誰でも）のままだと、Supabaseの公開anonキー＋自分のログインセッションを使って、`/admin/sync-status`というページ自体を経由せずに、ブラウザの開発者ツールから直接テーブルを読むことができてしまいます。**ページの表示を止めるだけでなく、DB側のRLSポリシー自体を管理者のみに絞る必要があります。**

**有効化に必要な作業（このセッションでは実行不可・ユーザー自身の対応が必要）：**
1. Supabaseダッシュボードで、`migration/retrofit_admin_only_sync_runs.sql`の`'REPLACE_WITH_YOUR_ADMIN_EMAIL'`を実際の管理者メールアドレスに置き換えてから、SQL Editorで実行する（既存の`sync_runs`テーブル向け——`yuyutei_sync_runs`は上記手順1でschema.sqlから新規作成する際に同様の置き換えを行う）。
2. Vercelの環境変数に`ADMIN_EMAIL`（同じメールアドレス）を追加する。
3. このセッションが作成したコミット（`src/lib/adminAuth.ts`・`admin/sync-status/page.tsx`・`supabase/schema.sql`の該当箇所）を含めて`git push`し、Vercelに再デプロイさせる。

3つとも完了するまでは、本番の`/admin/sync-status`は引き続き「ログイン済みなら誰でも閲覧可能」な状態のままです。

**検証：** `src/lib/adminAuth.ts`の`isAdminUser()`は純粋関数として`migration/verify_admin_auth.mjs`（10アサーション）で検証済み（`ADMIN_EMAIL`未設定時は本人を含め誰も許可しないフェイルクローズを含む）。RLSポリシー自体（`auth.jwt() ->> 'email'`による比較）は本番DB照会禁止のため未実行・構文レビューのみ。

## 🛑 緊急停止スイッチ（`app_settings`、2026-09-12追加）

遊々亭から停止要請が来た場合、以下をSupabase SQL Editorで実行するだけで即座に（再デプロイ不要）対応できます：

```sql
update public.app_settings set value = 'false'::jsonb
  where key = 'yuyutei_source_enabled';
```

これにより：
- `refresh-yuyutei-prices`は次回実行時、yuyu-tei.jpへ**一切リクエストを送らず**即座に終了します（`{"disabled": true, ...}`を返すだけ）。
- 相場一覧・カード詳細ページから遊々亭ソースのカード（`data_quality: 'partial'`）が**即座に非表示**になります（詳細ページは404）。

再開する場合は`value`を`'true'::jsonb`に戻すだけです。

**設計（2026-09-12、Codexの独立レビューを受けて改訂）：** `src/lib/appSettings.ts`の`readYuyuteiSourceState()`は設定読み取りの結果を4状態に区別します——`enabled`（`value: true`）・`disabled`（`value: false`）・`unconfigured`（テーブルまたは行が存在しない＝そもそも未設定）・`unknown`（それ以外——クエリエラー・例外・タイムアウト・boolean以外の値）。この4つを使い分ける2つの関数があります：

- `isYuyuteiSourceEnabled()`（相場一覧・カード詳細・比較・sitemap等、**表示側**が使用）：`unconfigured`・`unknown`どちらもfail-open（表示を継続）。これらのページは外部への新規リクエストを発生させないため、一時的な読み取り失敗で全カタログの74%を非表示にする方が過剰反応だと判断。
- `canScrapeYuyutei()`／`readYuyuteiSourceState()`（`refresh-yuyutei-prices`の**スクレイプ実行ゲート**が使用）：`enabled`・`unconfigured`の時だけ実行を許可し、`disabled`はもちろん**`unknown`でもフェイルクローズ**（実行しない）。これが今回の改訂の核心です——修正前は「明示的にfalseに設定した後、次回実行時の設定読み取りがたまたま一時エラーになっただけ」でも「有効」とみなされ、停止したはずのスクレイプが再開しうる欠陥がありました（Codex独立レビュー、2026-09-12、静的コードレビューで発見・未再現）。

**trade-off（明記）：** `app_settings`テーブル自体が存在しない間（＝上記1のCREATE TABLEを実行していない間）は`unconfigured`と判定され、スクレイプは今まで通り実行されます——つまり**「停止を保証する」効果は、テーブルを作成した瞬間から初めて発生**します。テーブル未作成の状態は「まだ何も設定していない」であって「停止要請を受けた」ではないため、これは意図的な互換動作です（テーブル作成後は、読み取り失敗時もフェイルクローズで確実に止まります）。

**`isMissingTableError()`の精度（2026-09-12、Codexの独立再検証3回に渡って改訂・最終確定）：**
1. 初版は`message.includes("does not exist")`／`message.includes("schema cache")`という単純な部分文字列一致で「テーブル未作成」を判定しており、広すぎました（**列**が見つからないPostgRESTエラー`PGRST204`まで誤って「未設定」扱いしてしまう）。
2. 2回目の修正で「`app_settings`という名前を含む」＋「table/relation」＋「does not exist/could not find」の組み合わせに絞りましたが、これも実際のPostgres生エラー（列欠落、コード`42703`）のメッセージ形式`column "app_settings.value" of relation "app_settings" does not exist`を偶然満たしてしまい、依然として誤判定する余地が残っていました。
3. **最終的にCodexの助言に従い、メッセージ文字列に基づく推測を完全に廃止**。`code`が`42P01`または`PGRST205`（テーブル欠落の既知コードのみ）で、かつメッセージに`app_settings`という名前が含まれる場合だけを「unconfigured」と判定します。それ以外の全てのcode（`42703`等）・codeが存在しない場合は、無条件で`unknown`（フェイルクローズ）です。これにより、本番でまだ観測していないエラー形式は全て安全側（スクレイプ停止）に倒れ、実際に本番でテーブル作成後にエラーが発生した場合は、その具体的な形状を確認してから個別に互換対応を追加する方針とします（推測による事前対応はしない）。

**検証：** `migration/verify_app_settings.mjs`（27アサーション、4状態の判定・isYuyuteiSourceEnabled/canScrapeYuyuteiの使い分け・**列欠落エラー(PGRST204)/別テーブルのエラー/関数欠落エラー(PGRST202)/実際のPostgres列欠落エラー(42703)が全て`unknown`に分類されること**を検証）。`migration/verify_refresh_yuyutei_prices.mjs`にシナリオ追加（false・一般的なクエリエラー・例外・タイムアウト・不正値・列欠落エラー・別テーブルのエラー・**42703**の8パターン全てで実際のfetch回数が0であることを確認、加えてテーブル未作成状態では通常通り57セット全て実行されることも確認）。計73アサーション全PASS。

**タイムアウトテストについて明記（Codexからのご質問への回答）：** `verify_app_settings.mjs`/`verify_refresh_yuyutei_prices.mjs`の「タイムアウト」シナリオは、`AbortSignal.timeout(5000)`が実際に5秒後に発火することを実時間で検証するテストでは**ありません**。モックの`maybeSingle()`が即座に`throw new Error("...timeout...")`相当の例外を投げるようにした、**「読み取りが何らかの理由で例外を投げた場合に正しく`unknown`として扱われるか」という分類ロジックの検証**です。実際に`AbortSignal.timeout()`がSupabaseのクエリチェーンに正しく接続され、指定した時間で確実に発火するかどうかの実時間ベースの検証は行っていません（この点は他のcronルートの時間予算テストと同様、実時間の境界はこのプロジェクトのモックベーステストの対象外という既存の方針を踏襲しています）。

| ファイル | 役割 | 再実行の必要性 |
|---|---|---|
| `migrate.mjs` | Claude Artifact DBのエクスポート（`cards_export/`）をSupabaseへ一括投入する初回移行スクリプト | 実行済み。再実行は基本不要（冪等・upsert） |
| `backfill_source_urls.mjs` | 各カードの `card_number`+`set_name`+`rarity` から onepiece-card-atari.jp のURLを自動生成し `source_url` を埋める（Phase 2の自動更新に必須）。2026-09-12セルフレビューで追加：`data_quality === 'partial'`（yuyu-tei由来）または既存`source_url`が`yuyu-tei.jp`を含むカードを明示的にスキップするよう修正——yuyu-tei由来カードのset_name（yuyu-teiのページタイトルから取得）やパラレルレアリティ表記（「Rパラレル」等）が、このスクリプトのSET_SLUG/RARITY_CODEマップ（元々onepiece-card-atari.jp用）と偶然一致するケースがあり、修正前は再実行時にyuyu-tei由来カードの正しいsource_urlを誤ったonepiece-card-atari.jp URLで上書きしてしまう可能性があった（本番での実害は未確認——git履歴上、yuyu-tei拡充後にこのスクリプトが再実行された形跡はない） | 新しくカードを追加した時に再実行すると便利 |
| `fix_c2.mjs` / `fix_null_cardnumbers.mjs` | データ品質監査で見つかった個別カードの誤りを直した使い捨てスクリプト（詳細はgitログ参照） | 再実行不要（履歴として残してあるだけ） |
| `audit_supabase_data.mjs` | 重複・極端値・欠落フィールド・スナップショット0件のカードなどを検出する統計的異常検知 | 大量にカードを追加/更新した後に実行すると良い |
| `test_rls.mjs` | anon（公開）キーだけを使い、RLS/権限設定が意図通り機能しているかを検証するセキュリティテスト。2026-09-12、`app_settings`（anon読み取り可・書き込み不可——書き込み可だと誰でも緊急停止スイッチを操作できてしまう）・`yuyutei_sync_runs`（anonからは空）のチェックを追加（項目6-9）。同日、`sync_runs`/`yuyutei_sync_runs`のポリシーを「authenticated全員」から「管理者のみ」に修正した際、項目8のコメントも更新——**anonキーだけのテストでは、この2つのポリシーの違い（authenticated全員 vs 管理者のみ）を区別できない**（anonはどちらでも0件）ため、「ログイン済みだが管理者ではない」ユーザーが実際にブロックされることの検証は、このスクリプトではまだ行えていない | スキーマやRLSポリシーを変更した後は必ず再実行すること。**本番DB照会禁止の期間中は実行していない**（`app_settings`/`yuyutei_sync_runs`テーブルがまだ本番に存在しないため、項目6-9は現状エラーになる想定——テーブル作成後、本番アクセスが許可されたタイミングで実行すること） |
| `verify_pnl_logic.mjs` | `src/lib/pnl.ts` の実体を直接importして、手計算した期待値と突き合わせる検証スクリプト。2026-09-11に独立レビューの指摘を受け、手書きのコピー実装を検証する方式から本体を直接importする方式に変更（コピーだと本体が変わってもテストが追従しない）。2026-09-12、独立レビュー（Codex）のpnl.tsコードレビューを受けてカバレッジを点検し、未検証だった2ケースを追加：①同日タイブレーク（同じtransaction_dateの2件の買付で、入力配列の並び順ではなくcreated_atの早い方がFIFOで先に消費されることを確認。配列順で消費した場合と結果が異なるよう設計し、退行を検出できることを確認済み）、②computePnlが入力配列・オブジェクトを変更しないこと（JSON比較で呼び出し前後が完全一致することを確認）。単純購入・利益確定売却・複数ロットのFIFO消費順（別日）・複数カードの独立性・オーバーセル時の安全性と合わせて計7シナリオ・18アサーション | `pnl.ts` のロジックを変更したら必ず再実行すること（DB接続不要）。`node --experimental-strip-types migration/verify_pnl_logic.mjs` で実行（Node 24の型ストリッピング機能を使って.tsを直接import。MODULE_TYPELESS_PACKAGE_JSONという警告がstderrに出るが無害） |
| `add_worlds_strongest_warriors.mjs` | sitemap-cards.xmlから発掘した「世界最強の戦士」(OP17)セットの新規カードを、個別ページのWebFetch検証済みデータ（カード名・価格・21日分の価格履歴）でSupabaseに追加した使い捨てスクリプト | 再実行不要（既に実行済み） |
| `find_new_candidates.mjs` | サイト全体の`sitemap-cards.xml`（生XMLを直接取得・自前パース。WebFetchの要約は大規模リストで抽出漏れ・混同が起きたため不使用）を、既存Supabaseデータ（card_number+rarity）と突き合わせ、未収録の候補一覧を`new_candidates.json`に出力する | カードデータをさらに拡充したくなったら再実行。事前に`node migration/sitemap-cards-raw.xml`相当の生XMLを取得する処理を内包していないので、実行前に別途sitemapを取得する必要がある（スクリプト冒頭のコメント参照） |
| `expand_catalog.mjs` | `new_candidates.json`の各URLを実際にfetchし、ページに埋め込まれたChart.jsの生データ（labels/data配列、通常25〜30週分の実測価格）を正規表現で直接パースして、WebFetch要約より遥かに正確な価格履歴を取得。本番cronと同じ礼儀正しいレート制限（1.2〜1.3秒間隔・正直なUser-Agent）でSupabaseに投入する。`--start N` `--limit N`で分割実行・再開が可能 | カードデータをさらに拡充する際の主力スクリプト。2026-09-11時点で`sitemap-cards.xml`の全894件（23の特別収録ボックス分）を処理済み＝このデータソースからは事実上枯渇状態。**このサイトは「特別収録ボックス」のパラレル/チェイスカードのみを個別ページ化しており、OP01〜OP17などメインブースターの通常レアリティ（ノーマルのC/UC/R/SR等）は元々サイトに個別ページが存在しない**（`sitemap-expansions.xml`で全23セットを確認済み・他に隠れたセットなし）。この通常レアリティのギャップは`scrape_yuyutei.mjs`（第2のデータソース）で埋めた |
| `fix_op13_r_variant_bugs.mjs` | 拡充中の監査で発見した印刷バリエーション混同バグ2件（c500, c503）の修正。パターンはc9/c2と同一（直近2件のスナップショットだけ別バリエーションの価格に汚染されている） | 再実行不要（既に実行済み） |
| `scrape_yuyutei.mjs` | 第2のデータソース、yuyu-tei.jp（遊々亭）の店頭販売価格を取得。`--sets op01,op02,...`でセットのURLスラッグを指定（1セット=1フェッチで全カードのレアリティ・価格を取得できる効率的な構造）。`--dry-run`で実投入せず件数だけ確認可能。取得したカードは`data_quality: 'partial'`として投入される（詳細はスクリプト冒頭のコメントとREADME.mdの「カードデータの収録範囲」参照）。cross-set（Don!!カード等、別セット由来の番号を持つカード）は誤ったset_name付与を避けるため自動的にスキップする。2026-09-12、HTML解析ロジック（`parseSetPage`等）を`src/lib/yuyuteiParser.ts`に切り出し、このスクリプトと新設の`refresh-yuyutei-prices/route.ts`が同じ実装を共用するよう変更（挙動は変わっていない） | OP01〜OP17（17主要セット）・ST01〜ST36（全スターターデッキ）・EB01〜EB04（全エクストラブースター）は2026-09-11に実行済み。プロモ（P-XXX）はまだ未実行 — さらに拡充する場合の次の候補 |
| `verify_yuyutei_parser.mjs` | `src/lib/yuyuteiParser.ts`の`parseSetPage`本体を直接importする回帰テスト。実際に2026-09-12にyuyu-tei.jpから取得した実物のHTML断片（`_test_fixtures/yuyutei_op01_sample.html`、手書きではない）を使い、セット名・カード番号・カード名・価格・レアリティラベル→この案件のレアリティ文字列へのマッピングを検証。`ALL_YUYUTEI_SETS`（57セット、OP17+ST36+EB4）の件数・重複なしも確認。計17アサーション | `yuyuteiParser.ts`を変更したら必ず再実行。yuyu-tei.jpのページ構造が変わった場合、この回帰テストではなく手動での再確認が必要（構造変化そのものはこのテストでは検出できない——固定フィクスチャに対する検証のため） |
| `verify_refresh_yuyutei_prices.mjs`（`_test_mocks/`を共用） | 2026-09-12新設：`refresh-yuyutei-prices/route.ts`の`GET`を実際にimportして実行する回帰テスト。3フェーズ（①57セットページのfetch、②既存`partial`カードのページネーション読み取り、③カード毎のupsert/history read/update）それぞれで時間予算切れが正しく次のI/Oを止めることを検証（同種のバグがrefresh-prices/check-watchlistの両方で見つかった過去の教訓をそのまま適用）。仮想時計・`global.fetch`モック（実物のフィクスチャHTMLを返す）・Supabaseモックを使用、実ネットワーク・実DB通信なし。`globalThis.setTimeout`もモックし、ルート内の`sleep(1500)`（57セット分の礼儀正しい間隔）が実時間を消費しないようにしている（予算判定は仮想`Date.now()`が担うため、実待機は検証したいことと無関係）。制御フロー・**緊急停止スイッチが`false`／一般的なクエリエラー／例外／タイムアウト／不正値／列欠落エラー／別テーブルのエラー／実際のPostgres列欠落エラー(42703)のいずれでも0件のfetch・0件のDB呼び出しで即終了すること（2026-09-12、Codexレビュー3回を受け追加）**・**テーブル未作成（`unconfigured`）時は通常通り実行されること**・**Phase2（既存カード読み取り）が予算切れで途中終了した場合、`incomplete`/`phase`/`itemsReadSoFar`で明示し、読めた分だけを`total`であるかのように偽装しないこと（2026-09-12、Codex独立レビューで発見・1500件/1ページ目で予算切れになる実際のケースを構築して再現）**・**ゼロ件解析検出（案C、2026-09-12）：未知セットの0件は誤警報にならないこと・既知セットの0件は診断リストに載ること・全セット0件で全体異常フラグが立つこと・正常系の4シナリオ**・一部セットのfetch失敗・カードのソース未検出（`notFoundInFetch`）・`yuyutei_sync_runs`未作成時のログ失敗を含む計101アサーション | `refresh-yuyutei-prices/route.ts`を変更したら必ず再実行（DB接続・外部通信なし） |
| `verify_app_settings.mjs` | `src/lib/appSettings.ts`の`readYuyuteiSourceState`/`isYuyuteiSourceEnabled`/`canScrapeYuyutei`本体を直接importする回帰テスト。2026-09-12、Codexの独立レビュー（静的コードレビュー2回）を受けて全面改訂：4状態（`enabled`/`disabled`/`unconfigured`/`unknown`）の判定、表示側（fail-open）とスクレイプゲート側（`unknown`もフェイルクローズ）の使い分け、`isMissingTableError()`の精度（列欠落・別テーブル・関数欠落・実際のPostgres列欠落エラー42703を「未設定」と誤判定しないこと）を計27アサーションで検証 | `appSettings.ts`を変更したら必ず再実行（DB接続不要） |
| `fix_html_entities.mjs` | `scrape_yuyutei.mjs`の初回実行時（HTMLエンティティのデコード処理を実装する前）に投入されたカード名に残っていた`&amp;`等のエンティティを一括修正した使い捨てスクリプト | 再実行不要（既に実行済み。スクリプト自体は修正済みなので今後は発生しない） |
| `fix_akaji_variants_real_source.mjs` | c9/c500/c503（印刷バリエーション混同で`data_quality: 'flat'`・未ソースの手動参考値のままだった3件）について、遊々亭に「特別パラレル」という別商品ページ（白文字版とは別のproduct ID）が存在することを発見し、実測ソース付きの`data_quality: 'partial'`に格上げした | 再実行不要（既に実行済み）。同種の「-R」サフィックスの赤文字カードが他にも見つかった場合のテンプレートとして使える |
| `fix_avg_window_bug.mjs` | 2026-09-11発見：avg30/avg90が「直近30/90件のスナップショット」を「直近30/90日」の代わりに使っていたバグ（`src/lib/priceStats.ts`の`computeStats`に集約・修正済み）の、既存カードへの一括再計算。カレンダー日付で日数を判定し直し、`data_quality='real'`の844件のうち438件（うち230件は割安/割高/適正の判定自体が変わっていた）を修正。`--apply`なしはdry-run | 再実行不要（既に実行済み）。同種のバグが再発した場合の修正テンプレートとして使える。`node --experimental-strip-types migration/fix_avg_window_bug.mjs --apply` で実行（`verify_pnl_logic.mjs`と同じNode 24の型ストリッピング機能を使用） |
| `verify_price_stats.mjs` | `src/lib/priceStats.ts`の`computeStats`本体を直接importする回帰テスト（`verify_pnl_logic.mjs`と同じ方式）。上記`fix_avg_window_bug.mjs`のバグが再発しないよう、密な日次履歴・疎な履歴（bulk import想定）・30日境界のフェンスポスト（29日前は含む・30日前は除く）・判定しきい値の4シナリオ、計13アサーションを検証 | `priceStats.ts`のロジックを変更したら必ず再実行すること（DB接続不要）。`node --experimental-strip-types migration/verify_price_stats.mjs` で実行 |
| `fix_verdict_wording.mjs` | 2026-09-11発見：`buildVerdictText()`（`src/lib/ai-verdict.ts`）の90日トレンド文の動詞（切り上がって/落ち着いて/安定して）が、90日平均比自体の大きさではなく30日ベースの`judgment`から選ばれていたため、「judgment='適正'だが90日平均比は+44.7%」のようなカードで「価格が安定してきた」という数値と矛盾する文言になっていた。動詞選択を`pctVsAvg90`自体の大きさ基準に修正し、既存844件のai_verdict_textを再生成（204件が変化） | 再実行不要（既に実行済み）。ロジック側は修正済みなので、日次cronの通常実行では常に正しい文言が生成される |
| `verify_cron_time_budget.mjs`（＋`_test_mocks/`） | 2026-09-11、独立レビュー（Codex）で発見：`refresh-prices/route.ts`のループ内で残り時間予算（`remainingMs`）がイテレーション開始時に一度だけ計算され、fetch後の3回のDB呼び出し（upsert・history select・cards update）全てで使い回されていた（修正はコミット462d471）。この回帰テストは`route.ts`の`GET`を**実際にimportして**実行する（コピーではない）。`_test_mocks/loader.mjs`というNodeモジュール解決フック（`node:module`の`register()`）で`@supabase/supabase-js`をモックへ差し替え、`@/...`パスエイリアスとNext.jsの`next/server`（package.jsonにexportsマップが無く素のNodeでは解決できない）を解決する。`Date.now()`とグローバル`fetch`もモックし、仮想時計で「fetch後」「upsert後」「history select後」の3箇所で予算切れを起こし、それぞれ次のDB呼び出しが一切発生しないこと（15アサーション）を検証 | `refresh-prices/route.ts`の時間予算まわりのロジックを変更したら必ず再実行すること（DB接続・外部通信なし）。`node --experimental-strip-types migration/verify_cron_time_budget.mjs` で実行。実時間の境界（Vercelの実際のmaxDurationに対する動作）はこのテストの対象外 |
| `verify_check_watchlist.mjs`（`_test_mocks/`を共用） | 2026-09-12、独立レビュー（Codex）2巡で発見の3件を修正・検証：①`alert_rule`はJSONBでスキーマ制約が無く（`not null`列制約はSQL NULLのみを禁止し、値としてのJSON null `'null'::jsonb`は防げない）、`conditionMet()`が無検証でこれを読むと例外を投げ、ループにper-item分離が無かったため1利用者の不正な行で全体が停止しうる状態だった（`isValidAlertRule()`で事前検証するよう修正）。②個別DBタイムアウト（10秒）だけでは、処理ループ内でトリガーする行が多い場合に`update`呼び出しの累積時間がmaxDuration(60秒)を超えうる状態だった（`TIME_BUDGET_MS=45_000`の全体予算ガードを処理ループに追加）。③【再レビューで指摘】②の予算ガードは処理ループにしか付いておらず、その前段のwatchlist_itemsページング読み取り・cards `.in()`チャンク読み取り自体には時間判定が無かったため、大きなテーブル/ID集合だとこの読み取り段階だけでmaxDurationを使い切りうる状態だった（両読み取りループにも予算チェックを追加し、予算切れ時は次のDB呼び出しを一切行わず`incomplete: true`＋`phase`で即座に返すよう修正。`totalItems`等を完了したかのように返さない）。`verify_cron_time_budget.mjs`と同じ方式で`route.ts`の`GET`を実際にimportして実行。JSON null・不正な型（type/op/valueが期待外）・処理ループでの時間予算超過・**watchlist_itemsページング途中の予算切れ（次のページが一切fetchされないことを呼び出し回数で確認）**・**cardsチャンク途中の予算切れ（同様に次のチャンクが一切fetchされないことを確認）**・コントロール（正常系）の6シナリオ、計36アサーション全てPASS | `check-watchlist/route.ts`のロジックを変更したら必ず再実行すること（DB接続・外部通信なし。本番DBへの読み取りアクセスも含め、検証は全てこのモック経由で行うこと）。`node --experimental-strip-types migration/verify_check_watchlist.mjs` で実行 |

`cards_export/` は移行元のArtifact DBのスナップショット（379件のJSON）。移行元がもう存在しないため、参考記録として残してある。
