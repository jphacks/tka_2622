from __future__ import annotations

import json
from pathlib import Path

from .config import SOURCES
from .encoding import read_csv

MEGURO = "目黒区"
TOKYO = "東京都"
NEGATIVE_BUYBACK_TERMS = (
    "買取は行っておりません",
    "買取を行っておりません",
    "買取は行っていません",
    "買取を行っていません",
    "買い取りは行っておりません",
    "買い取りを行っておりません",
    "買い取りは行っていません",
    "買い取りを行っていません",
)
POSITIVE_BUYBACK_TERMS = (
    "買取センター",
    "買取カウンター",
    "買取受付",
    "買取専門",
    "店頭買取",
    "出張買取",
    "手ぶら買取",
    "宅配買取",
    "買取いたします",
    "買取します",
    "買取しています",
    "買取をしています",
    "買取を行",
    "買取ならびに販売",
    "買取及び販売",
    "買取と販売",
    "査定",
)
GENERIC_BUYBACK_TEXT = "詳細は、店舗にお問い合わせいただくか店舗ホームページをご覧ください。"


def _clean(value: str | None) -> str | None:
    return value.strip() if value and value.strip() else None


def _parse_coordinate(
    value: str | None, minimum: float, maximum: float
) -> tuple[str | None, bool]:
    value = _clean(value)
    if value is None:
        return None, False
    try:
        number = float(value)
    except ValueError:
        return None, False
    if not minimum <= number <= maximum:
        return None, False
    return value, True


def _service_status(row: dict[str, str | None]) -> tuple[str, str, str, str]:
    service_fields = (
        "名称",
        "店舗の種類",
        "利用方法特記事項",
        "備考",
        "買取基準",
    )
    evidence = [
        (field, row.get(field))
        for field in service_fields
        if _clean(row.get(field))
        and not (
            field == "買取基準"
            and row[field]
            and GENERIC_BUYBACK_TEXT in row[field]
        )
    ]
    text = " ".join(value or "" for _, value in evidence)
    normalized_text = text.replace("買い取り", "買取")
    negative_buyback = any(term in text for term in NEGATIVE_BUYBACK_TERMS)
    purchase_confirmed = any(
        term in normalized_text for term in POSITIVE_BUYBACK_TERMS
    ) and not negative_buyback
    purchase_status = (
        "confirmed"
        if purchase_confirmed
        else "not_offered"
        if negative_buyback
        else "unconfirmed"
    )
    retail_confirmed = any(
        term in text for term in ("販売", "小売")
    )
    sales_status = "confirmed" if retail_confirmed else "unconfirmed"
    if purchase_confirmed and retail_confirmed:
        service_type_status = "buyback_and_sales_confirmed"
    elif purchase_confirmed:
        service_type_status = "buyback_confirmed"
    elif retail_confirmed and purchase_status == "not_offered":
        service_type_status = "sales_only_confirmed"
    elif retail_confirmed:
        service_type_status = "sales_confirmed_buyback_unconfirmed"
    elif purchase_status == "not_offered":
        service_type_status = "purchase_not_offered"
    else:
        service_type_status = "service_type_unconfirmed"
    evidence_text = " | ".join(
        f"{field}: {value}" for field, value in evidence if value
    )
    return purchase_status, sales_status, service_type_status, evidence_text


def standardize_business_rows(
    source_rows: list[dict[str, str | None]],
) -> tuple[list[dict[str, object]], dict[str, int]]:
    businesses: list[dict[str, object]] = []
    counters = {
        "source_rows": len(source_rows),
        "in_meguro_rows": 0,
        "valid_records": 0,
        "invalid_required_fields": 0,
        "coordinates_present": 0,
        "coordinates_pending": 0,
        "buyback_confirmed": 0,
        "sales_only_confirmed": 0,
        "service_type_unconfirmed": 0,
    }
    for row_number, row in enumerate(source_rows, start=1):
        if row.get("都道府県名") != TOKYO or row.get("市区町村名") != MEGURO:
            continue
        counters["in_meguro_rows"] += 1
        name = _clean(row.get("名称"))
        address = _clean(row.get("住所"))
        if not name or not address:
            counters["invalid_required_fields"] += 1
            continue
        counters["valid_records"] += 1

        latitude, latitude_valid = _parse_coordinate(row.get("緯度"), -90, 90)
        longitude, longitude_valid = _parse_coordinate(row.get("経度"), -180, 180)
        coordinates_valid = latitude_valid and longitude_valid
        if coordinates_valid:
            counters["coordinates_present"] += 1
        else:
            counters["coordinates_pending"] += 1
            latitude = None
            longitude = None

        purchase_status, sales_status, service_status, evidence = _service_status(row)
        if purchase_status == "confirmed":
            counters["buyback_confirmed"] += 1
        if service_status == "sales_only_confirmed":
            counters["sales_only_confirmed"] += 1
        if service_status == "service_type_unconfirmed":
            counters["service_type_unconfirmed"] += 1

        source_code = _clean(row.get("NO"))
        business_id = f"meguro-reuse-{source_code or row_number}"
        businesses.append(
            {
                "business_id": business_id,
                "source_business_code": source_code,
                "name": name,
                "name_kana": _clean(row.get("名称_カナ")),
                "business_category": _clean(row.get("店舗の種類")),
                "municipality_code": _clean(row.get("都道府県コード又は市区町村コード")),
                "prefecture": _clean(row.get("都道府県名")),
                "municipality": _clean(row.get("市区町村名")),
                "address": address,
                "address_detail": _clean(row.get("方書")),
                "latitude": latitude,
                "longitude": longitude,
                "coordinate_status": "provided_by_source" if coordinates_valid else "pending_geocoding",
                "phone": _clean(row.get("電話番号")),
                "website_url": _clean(row.get("URL")),
                "purchase_status": purchase_status,
                "sales_status": sales_status,
                "service_type_status": service_status,
                "service_type_evidence": evidence or None,
                "products_handled_source_text": _clean(row.get("取扱商品")),
                "buyback_criteria_source_text": _clean(row.get("買取基準")),
                "opening_days": _clean(row.get("営業曜日")),
                "weekday_open": _clean(row.get("営業開始時間(平日)")),
                "weekday_close": _clean(row.get("営業終了時間(平日)")),
                "holiday_open": _clean(row.get("営業開始時間(休日)")),
                "holiday_close": _clean(row.get("営業終了時間(休日)")),
                "hours_notes": _clean(row.get("営業日時特記事項")),
                "usage_notes": _clean(row.get("利用方法特記事項")),
                "source_id": "meguro-reuse-shops",
                "source_url": next(
                    source.url
                    for source in SOURCES
                    if source.source_id == "meguro-reuse-shops"
                ),
                "source_license": "CC BY 4.0",
                "validation_status": "valid_source_record",
                "source_record_json": json.dumps(row, ensure_ascii=False, sort_keys=True),
            }
        )
    return businesses, counters


def process_businesses(
    csv_path: Path,
) -> tuple[list[dict[str, object]], dict[str, int | str]]:
    headers, rows, encoding = read_csv(csv_path)
    businesses, counters = standardize_business_rows(rows)
    return businesses, {
        **counters,
        "detected_encoding": encoding,
        "source_columns": len(headers),
    }
