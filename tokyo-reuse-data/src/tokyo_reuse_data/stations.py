from __future__ import annotations

from collections import defaultdict
from math import floor
from pathlib import Path
from statistics import mean

from .geospatial import distance_meters, point_in_polygon
from .shapefiles import ShapeFeature, read_features, rings_from_feature

N02_STATION_FEATURES = "N02-25_GML/UTF-8/N02-25_Station.shp"
N03_TOKYO_FEATURES = "N03-20240101_13.shp"
GRID_DEGREES = 0.1


def _polyline_midpoint(
    points: list[tuple[float, float]],
) -> tuple[float, float] | None:
    if not points:
        return None
    if len(points) == 1:
        return points[0]
    segment_lengths = [
        distance_meters(*first, *second)
        for first, second in zip(points, points[1:])
    ]
    total_length = sum(segment_lengths)
    if total_length == 0:
        return points[0]
    target = total_length / 2
    traversed = 0.0
    for (start_lon, start_lat), (end_lon, end_lat), length in zip(
        points, points[1:], segment_lengths
    ):
        if traversed + length >= target:
            fraction = (target - traversed) / length if length else 0
            return (
                start_lon + (end_lon - start_lon) * fraction,
                start_lat + (end_lat - start_lat) * fraction,
            )
        traversed += length
    return points[-1]


def _grid_cells(
    bbox: tuple[float, float, float, float],
) -> list[tuple[int, int]]:
    min_lon, min_lat, max_lon, max_lat = bbox
    x_start = floor(min_lon / GRID_DEGREES)
    x_end = floor(max_lon / GRID_DEGREES)
    y_start = floor(min_lat / GRID_DEGREES)
    y_end = floor(max_lat / GRID_DEGREES)
    if (x_end - x_start + 1) * (y_end - y_start + 1) > 5000:
        return []
    return [
        (x, y)
        for x in range(x_start, x_end + 1)
        for y in range(y_start, y_end + 1)
    ]


def _tokyo_boundary_index(
    features: list[ShapeFeature],
) -> dict[tuple[int, int], list[ShapeFeature]]:
    index: dict[tuple[int, int], list[ShapeFeature]] = defaultdict(list)
    for feature in features:
        if not str(feature.attributes.get("N03_007") or "").startswith("13"):
            continue
        for cell in _grid_cells(feature.bbox):
            index[cell].append(feature)
    return index


def _is_in_tokyo(
    longitude: float,
    latitude: float,
    boundary_index: dict[tuple[int, int], list[ShapeFeature]],
) -> bool:
    cell = (floor(longitude / GRID_DEGREES), floor(latitude / GRID_DEGREES))
    for feature in boundary_index.get(cell, []):
        min_lon, min_lat, max_lon, max_lat = feature.bbox
        if not (min_lon <= longitude <= max_lon and min_lat <= latitude <= max_lat):
            continue
        if point_in_polygon(longitude, latitude, rings_from_feature(feature)):
            return True
    return False


def process_stations(
    n02_archive: Path,
    n03_archive: Path,
) -> tuple[list[dict[str, object]], dict[str, int]]:
    n02_features, n02_raw_count = read_features(
        n02_archive, N02_STATION_FEATURES, encoding="utf-8"
    )
    n03_features, n03_raw_count = read_features(
        n03_archive, N03_TOKYO_FEATURES, encoding="utf-8"
    )
    boundary_index = _tokyo_boundary_index(n03_features)

    valid_features = 0
    tokyo_features = 0
    groups: dict[str, dict[str, object]] = {}
    deduplicated_codes: set[tuple[str, str]] = set()

    for feature in n02_features:
        attributes = feature.attributes
        station_code = str(attributes.get("N02_005c") or "").strip()
        group_code = str(attributes.get("N02_005g") or "").strip()
        station_name = str(attributes.get("N02_005") or "").strip()
        operator = str(attributes.get("N02_004") or "").strip()
        line = str(attributes.get("N02_003") or "").strip()
        location = _polyline_midpoint(feature.points)
        if not station_code or not station_name or location is None:
            continue
        valid_features += 1
        longitude, latitude = location
        if not _is_in_tokyo(longitude, latitude, boundary_index):
            continue
        tokyo_features += 1
        effective_group = group_code or station_code
        dedupe_key = (effective_group, station_code)
        group = groups.setdefault(
            effective_group,
            {
                "source_group_code": group_code or None,
                "members": {},
                "names": set(),
                "operators": set(),
                "lines": set(),
            },
        )
        for key, value in (
            ("names", station_name),
            ("operators", operator),
            ("lines", line),
        ):
            values = group[key]
            assert isinstance(values, set)
            if value:
                values.add(value)
        if dedupe_key not in deduplicated_codes:
            deduplicated_codes.add(dedupe_key)
            members = group["members"]
            assert isinstance(members, dict)
            members[station_code] = location

    stations: list[dict[str, object]] = []
    for group_code, group in groups.items():
        members = group["members"]
        names = sorted(group["names"])
        latitude = mean(point[1] for point in members.values())
        longitude = mean(point[0] for point in members.values())
        if not _is_in_tokyo(longitude, latitude, boundary_index):
            raise ValueError(
                f"Grouped station coordinate falls outside N03 Tokyo boundary: {group_code}"
            )
        stations.append(
            {
                "station_id": f"mlit-n02-group-{group_code}",
                "station_group_code": group["source_group_code"],
                "source_station_codes": "|".join(sorted(members)),
                "station_names": "|".join(names),
                "station_name": " / ".join(names),
                "operators": "|".join(sorted(group["operators"])),
                "lines": "|".join(sorted(group["lines"])),
                "latitude": f"{latitude:.8f}",
                "longitude": f"{longitude:.8f}",
                "coordinate_method": "N02_Station線形状の線長中点を駅コード単位で重複排除後、グループ内平均",
                "coordinate_source": "N02-2025",
                "source_id": "mlit-n02-2025",
            }
        )
    stations.sort(key=lambda station: str(station["station_id"]))
    return stations, {
        "n02_raw_features": n02_raw_count,
        "n02_valid_station_features": valid_features,
        "n03_raw_boundary_features": n03_raw_count,
        "n03_tokyo_boundary_features": sum(
            str(feature.attributes.get("N03_007") or "").startswith("13")
            for feature in n03_features
        ),
        "n02_features_inside_tokyo": tokyo_features,
        "tokyo_station_groups": len(stations),
        "unique_grouped_station_codes": len(deduplicated_codes),
        "station_codes_merged_into_groups": len(deduplicated_codes) - len(stations),
        "duplicate_station_code_features_removed": tokyo_features
        - len(deduplicated_codes),
    }
