# ものさき。Monosaki

モノの次を、見つけよう。引っ越し前の持ち物をAIと整理し、次の行動につなげるWebアプリです。

## 本番環境

**公開中のアプリ：** <https://jphack-kohl.vercel.app>

ログインには、管理者が Supabase Auth で作成したアカウントが必要です。

## 製品概要

### 背景(製品開発のきっかけ、課題等）

引っ越しの準備では、持ち物ごとに「新居へ持っていく」「売る」「譲る」「処分する」を判断し、必要な手続きや予定も調べなければなりません。物が多いほど判断と情報収集が負担になり、整理が後回しになりがちです。

### 製品説明（具体的な製品の説明）

「ものさき。」は、持ち物の写真と引っ越し準備の進捗をまとめて管理するサービスです。写真からAIが物品情報を読み取り、ユーザーが整理方法を選ぶと、その方法に応じた案内を確認できます。保存した持ち物ごとの整理方法をもとに、引っ越しまでのタスクをまとめたプランも作成できます。

### 特長

#### 1. 写真から持ち物を登録

写真をアップロードすると、AIが物品名、カテゴリ、状態の目安、観察内容、整理方法のおすすめを提案します。識別結果は確認・修正してから利用できます。

#### 2. 整理方法に応じた案内

「保管する」「売る」「譲る」「処分する」からユーザー自身が選択できます。選択した方法に応じて、準備の手順や注意事項を表示します。駅周辺の再利用先候補を表示する場合は、確認済みの事業者情報とOSM由来の未確認候補を区別します。

#### 3. 引っ越しまでのプランを作成

引っ越し予定日、整理方法、持ち物の完了状況を一覧で確認できます。ユーザーが明示的に生成を依頼したときに、保存済みの整理内容から相対的な準備タスクを作成します。確認されていない日付や自治体ルールは断定せず、公式情報の確認が必要なタスクとして案内します。

### 解決出来ること

- 持ち物ごとの整理方針と対応状況を一か所で管理できます。
- 写真を起点に、物品の登録や次の行動を考え始められます。
- 引っ越しまでに必要な作業を整理し、未対応の持ち物を把握できます。
- 処分方法や事業者情報など、個別確認が必要な事項を見落としにくくします。

### 今後の展望

- 自治体の公式情報と連携し、地域ごとに異なる処分・回収案内を確認しやすくする。
- 再利用先候補の確認状況や対応品目を充実させ、情報の鮮度を高める。
- 引っ越し日や進捗に応じたリマインダー、プランの共有などを検討する。

### 注力したこと（こだわり等）

- AIの提案とユーザーが選んだ整理方法を分離し、最終判断をユーザーに委ねています。
- 不確かな事業者情報や自治体ルールを確認済みの事実として表示しない設計にしています。
- 保存済みの整理内容が変わった場合にプランの更新を促し、古い内容のまま使い続けにくくしています。
- 画面の主な実装：[持ち物詳細](./src/components/inventory/InventoryItemFlow.tsx)、[ルール評価](./src/server/rules/engine.ts)、[引っ越しプラン](./src/components/inventory/MovePlanPageClient.tsx)。

## 開発技術

### 活用した技術

#### API・データ

- **Qwen / Alibaba Cloud Model Studio** — 画像認識と、ユーザーが依頼した場合の引っ越しタスク生成。サーバー側から DashScope 互換 API を呼び出します。
- **Supabase** — Email/Password 認証、PostgreSQL データベース、持ち物画像のプライベートストレージ、ユーザーごとのアクセス制御。
- **東京都のリユース事業者・駅データ** — 駅や事業者の登録データを利用します。取り込み手順は後述します。
- **OpenStreetMap / Geofabrik Kantō** — リユース先の未確認候補と駅からの直線距離データ。公式確認済み事業者データとは別に管理します。
- **国土交通省 国土数値情報「鉄道 N02 2025」** — 駅データ。ライセンスは CC BY 4.0 です。

#### フレームワーク・ライブラリ・モジュール

- Next.js 16（App Router）、React 19、TypeScript
- Supabase JavaScript SDK および `@supabase/ssr`
- Zod による API 入力、AI 応答、保存データの検証
- `@json-render/core` / `@json-render/react` によるルール結果の UI 描画
- Vitest、ESLint によるテストと静的解析

