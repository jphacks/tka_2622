#!/usr/bin/env python3
"""Enrich existing businesses with clearly matched OpenStreetMap opening hours."""

from __future__ import annotations

import argparse
import csv
import difflib
import hashlib
import json
import math
import os
import random
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_CACHE_DIR = ROOT / ".cache" / "opening-hours-enrichment"
DEFAULT_OVERPASS_URL = "https://overpass-api.de/api/interpreter"
DEFAULT_OSM_DATA_DIR = Path(r"D:\tokyo_reuse_656_stations_complete_pipeline (1)\output")
DEFAULT_OSM_CSV_NAMES = (
    "osm_candidates_NOT_FOR_DIRECT_IMPORT.csv",
    "osm_pbf_candidates_NOT_FOR_DIRECT_IMPORT.csv",
)
OSM_LICENSE = "ODbL-1.0"
OSM_ATTRIBUTION = "© OpenStreetMap contributors"
OSM_COPYRIGHT_URL = "https://www.openstreetmap.org/copyright"
OSM_SEARCH_URL = "https://www.openstreetmap.org"
BUSINESS_FIELDS = (
    "business_id",
    "name",
    "address",
    "latitude",
    "longitude",
    "coordinate_status",
    "opening_days",
    "weekday_open",
    "weekday_close",
    "holiday_open",
    "holiday_close",
    "hours_notes",
)
ENRICHMENT_FIELDS = (
    "osm_object_type",
    "osm_object_id",
    "opening_hours",
    "opening_hours_source",
    "opening_hours_source_url",
    "opening_hours_license",
    "opening_hours_checked_at",
)
TILE_DEGREES = 0.02
SEARCH_RADIUS_METERS = 250
AUTO_MATCH_RADIUS_METERS = 100
MIN_NAME_SIMILARITY_FOR_REVIEW = 0.72
REQUEST_TIMEOUT_SECONDS = 90
PAGE_SIZE = 500
ID_BATCH_SIZE = 50
RETRYABLE_HTTP_STATUSES = {429, 500, 502, 503, 504}


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


def normalize_name(value: str) -> str:
    normalized = unicodedata.normalize("NFKC", value).casefold()
    for marker in ("株式会社", "有限会社", "合同会社", "（株）", "(株)"):
        normalized = normalized.replace(marker, "")
    return "".join(character for character in normalized if character.isalnum())


def name_similarity(left: str, right: str) -> float:
    normalized_left = normalize_name(left)
    normalized_right = normalize_name(right)
    if not normalized_left or not normalized_right:
        return 0.0
    return difflib.SequenceMatcher(
        None, normalized_left, normalized_right, autojunk=False
    ).ratio()


def haversine_meters(
    latitude_a: float, longitude_a: float, latitude_b: float, longitude_b: float
) -> float:
    earth_radius_meters = 6_371_000
    phi_a = math.radians(latitude_a)
    phi_b = math.radians(latitude_b)
    delta_phi = math.radians(latitude_b - latitude_a)
    delta_lambda = math.radians(longitude_b - longitude_a)
    value = (
        math.sin(delta_phi / 2) ** 2
        + math.cos(phi_a) * math.cos(phi_b) * math.sin(delta_lambda / 2) ** 2
    )
    return earth_radius_meters * 2 * math.atan2(math.sqrt(value), math.sqrt(1 - value))


def element_coordinates(element: dict[str, Any]) -> tuple[float, float] | None:
    latitude = element.get("lat")
    longitude = element.get("lon")
    if latitude is None or longitude is None:
        center = element.get("center")
        if not isinstance(center, dict):
            return None
        latitude = center.get("lat")
        longitude = center.get("lon")
    try:
        latitude_value = float(latitude)
        longitude_value = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (-90 <= latitude_value <= 90 and -180 <= longitude_value <= 180):
        return None
    return latitude_value, longitude_value


def element_key(element: dict[str, Any]) -> tuple[str, str]:
    element_type = element.get("type")
    element_id = element.get("id")
    if element_type not in {"node", "way", "relation"} or element_id is None:
        raise ValueError("Overpass returned an element without a valid OSM reference.")
    return str(element_type), str(element_id)


def has_complete_schedule(row: dict[str, Any]) -> bool:
    return all(
        str(row.get(field) or "").strip()
        for field in ("weekday_open", "weekday_close", "holiday_open", "holiday_close")
    )


def osm_object_url(element_type: str, element_id: str) -> str:
    return f"{OSM_SEARCH_URL}/{element_type}/{element_id}"


