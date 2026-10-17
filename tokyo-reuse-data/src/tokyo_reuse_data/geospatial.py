from __future__ import annotations

from typing import Iterable, Sequence


EARTH_RADIUS_METERS = 6_371_008.8


def _point_on_segment(
    x: float, y: float, start: tuple[float, float], end: tuple[float, float]
) -> bool:
    sx, sy = start
    ex, ey = end
    cross = (x - sx) * (ey - sy) - (y - sy) * (ex - sx)
    if abs(cross) > 1e-10:
        return False
    return (
        min(sx, ex) - 1e-10 <= x <= max(sx, ex) + 1e-10
        and min(sy, ey) - 1e-10 <= y <= max(sy, ey) + 1e-10
    )


def point_in_ring(
    longitude: float, latitude: float, ring: Sequence[tuple[float, float]]
) -> bool:
    if len(ring) < 3:
        return False
    inside = False
    previous = ring[-1]
    for current in ring:
        if _point_on_segment(longitude, latitude, previous, current):
            return True
        x1, y1 = previous
        x2, y2 = current
        if (y1 > latitude) != (y2 > latitude):
            crossing_x = (x2 - x1) * (latitude - y1) / (y2 - y1) + x1
            if longitude < crossing_x:
                inside = not inside
        previous = current
    return inside


def point_in_polygon(
    longitude: float,
    latitude: float,
    rings: Iterable[Sequence[tuple[float, float]]],
) -> bool:
    inside = False
    for ring in rings:
        if point_in_ring(longitude, latitude, ring):
            inside = not inside
    return inside


def distance_meters(
    longitude_a: float,
    latitude_a: float,
    longitude_b: float,
    latitude_b: float,
) -> float:
    from math import asin, cos, radians, sin, sqrt

    lat1, lat2 = radians(latitude_a), radians(latitude_b)
    delta_lat = lat2 - lat1
    delta_lon = radians(longitude_b - longitude_a)
    haversine = (
        sin(delta_lat / 2) ** 2
        + cos(lat1) * cos(lat2) * sin(delta_lon / 2) ** 2
    )
    return 2 * EARTH_RADIUS_METERS * asin(sqrt(min(1.0, haversine)))
