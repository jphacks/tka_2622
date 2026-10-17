from __future__ import annotations

import json
import unicodedata
from collections import defaultdict
from pathlib import Path

from .config import SOURCES
from .encoding import read_csv
from .geospatial import point_in_polygon
from .shapefiles import read_features, rings_from_feature
from .stations import N03_TOKYO_FEATURES

SHINAGAWA_WARD_CODE = "13109"
REUSE_PARTNER_EVIDENCE = (
    "品川区公式説明: 家具や電気製品等の修理・修繕をする店舗を案内。"
    "個別の買取可否は掲載されていない。"
    " https://www.city.shinagawa.tokyo.jp/PC/kankyo/kankyo-gomi/"
    "gomi-recycle/hpg000026688.html"
)


def _clean(value: str | None) -> str | None:
    return value.strip() if value and value.strip() else None


def _normalize(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value)
    return "".join(character for character in normalized if not character.isspace())


def _explicit_ward(address: str) -> str | None:
    normalized = unicodedata.normalize("NFKC", address)
    position = normalized.find("区")
    if 0 <= position <= 4:
        return normalized[: position + 1]
    return None


def _ward_polygons(boundary_archive: Path) -> list[list[list[tuple[float, float]]]]:
    features, _ = read_features(
        boundary_archive, N03_TOKYO_FEATURES, encoding="utf-8"
    )
    return [
        rings_from_feature(feature)
        for feature in features
        if str(feature.attributes.get("N03_007") or "") == SHINAGAWA_WARD_CODE
    ]


def standardize_shinagawa_rows(
    source_rows: list[dict[str, str | None]],
    shinagawa_polygons: list[list[list[tuple[float, float]]]],
) -> tuple[list[dict[str, object]], dict[str, int]]:
    source = next(
        source for source in SOURCES if source.source_id == "shinagawa-reuse-cooperators"
    )
    counters = {
        "source_rows": len(source_rows),
        "in_scope_rows": 0,
        "valid_records": 0,
        "invalid_required_fields": 0,
        "excluded_out_of_scope": 0,
        "coordinates_verified": 0,
        "coordinates_missing": 0,
        "coordinate_conflicts": 0,
        "coordinates_invalid": 0,
        "buyback_confirmed": 0,
    }
    candidates: list[dict[str, object]] = []
    coordinate_addresses: dict[tuple[str, str], set[str]] = defaultdict(set)

    for row_number, row in enumerate(source_rows, start=1):
        name = _clean(row.get("店名"))
        address = _clean(row.get("住所"))
        if not name or not address:
            counters["invalid_required_fields"] += 1
            continue
        explicit_ward = _explicit_ward(address)
        if explicit_ward and explicit_ward != "品川区":
            counters["excluded_out_of_scope"] += 1
            continue

        counters["in_scope_rows"] += 1
        latitude = _clean(row.get("緯度"))
        longitude = _clean(row.get("経度"))
        coordinates_supplied = bool(latitude and longitude)
        coordinates_valid = False
        if coordinates_supplied:
            coordinate_values_valid = True
            try:
                lat_value, lon_value = float(latitude), float(longitude)
            except ValueError:
                lat_value, lon_value = 0.0, 0.0
                coordinate_values_valid = False
            if coordinate_values_valid and (
                not -90 <= lat_value <= 90 or not -180 <= lon_value <= 180
            ):
                coordinate_values_valid = False
            if coordinate_values_valid:
                coordinates_valid = any(
                    point_in_polygon(lon_value, lat_value, polygon)
                    for polygon in shinagawa_polygons
                )
            if coordinates_valid:
                coordinate_addresses[(latitude, longitude)].add(
                    _normalize(address)
                )

        candidates.append(
            {
                "row_number": row_number,
                "row": row,
                "name": name,
                "address": address,
                "latitude": latitude if coordinates_valid else None,
                "longitude": longitude if coordinates_valid else None,
                "coordinates_valid": coordinates_valid,
                "coordinates_supplied": coordinates_supplied,
                "coordinates_invalid": coordinates_supplied and not coordinates_valid,
            }
        )

    businesses: list[dict[str, object]] = []
    for candidate in candidates:
        row = candidate["row"]
        assert isinstance(row, dict)
        row_number = int(candidate["row_number"])
        name = str(candidate["name"])
        address = str(candidate["address"])
        latitude = candidate["latitude"]
        longitude = candidate["longitude"]
        coordinates_valid = bool(candidate["coordinates_valid"])
        coordinate_key = (
            str(_clean(row.get("緯度"))),
            str(_clean(row.get("経度"))),
        )
        coordinate_conflict = (
            coordinates_valid and len(coordinate_addresses[coordinate_key]) > 1
        )
        if coordinate_conflict:
            latitude = longitude = None
            counters["coordinate_conflicts"] += 1
        elif coordinates_valid:
            counters["coordinates_verified"] += 1
        elif candidate["coordinates_supplied"]:
            counters["coordinates_invalid"] += 1
        else:
            counters["coordinates_missing"] += 1

        counters["valid_records"] += 1
        businesses.append(
            {
                "business_id": f"shinagawa-reuse-{row_number:03d}",
                "source_business_code": str(row_number),
                "name": name,
                "name_kana": None,
                "business_category": _clean(row.get("種別")),
                "municipality_code": "13109",
                "prefecture": "東京都",
                "municipality": "品川区",
                "address": address,
                "address_detail": None,
                "latitude": latitude,
                "longitude": longitude,
                "coordinate_status": (
                    "source_coordinate_conflict"
                    if coordinate_conflict or candidate["coordinates_invalid"]
                    else "provided_by_source"
                    if coordinates_valid
                    else "pending_geocoding"
                ),
                "phone": _clean(row.get("電話")),
                "website_url": None,
                "purchase_status": "unconfirmed",
                "sales_status": "unconfirmed",
                "service_type_status": "service_type_unconfirmed",
                "service_type_evidence": REUSE_PARTNER_EVIDENCE,
                "products_handled_source_text": _clean(row.get("種別")),
                "buyback_criteria_source_text": None,
                "opening_days": _clean(row.get("定休日")),
                "weekday_open": None,
                "weekday_close": None,
                "holiday_open": None,
                "holiday_close": None,
                "hours_notes": _clean(row.get("営業時間")),
                "usage_notes": None,
                "source_id": source.source_id,
                "source_url": source.url,
                "source_license": source.license_name,
                "validation_status": (
                    "source_coordinate_conflict_review_required"
                    if coordinate_conflict
                    else "valid_source_record"
                    if coordinates_valid
                    else "valid_source_record_coordinate_missing"
                ),
                "source_record_json": json.dumps(
                    row, ensure_ascii=False, sort_keys=True
                ),
            }
        )
    return businesses, counters


def process_shinagawa_businesses(
    csv_path: Path, boundary_archive: Path
) -> tuple[list[dict[str, object]], dict[str, int | str]]:
    headers, rows, encoding = read_csv(csv_path)
    polygons = _ward_polygons(boundary_archive)
    if not polygons:
        raise ValueError("N03 boundary data has no Shinagawa ward polygon")
    businesses, counters = standardize_shinagawa_rows(rows, polygons)
    return businesses, {
        **counters,
        "detected_encoding": encoding,
        "source_columns": len(headers),
    }
