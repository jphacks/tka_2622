# セットアップとデータ運用ガイド

「ものさき。」をローカルで動かす手順と、Supabase へのデータ取り込み・ライセンス運用の詳細です。
プロダクトの概要は [README](../README.md) を参照してください。

## 必要なもの

- Node.js（Next.js 16 がサポートするバージョン）
- npm
- Supabase プロジェクト
- AI機能を利用する場合は DashScope API キー

## セットアップ

1. 依存パッケージをインストールします。

   ```bash
   npm ci
   ```

2. `.env.local.example` を `.env.local` にコピーし、利用する Supabase プロジェクトと AI モデルの値を設定します。
3. 次の Supabase migration を記載順に実行します。

   1. [駅・リユース事業者データ](../supabase/migrations/20261017081000_create_tokyo_reuse_directory.sql)
   2. [ユーザーの持ち物・認証設定](../supabase/migrations/20261017100000_create_private_user_inventory.sql)
   3. [引っ越し日・整理プラン](../supabase/migrations/20261017230000_add_move_date_and_user_move_plans.sql)
   4. [保存済みプランの削除](../supabase/migrations/20261018120000_add_move_plan_deletion.sql)
   5. （任意）[OSM 営業時間列](../supabase/migrations/20261018130000_add_osm_opening_hours.sql) — 営業時間補完スクリプトを `--apply` で使う場合のみ

   migration は Supabase SQL Editor で手動適用してください。アプリ起動時にリモートの schema は変更しません。
4. 開発サーバーを起動します。

   ```bash
   npm run dev
   ```

5. ブラウザーで `http://localhost:3000` を開きます。ログイン用ユーザーは Supabase Auth で管理者が作成してください。公開自己登録は提供していません（[認証設定](./SUPABASE_AUTH_SETUP.md)）。

## 環境変数

`.env.local.example` を参照してください。主な設定項目は次のとおりです。

| 変数 | 用途 |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase の Publishable Key |
| `SUPABASE_SERVICE_ROLE_KEY` | サーバー専用。OSM候補の取得・公開 API とデータ取り込みに使用 |
| `DASHSCOPE_API_KEY` | サーバー専用。Qwen API 認証 |
| `QWEN_BASE_URL` | DashScope 互換 API のベース URL |
| `QWEN_VISION_MODEL` | 写真認識に使用するモデル |
| `QWEN_TEXT_MODEL` | 引っ越しプラン生成に使用するモデル |

Service Role Key と DashScope API キーはサーバー専用です。`NEXT_PUBLIC_` を付けず、`.env.local` を Git に追加したり、公開先やチャットに貼り付けたりしないでください。`.env.local` は `.gitignore` 対象です。

## チェック

```bash
npm run typecheck
npm run lint
npm test
```

## Supabase の設定とデータ取り込み

1. `.env.local` に `NEXT_PUBLIC_SUPABASE_URL` と
   `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` を設定します。これらは読み取り専用の
   publishable key としてサーバー側 Provider が使用します。
2. Supabase SQL Editor で
   `supabase/migrations/20261017081000_create_tokyo_reuse_directory.sql` を実行します。
3. `SUPABASE_SERVICE_ROLE_KEY` は CSV インポート時だけ必要です。ローカル
   `.env.local` にだけ設定し、`NEXT_PUBLIC_` を付けたり、ソース管理やチャットに
   貼り付けたりしないでください。publishable key は書き込みには使えません。
4. まず `python scripts/import-tokyo-reuse-data.py` で CSV を検証します。
   リモートへの書き込みは、明示的な確認後にだけ
   `python scripts/import-tokyo-reuse-data.py --apply` を実行してください。

インポートは `stations`、`businesses`、`station_businesses` の upsert のみを行います。
`sell_station_businesses.csv` は確認用サブセットとして検証し、独立したテーブルにはしません。
OSM 候補用テーブルは公式オープンデータの商店テーブルと分離し、匿名・認証済みクライアントからは読み出せません。

## 引っ越し整理プランの設定

1. `supabase/migrations/20261017230000_add_move_date_and_user_move_plans.sql` を
   Supabase SQL Editor で手動実行します。この migration は任意の引っ越し日とユーザーごとの
   整理プラン保存領域、本人だけが実行できる生成・保存 RPC を追加します。アプリから
   リモート schema を自動変更することはありません。
2. 保存済みプランの削除と再生成ボタンを有効にするには、
   [保存済みプランの削除 migration](../supabase/migrations/20261018120000_add_move_plan_deletion.sql)
   も Supabase SQL Editor で手動実行してください。
