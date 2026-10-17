#!/usr/bin/env python3
"""Validate and optionally upsert the reviewed Tokyo reuse CSV exports."""

import argparse
import csv
import json
import math
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "tokyo-reuse-data" / "output"
SUPABASE_TABLES = ("stations", "businesses", "station_businesses")
MAX_DISTANCE_METERS = 3000
BATCH_SIZE = 100

STATION_FIELDS = (
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
)
BUSINESS_FIELDS = (
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
)
LINK_FIELDS = (
    "station_id",
    "business_id",
    "distance_meters",
    "match_radius_meters",
    "distance_method",
)


def load_local_env() -> None:
    env_file = ROOT / ".env.local"
    if not env_file.exists():
        return
    for raw_line in env_file.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if value.startswith(("'", '"')) and value.endswith(value[0]):
            value = value[1:-1]
        if key and key not in os.environ:
            os.environ[key] = value


def read_csv(filename: str, expected_fields: tuple[str, ...]) -> list[dict[str, str]]:
    path = DATA_DIR / filename
    if not path.is_file():
        raise ValueError(f"CSV not found: {path}")
    with path.open("r", encoding="utf-8-sig", newline="") as stream:
        reader = csv.DictReader(stream)
        fields = tuple(reader.fieldnames or ())
        if len(fields) != len(set(fields)) or set(fields) != set(expected_fields):
            missing = sorted(set(expected_fields) - set(fields))
            unexpected = sorted(set(fields) - set(expected_fields))
            raise ValueError(
                f"{filename} columns differ from the reviewed export; "
                f"missing={missing}, unexpected={unexpected}, order={fields}"
            )
        return [dict(row) for row in reader]


def required_text(row: dict[str, str], field: str, source: str) -> str:
    value = row[field].strip()
    if not value:
        raise ValueError(f"{source}: {field} must not be empty")
    return value


def nullable_text(value: str) -> str | None:
    value = value.strip()
    return value or None


def number(value: str, field: str, source: str) -> float | None:
    value = value.strip()
    if not value:
        return None
    try:
        result = float(value)
    except ValueError as error:
        raise ValueError(f"{source}: invalid {field} value {value!r}") from error
    if not math.isfinite(result):
        raise ValueError(f"{source}: non-finite {field} value")
    return result


def integer(value: str, field: str, source: str) -> int:
    parsed = number(value, field, source)
    if parsed is None or not parsed.is_integer():
        raise ValueError(f"{source}: {field} must be an integer")
    return int(parsed)


def parse_station(row: dict[str, str]) -> dict[str, Any]:
    station_id = required_text(row, "station_id", "stations.csv")
    result: dict[str, Any] = {
        field: nullable_text(row[field]) for field in STATION_FIELDS
    }
    result["station_id"] = station_id
    result["latitude"] = number(row["latitude"], "latitude", station_id)
    result["longitude"] = number(row["longitude"], "longitude", station_id)
    if result["latitude"] is None or result["longitude"] is None:
        raise ValueError(f"{station_id}: station coordinates are required")
    validate_coordinates(result["latitude"], result["longitude"], station_id)
    for field in (
        "station_group_code",
        "source_station_codes",
        "station_names",
        "station_name",
        "operators",
        "lines",
        "coordinate_method",
        "coordinate_source",
        "source_id",
    ):
        if result[field] is None:
            raise ValueError(f"{station_id}: {field} must not be empty")
    return result


def parse_business(row: dict[str, str]) -> dict[str, Any]:
    business_id = required_text(row, "business_id", "businesses.csv")
    result: dict[str, Any] = {
        field: nullable_text(row[field]) for field in BUSINESS_FIELDS
    }
    result["business_id"] = business_id
    result["latitude"] = number(row["latitude"], "latitude", business_id)
    result["longitude"] = number(row["longitude"], "longitude", business_id)
    if (result["latitude"] is None) != (result["longitude"] is None):
        raise ValueError(f"{business_id}: latitude and longitude must be paired")
    if result["latitude"] is not None and result["longitude"] is not None:
        validate_coordinates(result["latitude"], result["longitude"], business_id)
    if result["source_record_json"] is not None:
        try:
            result["source_record_json"] = json.loads(result["source_record_json"])
        except json.JSONDecodeError as error:
            raise ValueError(f"{business_id}: source_record_json is invalid JSON") from error
    for field in (
        "name",
        "address",
        "coordinate_status",
        "purchase_status",
        "source_id",
        "validation_status",
    ):
        if result[field] is None:
            raise ValueError(f"{business_id}: {field} must not be empty")
    if result["purchase_status"] not in ("confirmed", "unconfirmed"):
        raise ValueError(f"{business_id}: unknown purchase_status")
    return result


