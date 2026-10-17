# サンプル（プロダクト名）

[![IMAGE ALT TEXT HERE](https://jphacks.com/wp-content/uploads/2026/07/IMG_5316.png)](https://www.youtube.com/watch?v=piaNsc6ilBI)

## 製品概要
### 背景(製品開発のきっかけ、課題等）
### 製品説明（具体的な製品の説明）
### 特長
#### 1. 特長1
#### 2. 特長2
#### 3. 特長3

### 解決出来ること
### 今後の展望
### 注力したこと（こだわり等）
* 
* 

## 開発技術
### 活用した技術
#### API・データ
* 
* 

#### フレームワーク・ライブラリ・モジュール
* 
* 

#### デバイス
* 
* 

### 独自技術
#### ハッカソンで開発した独自機能・技術
* 独自で開発したものの内容をこちらに記載してください
* 特に力を入れた部分をファイルリンク、またはcommit_idを記載してください。

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

## OSM 候補データのライセンスと表示

Geofabrik Kantō PBF から抽出した候補と駅距離対応は、別々の
`osm_business_candidates` / `station_osm_candidate_matches` テーブルに保管します。
インポートは `scripts/import-osm-candidates.py` で検証し、明示的な確認後に
`python scripts/import-osm-candidates.py --apply` を実行します。この importer は
既存 schema の `tags` JSONB に OSM タグと候補ソースメタデータを格納し、既存の
正式商店テーブルや `purchase_status` を変更しません。

OSM の候補抽出および駅距離対応は ODbL 1.0 に基づく派生データベースとして扱います。
本アプリは `© OpenStreetMap contributors` の表示、[ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/)
へのリンクと [著作権・归属说明](https://www.openstreetmap.org/copyright) を表示します。
候補・距離テーブル全体は `/api/open-data/osm-candidates` から機械可読 JSON として
取得でき、エクスポートにも ODbL 条件、Geofabrik 出典、国土交通省駅データの CC BY 4.0
出典を含めます。OSM 候補は公式の買取確認済み商店データに混ぜません。

この表示とダウンロード提供は ODbL の再利用条件への対応を意図した実装であり、
あらゆる配布・利用形態で法的義務を満たすという保証ではありません。公開・再配布前に
元の Geofabrik PBF の取得条件、ODbL の派生データベース／データベース利用条件、
第三者由来タグの権利を確認してください。OSM 候補は店名・位置・OSM 分類タグの調査手掛かりにすぎず、買取サービス、
営業状況、対象商品のいずれも独立確認済みという意味ではありません。