def grid_key(latitude: float, longitude: float) -> tuple[int, int]:
    return math.floor(latitude / TILE_DEGREES), math.floor(longitude / TILE_DEGREES)


def tile_query(tile: tuple[int, int]) -> str:
    latitude_index, longitude_index = tile
    south = latitude_index * TILE_DEGREES - 0.003
    west = longitude_index * TILE_DEGREES - 0.003
    north = (latitude_index + 1) * TILE_DEGREES + 0.003
    east = (longitude_index + 1) * TILE_DEGREES + 0.003
    bounds = f"{south:.5f},{west:.5f},{north:.5f},{east:.5f}"
    return (
        "[out:json][timeout:60];("
        f'nwr["name"]["shop"]({bounds});'
        f'nwr["name"]["amenity"="second_hand"]({bounds});'
        ");out center tags;"
    )


def object_query(objects: list[tuple[str, str]]) -> str:
    clauses: list[str] = []
    for element_type in ("node", "way", "relation"):
        ids = [element_id for kind, element_id in objects if kind == element_type]
        if ids:
            clauses.append(f"{element_type}(id:{','.join(ids)});")
    if not clauses:
        raise ValueError("Cannot construct an OSM lookup without valid object IDs.")
    return "[out:json][timeout:60];(" + "".join(clauses) + ");out center tags;"


def read_bulk_osm_candidates(
    csv_paths: list[Path],
) -> tuple[dict[tuple[str, str], dict[str, Any]], int, int]:
    elements: dict[tuple[str, str], dict[str, Any]] = {}
    input_rows = 0
    rows_with_hours = 0
    for csv_path in csv_paths:
        if not csv_path.is_file():
            raise ValueError(f"OSM candidate CSV not found: {csv_path}")
        with csv_path.open("r", encoding="utf-8-sig", newline="") as stream:
            reader = csv.DictReader(stream)
            required_fields = {
                "name",
                "latitude",
                "longitude",
                "osm_type",
                "osm_id",
                "secondary_tags",
            }
            fields = set(reader.fieldnames or ())
            if not required_fields.issubset(fields):
                raise ValueError(
                    f"{csv_path} is missing required OSM fields: "
                    f"{sorted(required_fields - fields)}"
                )
            for row_number, row in enumerate(reader, start=2):
                input_rows += 1
                element_type = (row.get("osm_type") or "").strip()
                element_id = (row.get("osm_id") or "").strip()
                if element_type not in {"node", "way", "relation"} or not element_id.isdigit():
                    continue
                try:
                    latitude = float(row["latitude"])
                    longitude = float(row["longitude"])
                except (KeyError, TypeError, ValueError):
                    continue
                if not (
                    math.isfinite(latitude)
                    and math.isfinite(longitude)
                    and -90 <= latitude <= 90
                    and -180 <= longitude <= 180
                ):
                    continue
                try:
                    tags = json.loads(row.get("secondary_tags") or "{}")
                except json.JSONDecodeError as error:
                    raise ValueError(
                        f"{csv_path}:{row_number}: invalid secondary_tags JSON"
                    ) from error
                if not isinstance(tags, dict):
                    raise ValueError(
                        f"{csv_path}:{row_number}: secondary_tags must be an object"
                    )
                name = (row.get("name") or "").strip()
                if name:
                    tags.setdefault("name", name)
                opening_hours = str(tags.get("opening_hours") or "").strip()
                if opening_hours:
                    rows_with_hours += 1
                element = {
                    "type": element_type,
                    "id": element_id,
                    "lat": latitude,
                    "lon": longitude,
                    "tags": tags,
                }
                key = (element_type, element_id)
                previous = elements.get(key)
                if previous is None:
                    elements[key] = element
                    continue
                previous_tags = previous.get("tags", {})
                if opening_hours and not previous_tags.get("opening_hours"):
                    elements[key] = element
                elif not previous_tags.get("name") and name:
                    previous_tags["name"] = name
    return elements, input_rows, rows_with_hours


