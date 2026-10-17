# Tokyo Reuse Data

Local-only collection, validation, standardization, and CSV export for Tokyo
stations and reuse shops. This project does not connect to Supabase.

## Windows / VS Code setup

From the `tokyo-reuse-data` folder in a PowerShell terminal:

```powershell
py -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -e ".[test]"
python -m pytest
python -m tokyo_reuse_data.cli --project-root .
```

Use `--force-download` to replace the source archives in `raw/`.

## Current sources

- MLIT N02 2025 rail data: station names, source station/group codes, operators,
  railway lines, and station-line geometry.
- MLIT N03 2024 Tokyo prefecture archive: official administrative polygons for
  filtering N02 station locations to Tokyo.
- Meguro Ward reuse-shop CSV: licensed CC BY 4.0; only rows explicitly marked
  as Tokyo / Meguro Ward are included in `businesses.csv`.
- Shinagawa Ward reuse-cooperator CSV: licensed CC BY 4.0 and attributed. The
  ward describes these partners as repair/reconditioning stores; the source
  does not confirm secondhand purchasing, so their buyback status remains
  unconfirmed and they must not be recommended as sell destinations.

The Meguro source file contains records outside Meguro Ward. Those rows are
kept in `raw/` for provenance but excluded from `output/businesses.csv`.
Buyback is marked confirmed only when source text explicitly states it;
generic reuse-shop labels and generic “contact the shop” criteria are not
treated as proof.

Shinagawa addresses are checked against the official N03 ward boundary when
source coordinates are present. Missing coordinates and duplicate coordinates
for different addresses are excluded from distance matching. A station with no
current source match remains `no_match_not_investigated`; it is not marked as
an area whose merchant search is complete.

Station coordinates are derived approximations: the midpoint along each N02
station line geometry is de-duplicated by source station code and averaged
within the station group. They are not represented as surveyed platform
centroids.

## Outputs

- `output/stations.csv`
- `output/businesses.csv`
- `output/station_businesses.csv` (Haversine straight-line radius: 3 km)
- `output/sell_station_businesses.csv` (confirmed buyback businesses only)
- `output/station_search_status.csv`
- `reports/sources.csv`
- `reports/collection_report.md`
- `reports/store_data_rights_review.md`

Missing source coordinates remain blank and are not geocoded. Such businesses
are excluded from station-distance matches and marked `pending_geocoding`.
Attribution and license metadata are included in `reports/sources.csv`.
Businesses carry `source_id`, `source_url`, and `source_license`; unconfirmed
buyback records remain in the export but are not eligible for sell matching.
