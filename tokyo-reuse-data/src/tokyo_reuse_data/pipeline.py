from __future__ import annotations

import csv
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

from .businesses import process_businesses
from .config import SOURCES
from .deduplication import merge_businesses
from .download import download_all
from .matching import MATCH_RADIUS_METERS, link_stations_to_businesses
from .shinagawa import process_shinagawa_businesses
from .sell_eligibility import filter_sell_eligible_links
from .stations import process_stations

STATION_COLUMNS = [
    "station_id",
    "station_group_code",
    "source_station_codes",
    "station_names",
    "station_name",
    "operators",
    "lines",
    "latitude",
    "longitude",
    "coordinate_method",
    "coordinate_source",
    "source_id",
]
BUSINESS_COLUMNS = [
    "business_id",
    "source_business_code",
    "name",
    "name_kana",
    "business_category",
    "municipality_code",
    "prefecture",
    "municipality",
    "address",
    "address_detail",
    "latitude",
    "longitude",
    "coordinate_status",
    "phone",
    "website_url",
    "purchase_status",
    "sales_status",
    "service_type_status",
    "service_type_evidence",
    "products_handled_source_text",
    "buyback_criteria_source_text",
    "opening_days",
    "weekday_open",
    "weekday_close",
    "holiday_open",
    "holiday_close",
    "hours_notes",
    "usage_notes",
    "source_id",
    "source_url",
    "source_license",
    "validation_status",
    "source_record_json",
]
STATION_BUSINESS_COLUMNS = [
    "station_id",
    "business_id",
    "distance_meters",
    "match_radius_meters",
    "distance_method",
]
SELL_STATION_BUSINESS_COLUMNS = STATION_BUSINESS_COLUMNS
STATION_STATUS_COLUMNS = [
    "station_id",
    "station_name",
    "search_status",
    "matching_attempted_at",
    "businesses_within_3km",
    "confirmed_buyback_businesses_within_3km",
    "coverage_scope",
    "status_note",
]
SOURCE_COLUMNS = [
    "source_id",
    "source_name",
    "url",
    "data_version",
    "retrieved_at",
    "license",
    "license_url",
    "allows_long_term_storage",
    "raw_record_count",
    "valid_record_count",
    "scope",
    "attribution",
]