3. `.env.local` とデプロイ先の環境変数に `QWEN_TEXT_MODEL` を設定します。生成では
   `DASHSCOPE_API_KEY`、`QWEN_BASE_URL`、`QWEN_TEXT_MODEL` を使用します。たとえば
   `qwen3.7-plus` は Model Studio の文章生成および JSON object structured-output 対応モデルです。
   アカウントのリージョンで利用可能か Model Studio で確認してください。画像認識用の
   `QWEN_VISION_MODEL` はテキスト生成の代替には使いません。
4. `/items/plan` を開いただけでは AI は呼び出されません。ユーザーが生成・更新ボタンを
   押したときだけ保存済みの単品プランをまとめます。

## OSM 候補データのライセンスと表示

Geofabrik Kantō PBF から抽出した候補と駅距離対応は、別々の
`osm_business_candidates` / `station_osm_candidate_matches` テーブルに保管します。
インポートは `scripts/import-osm-candidates.py` で検証し、明示的な確認後に
`python scripts/import-osm-candidates.py --apply` を実行します。この importer は
既存 schema の `tags` JSONB に OSM タグと候補ソースメタデータを格納し、既存の
正式商店テーブルや `purchase_status` を変更しません。

OSM の候補抽出および駅距離対応は ODbL 1.0 に基づく派生データベースとして扱います。
本アプリは `© OpenStreetMap contributors` の表示、[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
へのリンクと [著作権・帰属表示](https://www.openstreetmap.org/copyright) を表示します。
候補・距離テーブル全体は `/api/open-data/osm-candidates` から機械可読 JSON として
取得でき、エクスポートにも ODbL 条件、Geofabrik 出典、国土交通省駅データの CC BY 4.0
出典を含めます。OSM 候補は公式の買取確認済み商店データに混ぜません。

この表示とダウンロード提供は ODbL の再利用条件への対応を意図した実装であり、
あらゆる配布・利用形態で法的義務を満たすという保証ではありません。公開・再配布前に
元の Geofabrik PBF の取得条件、ODbL の派生データベース／データベース利用条件、
第三者由来タグの権利を確認してください。OSM 候補は店名・位置・OSM 分類タグの調査手掛かりにすぎず、買取サービス、
営業状況、対象商品のいずれも独立確認済みという意味ではありません。

## OSM 営業時間の補完

既存の `businesses` データを再収集せず、`scripts/enrich_opening_hours.py` を手動で実行して
営業時間だけを補完できます。既に平日・休日の営業時間がそろっている店は対象外です。
既存の曜日・営業時間・住所・座標・出典列は変更せず、OSM の生の `opening_hours` と
OSM オブジェクト参照・出典情報を別列に保存します。

1. `python scripts/enrich_opening_hours.py` は既定で Dry Run です。Supabase から店舗データを読み取り、
   既定ではローカルの `D:\tokyo_reuse_656_stations_complete_pipeline (1)\output\`
   にある既存 OSM 候補 CSV 2 件を使用し、Overpass へはリクエストしません。ほかの場所の
   CSV を使う場合は `--osm-csv <path>` を複数指定できます。既存 CSV が見つからない場合だけ
   地理タイル単位の Overpass クエリへフォールバックします。既存の有効な Overpass タイル
   キャッシュも CSV の候補と合わせて検索に使います。CSV と新鮮な Overpass データを両方使う場合は
   `--live-overpass` を付けてください（キャッシュを無視する場合は `--live-overpass --refresh-cache`）。
   結果と OSM 出典が入った CSV は `.cache/opening-hours-enrichment/latest-report.csv` に保存されます。
2. `--apply` を使う場合に限り、事前に [OSM 営業時間列の migration](../supabase/migrations/20261018130000_add_osm_opening_hours.sql)
   を Supabase SQL Editor で手動実行してください。Dry Run だけなら migration は不要です。
3. Dry Run レポートを確認し、対象環境と書き込みを明示承認した後に限り、
   `python scripts/enrich_opening_hours.py --apply` を実行します。`--apply` には
   `SUPABASE_SERVICE_ROLE_KEY` と対話型の `APPLY <件数>` 確認が必要です。

自動照合は出典座標が確定しており、100m 以内に正規化後の店名が一意に完全一致した候補に限定します。
複数候補、名称差、未確定座標は CSV の人手確認対象です。OSM に営業時間タグがない場合は
`opening_hours` を NULL のままにし、営業時間を推測・生成しません。Overpass 応答はローカルで
7 日間キャッシュし、保存済み OSM ID は30日以内なら再照会を省略します。
新しいデータが必要な場合は `--refresh-cache` または `--recheck-days 0` を指定してください。

OSM データには `© OpenStreetMap contributors` の帰属表示と ODbL 1.0 の条件が適用されます。
生成レポートには候補ごとの OSM URL とライセンスを記録します。