#### デバイス

- スマートフォン、タブレット、デスクトップのWebブラウザー
- カメラで撮影した写真、または端末から選択した画像を利用できます。

### 独自技術

#### ハッカソンで開発した独自機能・技術

- 写真認識の提案、ユーザーが選んだ行動、行動別の案内をつなぐ持ち物整理フロー。
- JSON Schema と Zod で AI の出力を検証し、対象外の持ち物、処理方法の不一致、根拠のない日付などを含む引っ越しプランを受け入れない仕組み。
- 保存済みデータのスナップショットをハッシュ化し、入力変更後に古い引っ越しプランを検知する仕組み。
- OpenStreetMap 由来の候補と駅距離を公式事業者データから分離し、出典・ライセンス情報を付けた機械可読データとして提供する仕組み。
- 主な実装箇所：[AI画像認識](./src/server/recognition/)、[引っ越しプラン検証](./src/server/move-plan.ts)、[サービス候補検索](./src/server/matching/match-services.ts)、[OSMデータ公開 API](./src/app/api/open-data/osm-candidates/route.ts)。

## 開発環境

### 必要なもの

- Node.js（Next.js 16 がサポートするバージョン）
- npm
- Supabase プロジェクト
- AI機能を利用する場合は DashScope API キー

### セットアップ

1. 依存パッケージをインストールします。

   ```bash
   npm ci
   ```

2. `.env.local.example` を `.env.local` にコピーし、利用する Supabase プロジェクトと AI モデルの値を設定します。
3. 次の Supabase migration を記載順に実行します。

   1. [駅・リユース事業者データ](./supabase/migrations/20261017081000_create_tokyo_reuse_directory.sql)
   2. [ユーザーの持ち物・認証設定](./supabase/migrations/20261017100000_create_private_user_inventory.sql)
   3. [引っ越し日・整理プラン](./supabase/migrations/20261017230000_add_move_date_and_user_move_plans.sql)
   4. [保存済みプランの削除](./supabase/migrations/20261018120000_add_move_plan_deletion.sql)

   migration は Supabase SQL Editor で手動適用してください。アプリ起動時にリモートの schema は変更しません。
4. 開発サーバーを起動します。

   ```bash
   npm run dev
   ```

5. ブラウザーで `http://localhost:3000` を開きます。ログイン用ユーザーは Supabase Auth で管理者が作成してください。公開自己登録は提供していません。

### 環境変数

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

### チェック

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
   [保存済みプランの削除 migration](./supabase/migrations/20261018120000_add_move_plan_deletion.sql)
   も Supabase SQL Editor で手動実行してください。アプリからリモート schema を自動変更することはありません。
3. `.env.local` とデプロイ先の環境変数に `QWEN_TEXT_MODEL` を設定します。生成では
   `DASHSCOPE_API_KEY`、`QWEN_BASE_URL`、`QWEN_TEXT_MODEL` を使用します。たとえば
   `qwen3.7-plus` は Model Studio の文章生成および JSON object structured-output 対応モデルです。
   アカウントのリージョンで利用可能か Model Studio で確認してください。画像認識用の
   `QWEN_VISION_MODEL` はテキスト生成の代替には使いません。
3. `/items/plan` を開いただけでは AI は呼び出されません。ユーザーが生成・更新ボタンを
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
へのリンクと [著作権・归属说明](https://www.openstreetmap.org/copyright) を表示します。
候補・距離テーブル全体は `/api/open-data/osm-candidates` から機械可読 JSON として
取得でき、エクスポートにも ODbL 条件、Geofabrik 出典、国土交通省駅データの CC BY 4.0
出典を含めます。OSM 候補は公式の買取確認済み商店データに混ぜません。

この表示とダウンロード提供は ODbL の再利用条件への対応を意図した実装であり、
あらゆる配布・利用形態で法的義務を満たすという保証ではありません。公開・再配布前に
元の Geofabrik PBF の取得条件、ODbL の派生データベース／データベース利用条件、
第三者由来タグの権利を確認してください。OSM 候補は店名・位置・OSM 分類タグの調査手掛かりにすぎず、買取サービス、
営業状況、対象商品のいずれも独立確認済みという意味ではありません。
