from __future__ import annotations

from .geospatial import distance_meters

MATCH_RADIUS_METERS = 3000


def link_stations_to_businesses(
    stations: list[dict[str, object]],
    businesses: list[dict[str, object]],
    radius_meters: int = MATCH_RADIUS_METERS,
) -> list[dict[str, object]]:
    links: list[dict[str, object]] = []
    for station in stations:
        station_latitude = float(station["latitude"])
        station_longitude = float(station["longitude"])
        for business in businesses:
            if (
                business.get("latitude") is None
                or business.get("longitude") is None
            ):
                continue
            distance = distance_meters(
                station_longitude,
                station_latitude,
                float(business["longitude"]),
                float(business["latitude"]),
            )
            if distance <= radius_meters:
                links.append(
                    {
                        "station_id": station["station_id"],
                        "business_id": business["business_id"],
                        "distance_meters": round(distance),
                        "match_radius_meters": radius_meters,
                        "distance_method": "直線距離（Haversine）",
                    }
                )
    return sorted(
        links,
        key=lambda link: (
            str(link["station_id"]),
            int(link["distance_meters"]),
            str(link["business_id"]),
        ),
    )