class OverpassClient:
    def __init__(
        self,
        cache_dir: Path,
        endpoint: str,
        cache_days: int,
        min_request_interval: float,
        retries: int,
        refresh_cache: bool,
    ) -> None:
        self.cache_dir = cache_dir
        self.endpoint = endpoint
        self.cache_days = cache_days
        self.min_request_interval = min_request_interval
        self.retries = retries
        self.refresh_cache = refresh_cache
        self.last_request_at = 0.0
        self.cache_dir.mkdir(parents=True, exist_ok=True)

    def _cache_path(self, query: str) -> Path:
        digest = hashlib.sha256(query.encode("utf-8")).hexdigest()
        return self.cache_dir / f"{digest}.json"

    def _read_cache(self, path: Path) -> list[dict[str, Any]] | None:
        if self.refresh_cache or not path.is_file():
            return None
        try:
            cached = json.loads(path.read_text(encoding="utf-8"))
            fetched_at = datetime.fromisoformat(cached["fetched_at"])
            age_seconds = (
                datetime.now(timezone.utc) - fetched_at.astimezone(timezone.utc)
            ).total_seconds()
            if age_seconds > self.cache_days * 24 * 60 * 60:
                return None
            elements = cached["elements"]
        except (KeyError, OSError, TypeError, ValueError, json.JSONDecodeError):
            return None
        if not isinstance(elements, list):
            return None
        return elements

    def query(self, query: str) -> list[dict[str, Any]]:
        cache_path = self._cache_path(query)
        cached = self._read_cache(cache_path)
        if cached is not None:
            return cached

        last_error: Exception | None = None
        for attempt in range(self.retries + 1):
            wait_seconds = self.min_request_interval - (
                time.monotonic() - self.last_request_at
            )
            if wait_seconds > 0:
                time.sleep(wait_seconds)
            request = urllib.request.Request(
                self.endpoint,
                data=urllib.parse.urlencode({"data": query}).encode("utf-8"),
                headers={
                    "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                    "User-Agent": (
                        "MonosakiOpeningHoursEnrichment/1.0 "
                        "(https://github.com/jphacks/tka_2622)"
                    ),
                },
                method="POST",
            )
            self.last_request_at = time.monotonic()
            try:
                with urllib.request.urlopen(
                    request, timeout=REQUEST_TIMEOUT_SECONDS
                ) as response:
                    payload = json.loads(response.read())
                elements = payload.get("elements")
                if not isinstance(elements, list):
                    raise RuntimeError("Overpass response does not contain elements.")
                cache_path.write_text(
                    json.dumps(
                        {
                            "fetched_at": datetime.now(timezone.utc).isoformat(),
                            "elements": elements,
                        },
                        ensure_ascii=False,
                    ),
                    encoding="utf-8",
                )
                return elements
            except urllib.error.HTTPError as error:
                last_error = error
                if error.code not in RETRYABLE_HTTP_STATUSES or attempt >= self.retries:
                    detail = error.read(500).decode("utf-8", errors="replace")
                    raise RuntimeError(
                        f"Overpass request failed (HTTP {error.code}): {detail}"
                    ) from error
                retry_after = error.headers.get("Retry-After")
                delay = (
                    min(float(retry_after), 60)
                    if retry_after and retry_after.isdigit()
                    else min(60, 2**attempt + random.random())
                )
                time.sleep(delay)
            except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
                last_error = error
                if attempt >= self.retries:
                    raise RuntimeError(
                        f"Overpass request failed after {attempt + 1} attempts: {error}"
                    ) from error
                time.sleep(min(60, 2**attempt + random.random()))
        raise RuntimeError(f"Overpass request failed: {last_error}")


def request_json(
    url: str,
    api_key: str,
    *,
    method: str = "GET",
    body: dict[str, Any] | None = None,
    prefer: str | None = None,
) -> tuple[Any, dict[str, str]]:
    headers = {
        "apikey": api_key,
        "Accept": "application/json",
    }
    data = None
    if body is not None:
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers["Content-Type"] = "application/json"
    if prefer:
        headers["Prefer"] = prefer
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            raw_body = response.read()
            parsed = json.loads(raw_body) if raw_body else None
            return parsed, dict(response.headers.items())
    except urllib.error.HTTPError as error:
        detail = error.read(2000).decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Supabase request failed (HTTP {error.code}): {detail}"
        ) from error
    except urllib.error.URLError as error:
        raise RuntimeError(f"Supabase connection failed: {error.reason}") from error


