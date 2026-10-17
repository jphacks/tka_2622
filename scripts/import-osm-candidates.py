#!/usr/bin/env python3
"""Validate and idempotently upsert the separate OSM candidate dataset."""

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
OSM_ROOT = Path(r"D:\tokyo_reuse_656_stations_complete_pipeline (1)")
DATA_DIR = OSM_ROOT / "output"
STATIONS_FILE = ROOT / "tokyo-reuse-data" / "output" / "stations.csv"
SOURCE_PAGE = "https://download.geofabrik.de/asia/japan/kanto.html"
LICENSE = "ODbL-1.0 (© OpenStreetMap contributors)"
SOURCE = f"Geofabrik Kantō bulk OpenStreetMap PBF ({SOURCE_PAGE})"
RADIUS_METERS = 3000
BATCH_SIZE = 200

CANDIDATE_FIELDS = (
    "address",
    "amenity_tag",
    "business_status",
    "candidate_id",
    "latitude",
    "longitude",
    "name",
    "notes",
    "osm_id",
    "osm_type",
    "phone",
    "purchase_status",
    "secondary_tags",
    "shop_tag",
    "source_license",
    "source_url",
    "suggested_product_categories",
    "verification_status",
    "website",
)
MATCH_FIELDS = (
    "buyback_verified",
    "candidate_id",
    "distance_meters",
    "match_source",
    "station_id",
)


def load_local_env() -> None:
    env_file = ROOT / ".env.local"
    if not env_file.is_file():
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
            raise ValueError(
                f"{filename} columns differ from the reviewed export; "
                f"missing={sorted(set(expected_fields) - set(fields))}, "
                f"unexpected={sorted(set(fields) - set(expected_fields))}"
            )
        return [dict(row) for row in reader]


def required(row: dict[str, str], field: str, record: str) -> str:
    value = row[field].strip()
    if not value:
        raise ValueError(f"{record}: {field} must not be empty")
    return value


def optional(value: str) -> str | None:
    value = value.strip()
    return value or None


def numeric(value: str, field: str, record: str) -> float:
    try:
        result = float(value)
    except ValueError as error:
        raise ValueError(f"{record}: invalid {field} {value!r}") from error
    if not math.isfinite(result):
        raise ValueError(f"{record}: {field} is not finite")
    return result


def load_station_ids() -> set[str]:
    if not STATIONS_FILE.is_file():
        raise ValueError(f"Official stations CSV not found: {STATIONS_FILE}")
    with STATIONS_FILE.open("r", encoding="utf-8-sig", newline="") as stream:
        rows = csv.DictReader(stream)
        return {required(row, "station_id", "stations.csv") for row in rows}


def convert_candidates(
    rows: list[dict[str, str]],
) -> tuple[list[dict[str, Any]], dict[str, tuple[str, str]]]:
    converted: list[dict[str, Any]] = []
    by_candidate_id: dict[str, tuple[str, str]] = {}
    seen_osm_ids: set[tuple[str, str]] = set()
    for row in rows:
        candidate_id = required(row, "candidate_id", "OSM candidates CSV")
        osm_type = required(row, "osm_type", candidate_id)
        osm_id = required(row, "osm_id", candidate_id)
        if osm_type not in ("node", "way", "relation") or not osm_id.isdigit():
            raise ValueError(f"{candidate_id}: invalid OSM object identity")
        osm_key = (osm_type, osm_id)
        if candidate_id in by_candidate_id or osm_key in seen_osm_ids:
            raise ValueError(f"Duplicate OSM candidate identity: {candidate_id}")
        if candidate_id != f"osm-{osm_type}-{osm_id}":
            raise ValueError(f"{candidate_id}: candidate_id does not match OSM ID")
        if row["purchase_status"].strip() != "unconfirmed":
            raise ValueError(f"{candidate_id}: candidate must remain unconfirmed")
        if row["verification_status"].strip() != "osm_candidate_not_branch_verified":
            raise ValueError(f"{candidate_id}: unexpected verification status")
        if row["source_license"].strip() != LICENSE:
            raise ValueError(f"{candidate_id}: unexpected OSM license")

        latitude = numeric(row["latitude"], "latitude", candidate_id)
        longitude = numeric(row["longitude"], "longitude", candidate_id)
        if not -90 <= latitude <= 90 or not -180 <= longitude <= 180:
            raise ValueError(f"{candidate_id}: coordinates out of range")
        try:
            osm_tags = json.loads(row["secondary_tags"])
        except json.JSONDecodeError as error:
            raise ValueError(f"{candidate_id}: secondary_tags is invalid JSON") from error
        if not isinstance(osm_tags, dict):
            raise ValueError(f"{candidate_id}: secondary_tags must be an object")

        shop_tag = optional(row["shop_tag"])
        amenity_tag = optional(row["amenity_tag"])
        source_url = required(row, "source_url", candidate_id)
        if not source_url.startswith("https://www.openstreetmap.org/"):
            raise ValueError(f"{candidate_id}: source_url is not an OSM object URL")
        name = required(row, "name", candidate_id)
        by_candidate_id[candidate_id] = osm_key
        seen_osm_ids.add(osm_key)
        tags = {
            **osm_tags,
            "_reuse_candidate": {
                "candidate_id": candidate_id,
                "shop_tag": shop_tag,
                "amenity_tag": amenity_tag,
                "source_url": source_url,
                "purchase_status": "unconfirmed",
                "verification_status": row["verification_status"].strip(),
                "business_status": row["business_status"].strip() or "unknown",
                "notes": optional(row["notes"]),
                "source_website_field": optional(row["website"]),
                "source_phone_field": optional(row["phone"]),
            },
        }
        converted.append(
            {
                "osm_object_type": osm_type,
                "osm_object_id": osm_id,
                "name": name,
                "address": optional(row["address"]),
                "latitude": latitude,
                "longitude": longitude,
                "source": SOURCE,
                "license": LICENSE,
                "tags": tags,
                "validation_status": row["verification_status"].strip(),
            }
        )
    return converted, by_candidate_id