def write_csv(path: Path, fieldnames: list[str], rows: list[dict[str, object]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8", newline="") as output:
        writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="raise")
        writer.writeheader()
        writer.writerows(rows)


def _build_sources(
    retrieved: dict[str, tuple[Path, str]],
    raw_counts: dict[str, int],
    valid_counts: dict[str, int],
) -> list[dict[str, object]]:
    return [
        {
            "source_id": source.source_id,
            "source_name": source.name,
            "url": source.url,
            "data_version": source.version,
            "retrieved_at": retrieved[source.source_id][1],
            "license": source.license_name,
            "license_url": source.license_url,
            "allows_long_term_storage": str(source.allows_long_term_storage).lower(),
            "raw_record_count": raw_counts[source.source_id],
            "valid_record_count": valid_counts[source.source_id],
            "scope": source.scope,
            "attribution": source.attribution,
        }
        for source in SOURCES
    ]


def _source_coverage_report_lines(
    source_business_stats: dict[str, dict[str, int | str]],
    businesses: list[dict[str, object]],
    links: list[dict[str, object]],
) -> list[str]:
    business_by_id = {str(business["business_id"]): business for business in businesses}
    source_by_id = {source.source_id: source for source in SOURCES}
    report_lines = ["## 商店データソース別の追加・確認状況", ""]
    for source_id, stats in source_business_stats.items():
        source = source_by_id[source_id]
        source_businesses = [
            business
            for business in businesses
            if business.get("source_id") == source_id
        ]
        source_ids = {
            str(business["business_id"]) for business in source_businesses
        }
        source_links = [
            link for link in links if str(link["business_id"]) in source_ids
        ]
        source_buyback_links = [
            link
            for link in source_links
            if business_by_id[str(link["business_id"])]["purchase_status"]
            == "confirmed"
        ]
        matched_stations = {str(link["station_id"]) for link in source_links}
        buyback_stations = {
            str(link["station_id"]) for link in source_buyback_links
        }
        if source_id == "meguro-reuse-shops":
            uninvestigated = (
                "目黒区以外の22区、多摩地域・島しょ部。品川区は協力店一覧のみで買取未確認。"
            )
        else:
            uninvestigated = (
                "品川区の買取可否、および品川区外の23区・多摩地域・島しょ部。"
            )
        report_lines.extend(
            [
                f"### {source.name}",
                "",
                f"- ライセンス: {source.license_name}; 長期保存可能: {'はい' if source.allows_long_term_storage else '要確認'}",
                f"- 原資料レコード数: {stats['source_rows']:,}",
                f"- 対象外・不正レコード数: {stats['excluded_records']:,}",
                f"- 新規追加店舗数: {stats['new_records']:,}",
                f"- 重複レコード数: {stats['duplicate_records']:,}",
                f"- 買取確認済み店舗数: {sum(b['purchase_status'] == 'confirmed' for b in source_businesses):,}",
                f"- 緯度・経度の欠損店舗数: {sum(b['coordinate_status'] == 'pending_geocoding' for b in source_businesses):,}",
                f"- 座標重複等の要確認店舗数: {sum(b['coordinate_status'] == 'source_coordinate_conflict' for b in source_businesses):,}",
                f"- N03区域外・不正な原座標数: {stats.get('coordinates_invalid', 0):,}",
                f"- 現在マッチがある駅グループ数: {len(matched_stations):,}",
                f"- 買取確認済み店舗がマッチする駅グループ数: {len(buyback_stations):,}",
                f"- 未調査地区: {uninvestigated}",
                "",
            ]
        )
    return report_lines


def _report_text(
    station_stats: dict[str, int],
    business_stats: dict[str, int | str],
    source_business_stats: dict[str, dict[str, int | str]],
    stations: list[dict[str, object]],
    businesses: list[dict[str, object]],
    links: list[dict[str, object]],
    retrieved: dict[str, tuple[Path, str]],
) -> str:
    unmatched_stations = len(stations) - len(
        {str(link["station_id"]) for link in links}
    )
    business_by_id = {str(business["business_id"]): business for business in businesses}
    buyback_links = [
        link
        for link in links
        if business_by_id[str(link["business_id"])]["purchase_status"] == "confirmed"
    ]
    report_lines = [
        "# 東京リユースデータ収集・品質レポート",
        "",
        f"- 実行日時（UTC）: {datetime.now(timezone.utc).isoformat()}",
        "- Supabase接続・更新: 未実施",
        "- Qwen / AI問い合わせ: 未実施",
        "",
        "## データソースと取得",
        "",
    ]
    for source in SOURCES:
        report_lines.extend(
            [
                f"### {source.name}",
                "",
                f"- URL: {source.url}",
                f"- バージョン: {source.version}",
                f"- 取得日時: {retrieved[source.source_id][1]}",
                f"- ライセンス: {source.license_name} ({source.license_url})",
                f"- 長期保存可能: {'はい' if source.allows_long_term_storage else '要確認'}",
                f"- 対象範囲: {source.scope}",
                f"- 出典表示: {source.attribution}",
                "",
            ]
        )
    report_lines.extend(
        [
            "## 駅データ（N02 2025 + N03 東京都 2024）",
            "",
            f"- N02処理前の鉄道区間・駅属性レコード: {station_stats['n02_raw_features']:,}",
            f"- N02有効な駅コード付きレコード: {station_stats['n02_valid_station_features']:,}",
            f"- N03東京都境界レコード: {station_stats['n03_tokyo_boundary_features']:,} / {station_stats['n03_raw_boundary_features']:,}",
            f"- N02区間中点が東京都境界内に入るレコード: {station_stats['n02_features_inside_tokyo']:,}",
            f"- 重複する駅グループ・駅コードの除去: {station_stats['duplicate_station_code_features_removed']:,}",
            f"- 重複除去後の原典駅コード数: {station_stats['unique_grouped_station_codes']:,}",
            f"- 駅グループへ統合された追加の乗換駅コード数: {station_stats['station_codes_merged_into_groups']:,}",
            f"- 出力駅グループ数: {len(stations):,}",
            "- 東京都判定: N02の駅区間線長中点をN03東京都ポリゴンに対して包含判定",
            "- 重複キー: N02_005g（駅グループコード）とN02_005c（原典駅コード）。同一組の重複形状は座標に一度だけ使用し、運営会社・路線はすべて保持。",
            "- 駅グループ座標: N02線形状から算出した線長中点を駅コード単位で重複除去し、N02グループ内で算術平均。原典ポイントではない近似値。",
            "- N02の出典: 国土交通省 国土数値情報 鉄道データ（2025年）",
            "- N03の出典: 国土交通省 国土数値情報 行政区域データ（2024年、東京都）",
            "",
            "## 目黒区リユースショップ第一批",
            "",
            f"- 原CSVレコード数: {business_stats['source_rows']:,}",
            f"- 目黒区に該当: {business_stats['in_meguro_rows']:,}",
            f"- 必須項目検証後の出力: {sum(b.get('source_id') == 'meguro-reuse-shops' for b in businesses):,}",
            f"- 都道府県コード等を含む原CSV列数: {business_stats['source_columns']}",
            f"- CSV文字コード: {business_stats['detected_encoding']}",
            f"- 原CSVに含まれた座標: {business_stats['coordinates_present']:,}",
            f"- 目黒区データの座標欠損（ジオコーディング待ち）: {business_stats['coordinates_pending']:,}",
            f"- 買取が明示的に確認できた記録: {business_stats['buyback_confirmed']:,}",
            f"- 販売のみと明示確認できた記録: {business_stats['sales_only_confirmed']:,}",
            f"- 買取・販売種別を確認できない記録: {business_stats['service_type_unconfirmed']:,}",
            f"- 買取ステータス内訳: {dict(Counter(str(b['purchase_status']) for b in businesses if b.get('source_id') == 'meguro-reuse-shops'))}",
            "- 買取の確定は、各店舗の名称・取扱方法・備考にある肯定的な買取受付・査定等のサービス表現に限定。年齢条件は purchase_status の判定に使用しません。",
            "Rehello by BOOKOFF目黒店・自由が丘駅前店は、店舗別資料に肯定的な買取サービス説明が見つからないため unconfirmed です。年齢条件そのものは降格理由ではなく、また肯定根拠にもなりません。残る8店には具体的な買取受付・査定・支払いの案内、または店舗名に「買取センター」の明記があります。",
            "",
        ]
    )
    report_lines.extend(
        _source_coverage_report_lines(source_business_stats, businesses, links)
    )
    report_lines.extend(
        [
            "### 原データ範囲に関する注意",
            "",
            "指定カタログのCSVは目黒区データセットとして公開されていますが、原CSVには目黒区以外の東京都内自治体および都外の記録も含まれていました。",
            "この出力では `東京都` かつ `目黒区` と明記された行だけを採用し、他の自治体行は除外しました。原CSV行数と除外件数は上記に記録しています。",
            "公式CKANメタデータはCC BY 4.0を示しているため、出典情報とライセンスを各レコードおよび sources.csv に保持して正式CSVへ含めています。",
            "東京都オープンデータカタログで「リユース」「リユース協力店」「リサイクルショップ」「中古品」「買取」のタイトル検索を行い、目黒区以外では品川区の協力店CSVのみを確認しました。BODIKの「リユースショップ」検索で見つかったもう一件は福岡県久留米市のデータのため除外しました。ライセンスが確認できない民間店舗一覧は収録していません。",
            "買取可否は一般的なリユース店というだけでは推定していません。「買取基準」欄が全件共通の問い合わせ案内である場合は根拠から除外し、利用方法・店舗種別・備考にある明示文言だけを証拠として分類しています。",
            "原CSVにある住所・電話番号・品目・URLをそのまま保持し、空欄を補完していません。座標は原CSVの値のみを使用し、外部ジオコーディングは行っていません。",
            "",
            "## 3km直線距離の駅・店舗関連",
            "",
            f"- 直線距離上限: {MATCH_RADIUS_METERS:,} m（Haversine）",
            f"- 出力関連レコード数: {len(links):,}",
            f"- 買取確認済み店舗との関連レコード数: {len(buyback_links):,}",
            f"- sell向け確認済み店舗リンク数: {len(buyback_links):,}",
            f"- 3km内の店舗が1件以上ある駅グループ: {len(stations) - unmatched_stations:,}",
            f"- 買取確認済み店舗が3km内にある駅グループ: {len({str(link['station_id']) for link in buyback_links}):,}",
            f"- 現在の登録ソース内で3km以内の関連がない駅グループ: {unmatched_stations:,}",
            "- 座標欠損・重複等の疑義がある店舗は距離判定から除外しています。欠損座標は geocoding 待ちとして保持します。",
            "",
            "## 品質検証",
            "",
            f"- 駅ID重複: {len(stations) - len({s['station_id'] for s in stations})}",
            f"- 店舗ID重複: {len(businesses) - len({b['business_id'] for b in businesses})}",
            f"- station_businesses.csv距離範囲違反: {sum(int(link['distance_meters']) > MATCH_RADIUS_METERS for link in links)}",
            f"- station_businesses.csvに座標欠損店舗を含む: {'はい' if any(b['coordinate_status'] == 'pending_geocoding' and any(link['business_id'] == b['business_id'] for link in links) for b in businesses) else 'いいえ'}",
            "- 1つのCSV内に同じ駅・店舗の重複関連は出力しません。",
            "- `sell_station_businesses.csv` には `purchase_status=confirmed` の店舗だけを出力します。",
            "- `no_match_not_investigated` は登録済みデータソースに一致がない状態であり、地区調査完了を意味しません。",
            "",
            "## 出力ファイル",
            "",
            "- `output/stations.csv`",
            "- `output/businesses.csv`",
            "- `output/station_businesses.csv`",
            "- `output/sell_station_businesses.csv`（買取確認済み店舗のみ）",
            "- `output/station_search_status.csv`",
            "- `reports/sources.csv`",
            "- `reports/collection_report.md`",
            "",
            "### 既知の制約",
            "",
            "- 商店データの現行範囲は目黒区のリユースショップと品川区のリユース事業協力店です。品川区協力店は買取店と確認されていません。",
            "- N02の駅位置は駅ホームの正確な代表点ではなく、原典の線形状から計算した近似値です。利用時はこの誤差を考慮してください。",
            "- `station_search_status.csv` は登録ソース内の座標マッチ結果です。0件の駅を調査完了として扱わず、店舗網羅性も保証しません。",
            "",
        ]
    )
    return "\n".join(report_lines)


def validate_outputs(
    stations: list[dict[str, object]],
    businesses: list[dict[str, object]],
    links: list[dict[str, object]],
) -> None:
    station_ids = [station["station_id"] for station in stations]
    business_ids = [business["business_id"] for business in businesses]
    if len(station_ids) != len(set(station_ids)):
        raise ValueError("Duplicate station IDs detected")
    if len(business_ids) != len(set(business_ids)):
        raise ValueError("Duplicate business IDs detected")
    for station in stations:
        latitude, longitude = float(station["latitude"]), float(station["longitude"])
        if not (-90 <= latitude <= 90 and -180 <= longitude <= 180):
            raise ValueError(f"Invalid station coordinates: {station['station_id']}")
    business_by_id = {business["business_id"]: business for business in businesses}
    for link in links:
        if int(link["distance_meters"]) > MATCH_RADIUS_METERS:
            raise ValueError("A station-business link exceeds the configured radius")
        business = business_by_id.get(link["business_id"])
        if business is None:
            raise ValueError(f"Link refers to an unknown business: {link['business_id']}")
        if business["latitude"] is None or business["longitude"] is None:
            raise ValueError("A business without source coordinates was distance-matched")


def run_pipeline(project_root: Path, force_download: bool = False) -> dict[str, object]:
    raw_dir = project_root / "raw"
    retrieved = download_all(raw_dir, force=force_download)

    station_source = retrieved["mlit-n02-2025"][0]
    boundary_source = retrieved["mlit-n03-tokyo-2024"][0]
    business_source = retrieved["meguro-reuse-shops"][0]
    shinagawa_source = retrieved["shinagawa-reuse-cooperators"][0]

    stations, station_stats = process_stations(station_source, boundary_source)
    meguro_businesses, business_stats = process_businesses(business_source)
    shinagawa_businesses, shinagawa_stats = process_shinagawa_businesses(
        shinagawa_source, boundary_source
    )
    businesses, meguro_duplicate_count = merge_businesses([], meguro_businesses)
    businesses, shinagawa_duplicate_count = merge_businesses(
        businesses, shinagawa_businesses
    )
    source_business_stats = {
        "meguro-reuse-shops": {
            **business_stats,
            "excluded_records": int(business_stats["source_rows"])
            - int(business_stats["valid_records"]),
            "new_records": len(meguro_businesses) - meguro_duplicate_count,
            "duplicate_records": meguro_duplicate_count,
        },
        "shinagawa-reuse-cooperators": {
            **shinagawa_stats,
            "excluded_records": int(shinagawa_stats["source_rows"])
            - int(shinagawa_stats["valid_records"]),
            "new_records": len(shinagawa_businesses) - shinagawa_duplicate_count,
            "duplicate_records": shinagawa_duplicate_count,
        },
    }
    links = link_stations_to_businesses(stations, businesses)
    sell_links = filter_sell_eligible_links(links, businesses)
    validate_outputs(stations, businesses, links)

    links_by_station = Counter(str(link["station_id"]) for link in links)
    business_by_id = {str(business["business_id"]): business for business in businesses}
    buyback_links_by_station = Counter(
        str(link["station_id"])
        for link in links
        if business_by_id[str(link["business_id"])]["purchase_status"] == "confirmed"
    )
    matching_attempted_at = datetime.now(timezone.utc).isoformat()
    station_status = [
        {
            "station_id": station["station_id"],
            "station_name": station["station_name"],
            "search_status": (
                "matched_current_sources"
                if links_by_station.get(str(station["station_id"]), 0)
                else "no_match_not_investigated"
            ),
            "matching_attempted_at": matching_attempted_at,
            "businesses_within_3km": links_by_station.get(
                str(station["station_id"]), 0
            ),
            "confirmed_buyback_businesses_within_3km": buyback_links_by_station.get(
                str(station["station_id"]), 0
            ),
            "coverage_scope": "目黒区リユースショップ、品川区リユース事業協力店",
            "status_note": (
                "登録済みソースに3km以内の座標一致あり。"
                if links_by_station.get(str(station["station_id"]), 0)
                else "登録済みソースに3km以内の座標一致なし。地区調査完了を意味しない。"
            ),
        }
        for station in stations
    ]

    output_dir = project_root / "output"
    write_csv(output_dir / "stations.csv", STATION_COLUMNS, stations)
    write_csv(output_dir / "businesses.csv", BUSINESS_COLUMNS, businesses)
    write_csv(
        output_dir / "station_businesses.csv",
        STATION_BUSINESS_COLUMNS,
        links,
    )
    write_csv(
        output_dir / "sell_station_businesses.csv",
        SELL_STATION_BUSINESS_COLUMNS,
        sell_links,
    )
    write_csv(
        output_dir / "station_search_status.csv",
        STATION_STATUS_COLUMNS,
        station_status,
    )

    raw_counts = {
        "mlit-n02-2025": station_stats["n02_raw_features"],
        "mlit-n03-tokyo-2024": station_stats["n03_raw_boundary_features"],
        "meguro-reuse-shops": int(business_stats["source_rows"]),
        "shinagawa-reuse-cooperators": int(shinagawa_stats["source_rows"]),
    }
    valid_counts = {
        "mlit-n02-2025": station_stats["n02_valid_station_features"],
        "mlit-n03-tokyo-2024": station_stats["n03_tokyo_boundary_features"],
        "meguro-reuse-shops": int(business_stats["valid_records"]),
        "shinagawa-reuse-cooperators": int(shinagawa_stats["valid_records"]),
    }
    source_rows = _build_sources(retrieved, raw_counts, valid_counts)
    write_csv(project_root / "reports" / "sources.csv", SOURCE_COLUMNS, source_rows)
    report = _report_text(
        station_stats,
        business_stats,
        source_business_stats,
        stations,
        businesses,
        links,
        retrieved,
    )
    report_path = project_root / "reports" / "collection_report.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text(report, encoding="utf-8")

    return {
        "station_stats": station_stats,
        "business_stats": business_stats,
        "station_count": len(stations),
        "business_count": len(businesses),
        "new_shinagawa_business_count": source_business_stats[
            "shinagawa-reuse-cooperators"
        ]["new_records"],
        "duplicate_business_count": sum(
            int(stats["duplicate_records"])
            for stats in source_business_stats.values()
        ),
        "station_business_link_count": len(links),
        "sell_station_business_link_count": len(sell_links),
        "confirmed_buyback_link_count": sum(
            business_by_id[str(link["business_id"])]["purchase_status"]
            == "confirmed"
            for link in links
        ),
        "stations_with_current_matches": len(links_by_station),
        "stations_with_confirmed_buyback_matches": len(buyback_links_by_station),
        "station_status_count": len(station_status),
        "outputs": [
            str(output_dir / "stations.csv"),
            str(output_dir / "businesses.csv"),
            str(output_dir / "station_businesses.csv"),
            str(output_dir / "sell_station_businesses.csv"),
            str(output_dir / "station_search_status.csv"),
            str(project_root / "reports" / "sources.csv"),
            str(report_path),
        ],
        "retrieved": {
            key: {"path": str(path), "retrieved_at": timestamp}
            for key, (path, timestamp) in retrieved.items()
        },
    }