def fetch_businesses(
    base_url: str, api_key: str
) -> tuple[list[dict[str, Any]], bool]:
    extended_fields = BUSINESS_FIELDS + ENRICHMENT_FIELDS
    has_enrichment_fields = True
    businesses: list[dict[str, Any]] = []
    offset = 0
    while offset < 1_000_000:
        selected_fields = extended_fields if has_enrichment_fields else BUSINESS_FIELDS
        query_params = urllib.parse.urlencode(
            {
                "select": ",".join(selected_fields),
                "order": "business_id.asc",
                "limit": str(PAGE_SIZE),
                "offset": str(offset),
            }
        )
        url = f"{base_url.rstrip('/')}/rest/v1/businesses?{query_params}"
        try:
            page, _ = request_json(url, api_key)
        except RuntimeError as error:
            if has_enrichment_fields and "column" in str(error).lower():
                has_enrichment_fields = False
                businesses.clear()
                offset = 0
                continue
            raise
        if not isinstance(page, list):
            raise RuntimeError("Supabase returned an invalid businesses response.")
        businesses.extend(page)
        if len(page) < PAGE_SIZE:
            return businesses, has_enrichment_fields
        offset += PAGE_SIZE
    raise RuntimeError("Supabase returned too many business rows for safe pagination.")


def candidate_elements_by_tile(
    businesses: list[dict[str, Any]], client: OverpassClient
) -> dict[tuple[str, str], dict[str, Any]]:
    tiles = {
        grid_key(float(row["latitude"]), float(row["longitude"]))
        for row in businesses
        if row.get("latitude") is not None and row.get("longitude") is not None
    }
    elements: dict[tuple[str, str], dict[str, Any]] = {}
    for tile in sorted(tiles):
        for element in client.query(tile_query(tile)):
            key = element_key(element)
            elements[key] = element
    return elements


def cached_elements_by_tile(
    businesses: list[dict[str, Any]], client: OverpassClient
) -> dict[tuple[str, str], dict[str, Any]]:
    tiles = {
        grid_key(float(row["latitude"]), float(row["longitude"]))
        for row in businesses
        if row.get("latitude") is not None and row.get("longitude") is not None
    }
    elements: dict[tuple[str, str], dict[str, Any]] = {}
    for tile in sorted(tiles):
        query = tile_query(tile)
        cached = client._read_cache(client._cache_path(query))
        if cached is None:
            continue
        for element in cached:
            key = element_key(element)
            elements[key] = element
    return elements


def elements_by_existing_ids(
    businesses: list[dict[str, Any]], client: OverpassClient
) -> dict[tuple[str, str], dict[str, Any]]:
    refs = sorted(
        {
            (str(row["osm_object_type"]), str(row["osm_object_id"]))
            for row in businesses
            if row.get("osm_object_type") in {"node", "way", "relation"}
            and row.get("osm_object_id") is not None
            and str(row.get("osm_object_id")).isdigit()
        }
    )
    elements: dict[tuple[str, str], dict[str, Any]] = {}
    for offset in range(0, len(refs), ID_BATCH_SIZE):
        batch = refs[offset : offset + ID_BATCH_SIZE]
        for element in client.query(object_query(batch)):
            key = element_key(element)
            elements[key] = element
    return elements


def validate_business_coordinates(
    row: dict[str, Any],
) -> tuple[float, float] | None:
    latitude, longitude = row.get("latitude"), row.get("longitude")
    if latitude is None or longitude is None:
        return None
    try:
        latitude_value = float(latitude)
        longitude_value = float(longitude)
    except (TypeError, ValueError):
        return None
    if not (
        math.isfinite(latitude_value)
        and math.isfinite(longitude_value)
        and -90 <= latitude_value <= 90
        and -180 <= longitude_value <= 180
    ):
        return None
    return latitude_value, longitude_value


def find_nearby_candidates(
    row: dict[str, Any],
    elements: dict[tuple[str, str], dict[str, Any]],
    coordinates: tuple[float, float],
) -> list[dict[str, Any]]:
    matches: list[dict[str, Any]] = []
    for element in elements.values():
        tags = element.get("tags")
        if not isinstance(tags, dict):
            continue
        candidate_name = str(tags.get("name") or "").strip()
        candidate_coordinates = element_coordinates(element)
        if not candidate_name or candidate_coordinates is None:
            continue
        distance = haversine_meters(*coordinates, *candidate_coordinates)
        if distance > SEARCH_RADIUS_METERS:
            continue
        similarity = name_similarity(str(row.get("name") or ""), candidate_name)
        if normalize_name(str(row.get("name") or "")) == normalize_name(candidate_name):
            similarity = 1.0
        if similarity < MIN_NAME_SIMILARITY_FOR_REVIEW:
            continue
        element_type, element_id = element_key(element)
        matches.append(
            {
                "element": element,
                "name": candidate_name,
                "distance_meters": round(distance),
                "similarity": similarity,
                "osm_object_type": element_type,
                "osm_object_id": element_id,
            }
        )
    return sorted(
        matches,
        key=lambda candidate: (
            -candidate["similarity"],
            candidate["distance_meters"],
            candidate["osm_object_type"],
            candidate["osm_object_id"],
        ),
    )