def convert_matches(
    rows: list[dict[str, str]],
    candidate_ids: dict[str, tuple[str, str]],
    station_ids: set[str],
) -> list[dict[str, Any]]:
    converted: list[dict[str, Any]] = []
    seen: set[tuple[str, str, str]] = set()
    for row in rows:
        candidate_id = required(row, "candidate_id", "OSM station matches CSV")
        station_id = required(row, "station_id", candidate_id)
        if station_id not in station_ids:
            raise ValueError(f"{candidate_id}: unknown station_id {station_id}")
        if candidate_id not in candidate_ids:
            raise ValueError(f"{candidate_id}: candidate does not exist")
        if row["buyback_verified"].strip() != "no":
            raise ValueError(f"{candidate_id}: buyback must stay unverified")
        if row["match_source"].strip() != "OSM_candidates_only":
            raise ValueError(f"{candidate_id}: unexpected match source")
        try:
            distance = int(row["distance_meters"])
        except ValueError as error:
            raise ValueError(f"{candidate_id}: distance_meters must be an integer") from error
        if distance < 0 or distance > RADIUS_METERS:
            raise ValueError(f"{candidate_id}: distance exceeds 3km")
        osm_type, osm_id = candidate_ids[candidate_id]
        key = (station_id, osm_type, osm_id)
        if key in seen:
            raise ValueError(f"Duplicate station/candidate pair: {key}")
        seen.add(key)
        converted.append(
            {
                "station_id": station_id,
                "osm_object_type": osm_type,
                "osm_object_id": osm_id,
                "distance_meters": distance,
                "match_radius_meters": RADIUS_METERS,
                "distance_method": "Haversine straight-line distance",
            }
        )
    return converted


def validate_data() -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    candidates, candidate_ids = convert_candidates(
        read_csv(
            "osm_pbf_candidates_NOT_FOR_DIRECT_IMPORT.csv", CANDIDATE_FIELDS
        )
    )
    matches = convert_matches(
        read_csv(
            "station_osm_pbf_candidate_matches_3km.csv", MATCH_FIELDS
        ),
        candidate_ids,
        load_station_ids(),
    )
    return candidates, matches


def auth_headers(api_key: str, *, json_body: bool = False) -> dict[str, str]:
    headers = {"apikey": api_key, "Accept": "application/json"}
    if json_body:
        headers["Content-Type"] = "application/json"
        headers["Prefer"] = "resolution=merge-duplicates,return=representation"
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
    completed = 0
    for offset in range(0, len(rows), BATCH_SIZE):
        batch = rows[offset : offset + BATCH_SIZE]
        query = urllib.parse.urlencode({"on_conflict": conflict_columns})
        request = urllib.request.Request(
            f"{base_url.rstrip('/')}/rest/v1/{table}?{query}",
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            headers=auth_headers(api_key, json_body=True),
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                body = response.read()
        except urllib.error.HTTPError as error:
            detail = error.read(2000).decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Upsert failed for {table} (HTTP {error.code}): {detail}"
            ) from error
        except urllib.error.URLError as error:
            raise RuntimeError(f"Supabase connection failed for {table}: {error.reason}") from error
        try:
            saved = json.loads(body)
        except json.JSONDecodeError as error:
            raise RuntimeError(f"Supabase returned invalid JSON for {table}") from error
        if not isinstance(saved, list) or len(saved) != len(batch):
            raise RuntimeError(
                f"Supabase returned an unexpected row count for {table} "
                f"(expected {len(batch)})"
            )
        completed += len(saved)
        print(f"  {table}: {completed}/{len(rows)}", flush=True)
    return completed


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Validate ODbL candidate CSVs; use --apply only for approved writes."
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="upsert only the two OSM candidate tables into Supabase",
    )
    args = parser.parse_args()
    load_local_env()
    candidates, matches = validate_data()
    print("Validated OSM import plan:")
    print(f"  osm_business_candidates: {len(candidates)}")
    print(f"  station_osm_candidate_matches: {len(matches)}")
    print(f"  confirmed buyback candidates: 0")
    print(f"  source: {SOURCE_PAGE}")
    print(f"  license: {LICENSE}")

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
            "Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY "
            "(or SUPABASE_SECRET_KEY) in .env.local before --apply."
        )
    if not base_url.startswith(("https://", "http://")):
        raise ValueError("Supabase URL must use http(s)")

    print(
        "Applying idempotent upserts only to "
        "osm_business_candidates and station_osm_candidate_matches."
    )
    upsert_table(
        base_url,
        api_key,
        "osm_business_candidates",
        "osm_object_type,osm_object_id",
        candidates,
    )
    upsert_table(
        base_url,
        api_key,
        "station_osm_candidate_matches",
        "station_id,osm_object_type,osm_object_id",
        matches,
    )
    print("OSM candidate upserts completed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Import failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