def validate_coordinates(latitude: float, longitude: float, record_id: str) -> None:
    if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
        raise ValueError(f"{record_id}: coordinates are out of range")


def parse_link(row: dict[str, str], source: str) -> dict[str, Any]:
    station_id = required_text(row, "station_id", source)
    business_id = required_text(row, "business_id", source)
    distance = integer(row["distance_meters"], "distance_meters", source)
    radius = integer(row["match_radius_meters"], "match_radius_meters", source)
    if distance < 0 or radius <= 0 or distance > radius:
        raise ValueError(
            f"{source}: invalid distance/radius for {station_id}/{business_id}"
        )
    if distance > MAX_DISTANCE_METERS or radius > MAX_DISTANCE_METERS:
        raise ValueError(
            f"{source}: {station_id}/{business_id} exceeds the 3km search radius"
        )
    return {
        "station_id": station_id,
        "business_id": business_id,
        "distance_meters": distance,
        "match_radius_meters": radius,
        "distance_method": required_text(row, "distance_method", source),
    }


def unique_by(
    rows: list[dict[str, Any]], key: str, source: str
) -> dict[str, dict[str, Any]]:
    result: dict[str, dict[str, Any]] = {}
    for row in rows:
        value = row[key]
        if value in result:
            raise ValueError(f"{source}: duplicate {key} {value!r}")
        result[value] = row
    return result


def unique_links(
    rows: list[dict[str, Any]], source: str
) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for row in rows:
        key = (row["station_id"], row["business_id"])
        if key in result:
            raise ValueError(f"{source}: duplicate station/business pair {key!r}")
        result[key] = row
    return result


def load_and_validate() -> tuple[
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
    list[dict[str, Any]],
]:
    stations = [
        parse_station(row) for row in read_csv("stations.csv", STATION_FIELDS)
    ]
    businesses = [
        parse_business(row) for row in read_csv("businesses.csv", BUSINESS_FIELDS)
    ]
    links = [
        parse_link(row, "station_businesses.csv")
        for row in read_csv("station_businesses.csv", LINK_FIELDS)
    ]
    sell_links = [
        parse_link(row, "sell_station_businesses.csv")
        for row in read_csv("sell_station_businesses.csv", LINK_FIELDS)
    ]

    station_by_id = unique_by(stations, "station_id", "stations.csv")
    business_by_id = unique_by(businesses, "business_id", "businesses.csv")
    link_by_pair = unique_links(links, "station_businesses.csv")
    sell_by_pair = unique_links(sell_links, "sell_station_businesses.csv")
    confirmed_ids = {
        business_id
        for business_id, business in business_by_id.items()
        if business["purchase_status"] == "confirmed"
    }

    for pair in link_by_pair:
        if pair[0] not in station_by_id:
            raise ValueError(f"station_businesses.csv: unknown station_id {pair[0]!r}")
        if pair[1] not in business_by_id:
            raise ValueError(f"station_businesses.csv: unknown business_id {pair[1]!r}")
    for pair in sell_by_pair:
        if pair not in link_by_pair:
            raise ValueError(
                f"sell_station_businesses.csv: pair missing from general links: {pair!r}"
            )
        if pair[1] not in confirmed_ids:
            raise ValueError(f"sell_station_businesses.csv: unconfirmed business {pair[1]!r}")

    return stations, businesses, links, sell_links