def decide_business(
    row: dict[str, Any],
    elements: dict[tuple[str, str], dict[str, Any]],
    *,
    has_enrichment_fields: bool,
) -> list[dict[str, Any]]:
    business_id = str(row.get("business_id") or "")
    business_name = str(row.get("name") or "").strip()
    if has_enrichment_fields and str(row.get("opening_hours") or "").strip():
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "skipped_existing",
                "reason": "OSM opening_hours already populated; preserved.",
            }
        ]
    if has_complete_schedule(row):
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "skipped_existing",
                "reason": "Existing weekday and holiday hours are complete; preserved.",
            }
        ]
    if not business_name:
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "manual_review",
                "reason": "Business name is missing.",
            }
        ]

    coordinate_status = str(row.get("coordinate_status") or "")
    coordinates = validate_business_coordinates(row)
    existing_type = str(row.get("osm_object_type") or "")
    existing_id = str(row.get("osm_object_id") or "")
    direct_ref = (existing_type, existing_id)

    if existing_type or existing_id:
        element = elements.get(direct_ref)
        if element is None:
            return [
                {
                    "business_id": business_id,
                    "business_name": business_name,
                    "decision": "manual_review",
                    "reason": "Stored OSM reference was not found by Overpass.",
                    "osm_object_type": existing_type,
                    "osm_object_id": existing_id,
                }
            ]
        element_type, element_id = element_key(element)
        candidate_name = str(element.get("tags", {}).get("name") or "").strip()
        candidate_coordinates = element_coordinates(element)
        distance = (
            round(haversine_meters(*coordinates, *candidate_coordinates))
            if coordinates and candidate_coordinates
            else None
        )
        if coordinate_status != "provided_by_source":
            reason = "Business coordinate status is uncertain."
        elif not candidate_name or normalize_name(candidate_name) != normalize_name(
            business_name
        ):
            reason = "Stored OSM reference name conflicts with the business name."
        elif distance is not None and distance > SEARCH_RADIUS_METERS:
            reason = "Stored OSM reference is too far from the business coordinates."
        else:
            return [
                {
                    "business_id": business_id,
                    "business_name": business_name,
                    "decision": "matched",
                    "reason": "Existing OSM ID and exact normalized name match.",
                    "osm_name": candidate_name,
                    "osm_object_type": element_type,
                    "osm_object_id": element_id,
                    "distance_meters": distance,
                    "opening_hours": element.get("tags", {}).get("opening_hours"),
                }
            ]
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "manual_review",
                "reason": reason,
                "osm_name": candidate_name,
                "osm_object_type": element_type,
                "osm_object_id": element_id,
                "distance_meters": distance,
                "opening_hours": element.get("tags", {}).get("opening_hours"),
            }
        ]

    if coordinate_status != "provided_by_source":
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "manual_review",
                "reason": "Business coordinate status is pending or conflicts with source.",
            }
        ]
    if coordinates is None:
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "manual_review",
                "reason": "Business coordinates are missing or invalid.",
            }
        ]

    nearby = find_nearby_candidates(row, elements, coordinates)
    exact = [item for item in nearby if item["similarity"] == 1.0]
    if (
        len(exact) == 1
        and len(nearby) == 1
        and exact[0]["distance_meters"] <= AUTO_MATCH_RADIUS_METERS
    ):
        candidate = exact[0]
        tags = candidate["element"].get("tags", {})
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "matched",
                "reason": "Unique exact normalized name within 100 meters.",
                "osm_name": candidate["name"],
                "osm_object_type": candidate["osm_object_type"],
                "osm_object_id": candidate["osm_object_id"],
                "distance_meters": candidate["distance_meters"],
                "opening_hours": tags.get("opening_hours"),
            }
        ]
    if nearby:
        reason = (
            "Multiple exact-name OSM candidates need review."
            if len(exact) > 1
            else "Candidate name or distance does not meet automatic-match criteria."
        )
        return [
            {
                "business_id": business_id,
                "business_name": business_name,
                "decision": "manual_review",
                "reason": reason,
                "osm_name": candidate["name"],
                "osm_object_type": candidate["osm_object_type"],
                "osm_object_id": candidate["osm_object_id"],
                "distance_meters": candidate["distance_meters"],
                "opening_hours": candidate["element"].get("tags", {}).get(
                    "opening_hours"
                ),
            }
            for candidate in nearby
        ]
    return [
        {
            "business_id": business_id,
            "business_name": business_name,
            "decision": "no_match",
            "reason": "No sufficiently similar named OSM shop within 250 meters.",
        }
    ]


def recently_checked(row: dict[str, Any], recheck_days: int) -> bool:
    checked_at = row.get("opening_hours_checked_at")
    if not checked_at:
        return False
    try:
        parsed = datetime.fromisoformat(str(checked_at).replace("Z", "+00:00"))
    except ValueError:
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    age = datetime.now(timezone.utc) - parsed.astimezone(timezone.utc)
    return age.total_seconds() < recheck_days * 24 * 60 * 60


def write_report(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fields = (
        "business_id",
        "business_name",
        "decision",
        "reason",
        "osm_name",
        "distance_meters",
        "osm_object_type",
        "osm_object_id",
        "opening_hours",
        "source",
        "source_url",
        "license",
    )
    with path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.DictWriter(stream, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for row in rows:
            element_type = row.get("osm_object_type")
            element_id = row.get("osm_object_id")
            writer.writerow(
                {
                    **row,
                    "source": OSM_ATTRIBUTION if element_type and element_id else "",
                    "source_url": (
                        osm_object_url(str(element_type), str(element_id))
                        if element_type and element_id
                        else ""
                    ),
                    "license": OSM_LICENSE if element_type and element_id else "",
                }
            )


def print_results(
    businesses: list[dict[str, Any]],
    results: list[dict[str, Any]],
    has_enrichment_fields: bool,
    report_path: Path,
    *,
    apply_changes: bool,
) -> None:
    decisions_by_business: dict[str, list[dict[str, Any]]] = {}
    for result in results:
        decisions_by_business.setdefault(result["business_id"], []).append(result)
    matched_ids = {
        business_id
        for business_id, rows in decisions_by_business.items()
        if any(row["decision"] == "matched" for row in rows)
    }
    found_hours_ids = {
        business_id
        for business_id, rows in decisions_by_business.items()
        if any(
            row["decision"] == "matched"
            and str(row.get("opening_hours") or "").strip()
            for row in rows
        )
    }
    manual_ids = {
        business_id
        for business_id, rows in decisions_by_business.items()
        if any(row["decision"] == "manual_review" for row in rows)
    }
    skipped_ids = {
        business_id
        for business_id, rows in decisions_by_business.items()
        if any(row["decision"] == "skipped_existing" for row in rows)
    }
    recently_checked_ids = {
        business_id
        for business_id, rows in decisions_by_business.items()
        if any(row["decision"] == "skipped_recent_check" for row in rows)
    }
    due_count = len(businesses) - len(skipped_ids) - len(recently_checked_ids)
    not_found_count = max(0, due_count - len(found_hours_ids) - len(manual_ids))

    print(
        "Opening Hours Enrichment — Apply"
        if apply_changes
        else "Opening Hours Enrichment — Dry Run"
    )
    print(f"Existing businesses: {len(businesses)}")
    print(f"Successful matches: {len(matched_ids)}")
    print(f"Opening hours found: {len(found_hours_ids)}")
    print(f"Needs manual confirmation: {len(manual_ids)}")
    print(f"No verified opening hours found: {not_found_count}")
    print(f"Already complete/enriched and skipped: {len(skipped_ids)}")
    print(f"Recently checked and skipped: {len(recently_checked_ids)}")
    print(f"Legacy schema (enrichment migration required): {not has_enrichment_fields}")
    print(f"Report: {report_path}")
    print()
    print("Decision | Business | Distance | OSM candidate | Opening hours | Source")
    for result in results:
        name = result.get("osm_name") or ""
        distance = (
            f'{result["distance_meters"]}m'
            if result.get("distance_meters") is not None
            else "-"
        )
        source = (
            f'{result.get("osm_object_type")}/{result.get("osm_object_id")} '
            f"({OSM_ATTRIBUTION})"
            if result.get("osm_object_type") and result.get("osm_object_id")
            else "-"
        )
        print(
            f'{result["decision"]} | {result["business_name"]} | {distance} | '
            f'{name or result.get("reason", "")} | '
            f'{result.get("opening_hours") or "NULL"} | {source}'
        )


def update_business(
    base_url: str,
    api_key: str,
    business_id: str,
    result: dict[str, Any],
) -> bool:
    element_type = result["osm_object_type"]
    element_id = result["osm_object_id"]
    opening_hours = str(result.get("opening_hours") or "").strip() or None
    payload: dict[str, Any] = {
        "osm_object_type": element_type,
        "osm_object_id": element_id,
        "opening_hours": opening_hours,
        "opening_hours_source": "OpenStreetMap",
        "opening_hours_source_url": osm_object_url(element_type, element_id),
        "opening_hours_license": OSM_LICENSE,
        "opening_hours_checked_at": datetime.now(timezone.utc).isoformat(),
    }
    query = urllib.parse.urlencode(
        {
            "business_id": f"eq.{business_id}",
            "or": '(opening_hours.is.null,opening_hours.eq."")',
        }
    )
    url = f"{base_url.rstrip('/')}/rest/v1/businesses?{query}"
    saved, _ = request_json(
        url,
        api_key,
        method="PATCH",
        body=payload,
        prefer="return=representation",
    )
    if not isinstance(saved, list):
        raise RuntimeError("Supabase returned an invalid response to the update.")
    if len(saved) > 1:
        raise RuntimeError(
            f"Supabase updated multiple rows for business {business_id}."
        )
    return len(saved) == 1


def main() -> int:
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8", errors="backslashreplace")
    load_local_env()
    parser = argparse.ArgumentParser(
        description=(
            "Find conservative OSM opening-hours matches for existing Supabase "
            "businesses. Defaults to a read-only dry run."
        )
    )
    parser.add_argument(
        "--apply",
        action="store_true",
        help="write only automatically matched OSM fields; requires confirmation",
    )
    parser.add_argument(
        "--report",
        type=Path,
        default=DEFAULT_CACHE_DIR / "latest-report.csv",
        help="CSV report path (default: .cache/opening-hours-enrichment/latest-report.csv)",
    )
    parser.add_argument(
        "--cache-days",
        type=int,
        default=7,
        help="reuse successful Overpass responses for this many days (default: 7)",
    )
    parser.add_argument(
        "--recheck-days",
        type=int,
        default=30,
        help="skip matched OSM IDs checked within this many days (default: 30)",
    )
    parser.add_argument(
        "--refresh-cache",
        action="store_true",
        help="ignore cached Overpass responses and fetch fresh data",
    )
    parser.add_argument(
        "--retries",
        type=int,
        default=3,
        help="retry transient Overpass failures (default: 3)",
    )
    parser.add_argument(
        "--min-request-interval",
        type=float,
        default=1.1,
        help="minimum seconds between uncached Overpass requests (default: 1.1)",
    )
    parser.add_argument(
        "--overpass-url",
        default=os.environ.get("OVERPASS_URL", DEFAULT_OVERPASS_URL),
        help="Overpass interpreter endpoint",
    )
    parser.add_argument(
        "--osm-csv",
        type=Path,
        action="append",
        help=(
            "read an existing bulk OSM candidate CSV instead of requesting Overpass; "
            "may be specified more than once"
        ),
    )
    parser.add_argument(
        "--live-overpass",
        action="store_true",
        help="query Overpass in addition to the local bulk dataset",
    )
    args = parser.parse_args()
    if (
        args.cache_days < 0
        or args.recheck_days < 0
        or args.retries < 0
        or args.min_request_interval < 0
    ):
        parser.error("cache days, recheck days, retries, and request interval must be non-negative")

    base_url = (
        os.environ.get("SUPABASE_URL", "").strip()
        or os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
    )
    api_key = (
        os.environ.get("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "").strip()
        or os.environ.get("SUPABASE_PUBLISHABLE_KEY", "").strip()
    )
    if not base_url or not api_key:
        raise ValueError(
            "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY "
            "in .env.local for the read-only business query."
        )
    if not base_url.startswith("https://"):
        raise ValueError("The Supabase URL must use HTTPS.")
    if not args.overpass_url.startswith("https://"):
        raise ValueError("The Overpass endpoint must use HTTPS.")

    businesses, has_enrichment_fields = fetch_businesses(base_url, api_key)
    due_businesses = [
        row
        for row in businesses
        if not (
            has_enrichment_fields
            and (
                str(row.get("opening_hours") or "").strip()
                or recently_checked(row, args.recheck_days)
            )
        )
    ]
    csv_paths = args.osm_csv
    if csv_paths is None:
        configured_data_dir = Path(
            os.environ.get("OPENING_HOURS_OSM_DATA_DIR", str(DEFAULT_OSM_DATA_DIR))
        )
        csv_paths = [
            configured_data_dir / filename
            for filename in DEFAULT_OSM_CSV_NAMES
            if (configured_data_dir / filename).is_file()
        ]

    if csv_paths:
        elements, source_rows, source_rows_with_hours = read_bulk_osm_candidates(
            csv_paths
        )
        cache_client = OverpassClient(
            DEFAULT_CACHE_DIR / "responses",
            args.overpass_url,
            args.cache_days,
            args.min_request_interval,
            args.retries,
            args.refresh_cache,
        )
        coordinate_search_rows = [
            row
            for row in due_businesses
            if not (row.get("osm_object_type") or row.get("osm_object_id"))
            and row.get("coordinate_status") == "provided_by_source"
            and validate_business_coordinates(row) is not None
        ]
        cached_elements = cached_elements_by_tile(
            coordinate_search_rows, cache_client
        )
        for key, element in cached_elements.items():
            if key not in elements or (
                element.get("tags", {}).get("opening_hours")
                and not elements[key].get("tags", {}).get("opening_hours")
            ):
                elements[key] = element
        print(
            "Bulk OSM source: "
            f"{len(csv_paths)} CSV file(s), {source_rows} source rows, "
            f"{len(elements)} unique OSM objects, "
            f"{source_rows_with_hours} rows with opening_hours."
        )
        print(
            "Cached Overpass tile objects used: "
            f"{len(cached_elements)}; no new Overpass requests made."
        )
        if args.live_overpass:
            live_elements = elements_by_existing_ids(due_businesses, cache_client)
            live_elements.update(
                candidate_elements_by_tile(coordinate_search_rows, cache_client)
            )
            elements.update(live_elements)
            print(
                f"Live Overpass tile/object lookup enabled; "
                f"{len(live_elements)} additional OSM references loaded."
            )
        elif args.refresh_cache:
            parser.error("--refresh-cache requires --live-overpass with local CSV data")
    else:
        client = OverpassClient(
            DEFAULT_CACHE_DIR / "responses",
            args.overpass_url,
            args.cache_days,
            args.min_request_interval,
            args.retries,
            args.refresh_cache,
        )
        elements = elements_by_existing_ids(due_businesses, client)
        coordinate_search_rows = [
            row
            for row in due_businesses
            if not (row.get("osm_object_type") or row.get("osm_object_id"))
            and row.get("coordinate_status") == "provided_by_source"
            and validate_business_coordinates(row) is not None
        ]
        elements.update(candidate_elements_by_tile(coordinate_search_rows, client))
        print("Bulk OSM CSVs not found; using rate-limited Overpass queries.")
    results = [
        result
        for row in businesses
        for result in (
            [
                {
                    "business_id": str(row.get("business_id") or ""),
                    "business_name": str(row.get("name") or "").strip(),
                    "decision": "skipped_recent_check",
                    "reason": "Stored OSM reference was checked recently; preserved.",
                }
            ]
            if has_enrichment_fields
            and not str(row.get("opening_hours") or "").strip()
            and recently_checked(row, args.recheck_days)
            else decide_business(
                row, elements, has_enrichment_fields=has_enrichment_fields
            )
        )
    ]
    write_report(args.report.resolve(), results)
    print_results(
        businesses,
        results,
        has_enrichment_fields,
        args.report.resolve(),
        apply_changes=args.apply,
    )

    if not args.apply:
        print("Dry run only: Supabase records were not modified.")
        return 0
    if not has_enrichment_fields:
        raise ValueError(
            "Apply requires the opening-hours enrichment migration to be applied first."
        )
    service_role_key = (
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
        or os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    )
    if not service_role_key:
        raise ValueError(
            "Set SUPABASE_SERVICE_ROLE_KEY in .env.local to use --apply."
        )
    if not sys.stdin.isatty():
        raise ValueError(
            "Apply requires an interactive terminal. Review the dry-run report first."
        )

    matched: dict[str, dict[str, Any]] = {}
    for result in results:
        if result["decision"] == "matched":
            matched[result["business_id"]] = result
    confirmation = input(
        f'Type "APPLY {len(matched)}" to update only those businesses: '
    )
    if confirmation != f"APPLY {len(matched)}":
        print("Confirmation did not match; no database changes were made.")
        return 1

    updated = 0
    skipped = 0
    for business_id, result in matched.items():
        if update_business(base_url, service_role_key, business_id, result):
            updated += 1
        else:
            skipped += 1
    print(f"Updated matched businesses: {updated}; skipped changed rows: {skipped}.")
    print(
        f"Attribution: {OSM_ATTRIBUTION}; license: {OSM_LICENSE} "
        f"({OSM_COPYRIGHT_URL})."
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError) as error:
        print(f"Opening-hours enrichment failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error