def print_summary(
    stations: list[dict[str, Any]],
    businesses: list[dict[str, Any]],
    links: list[dict[str, Any]],
    sell_links: list[dict[str, Any]],
) -> None:
    confirmed = sum(row["purchase_status"] == "confirmed" for row in businesses)
    missing_coords = sum(row["latitude"] is None for row in businesses)
    confirmed_business_ids = {
        row["business_id"]
        for row in businesses
        if row["purchase_status"] == "confirmed"
    }
    confirmed_link_pairs = {
        (row["station_id"], row["business_id"])
        for row in links
        if row["business_id"] in confirmed_business_ids
    }
    sell_pairs = {
        (row["station_id"], row["business_id"]) for row in sell_links
    }
    print("Validated CSV import plan:")
    print(f"  stations: {len(stations)}")
    print(f"  businesses: {len(businesses)} ({confirmed} confirmed)")
    print(f"  station_businesses: {len(links)}")
    print(f"  confirmed businesses in station links: {len(confirmed_link_pairs)}")
    print(
        "  sell_station_businesses cross-check: "
        f"{len(sell_links)} ({'matches' if sell_pairs == confirmed_link_pairs else 'DIFFERS'} "
        "from confirmed general links)"
    )
    print(f"  businesses with pending/missing coordinates: {missing_coords}")
    print(f"  target tables: {', '.join(SUPABASE_TABLES)}")


def supabase_headers(api_key: str) -> dict[str, str]:
    headers = {
        "apikey": api_key,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }
    if api_key.count(".") == 2:
        headers["Authorization"] = f"Bearer {api_key}"
    return headers


def upsert_table(
    base_url: str,
    api_key: str,
    table: str,
    conflict_columns: str,
    rows: list[dict[str, Any]],
) -> int:
    total = 0
    for offset in range(0, len(rows), BATCH_SIZE):
        batch = rows[offset : offset + BATCH_SIZE]
        query = urllib.parse.urlencode({"on_conflict": conflict_columns})
        url = f"{base_url.rstrip('/')}/rest/v1/{table}?{query}"
        request = urllib.request.Request(
            url,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            headers=supabase_headers(api_key),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=30) as response:
                body = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read(2000).decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Supabase upsert failed for {table} (HTTP {error.code}): {detail}"
            ) from error
        except urllib.error.URLError as error:
            raise RuntimeError(
                f"Supabase connection failed while upserting {table}: {error.reason}"
            ) from error
        try:
            saved = json.loads(body)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Supabase returned invalid JSON for {table}") from error
        if not isinstance(saved, list) or len(saved) != len(batch):
            actual = len(saved) if isinstance(saved, list) else "non-list response"
            raise RuntimeError(
                f"Supabase returned {actual} rows for {len(batch)} {table} upserts"
            )
        total += len(saved)
    return total


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate the reviewed CSVs; only write to Supabase with --apply."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="upsert into Supabase (requires explicit user confirmation first)",
    )
    args = parser.parse_args()
    load_local_env()
    stations, businesses, links, sell_links = load_and_validate()
    print_summary(stations, businesses, links, sell_links)

    if not args.apply:
        print("Dry run only; no database connection or writes were attempted.")
        return 0

    base_url = (
        os.environ.get("SUPABASE_URL", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    )
    api_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    )
    if not base_url or not api_key:
        raise ValueError(
            "Set SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY "
            "(or SUPABASE_SECRET_KEY) in .env.local before using --apply."
        )
    if not base_url.startswith(("https://", "http://")):
        raise ValueError("SUPABASE_URL must be an http(s) URL")

    print("Applying upserts to only these tables: " + ", ".join(SUPABASE_TABLES))
    completed: dict[str, int] = {}
    completed["stations"] = upsert_table(
        base_url, api_key, "stations", "station_id", stations
    )
    completed["businesses"] = upsert_table(
        base_url, api_key, "businesses", "business_id", businesses
    )
    completed["station_businesses"] = upsert_table(
        base_url,
        api_key,
        "station_businesses",
        "station_id,business_id",
        links,
    )
    for table, count in completed.items():
        print(f"Upserted {count} rows into {table}.")
    print("Supabase upserts completed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
