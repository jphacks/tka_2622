from __future__ import annotations

from dataclasses import dataclass
from io import BytesIO
from pathlib import Path
from zipfile import ZipFile

import shapefile


@dataclass
class ShapeFeature:
    attributes: dict[str, object]
    points: list[tuple[float, float]]
    parts: list[int]
    bbox: tuple[float, float, float, float]


def read_features(
    archive_path: Path,
    shp_suffix: str,
    *,
    encoding: str,
) -> tuple[list[ShapeFeature], int]:
    with ZipFile(archive_path) as archive:
        shp_name = next(
            (
                name
                for name in archive.namelist()
                if name.lower().endswith(shp_suffix.lower())
                and name.lower().endswith(".shp")
            ),
            None,
        )
        if shp_name is None:
            raise FileNotFoundError(
                f"Shapefile {shp_suffix!r} was not found in {archive_path.name}"
            )
        stem = shp_name[:-4]
        reader = shapefile.Reader(
            shp=BytesIO(archive.read(shp_name)),
            shx=BytesIO(archive.read(stem + ".shx")),
            dbf=BytesIO(archive.read(stem + ".dbf")),
            encoding=encoding,
        )
        try:
            features = [
                ShapeFeature(
                    attributes=shape_record.record.as_dict(),
                    points=[
                        (float(x), float(y))
                        for x, y in shape_record.shape.points
                    ],
                    parts=list(shape_record.shape.parts),
                    bbox=tuple(float(value) for value in shape_record.shape.bbox),
                )
                for shape_record in reader.iterShapeRecords()
            ]
            return features, len(reader)
        finally:
            reader.close()


def rings_from_feature(feature: ShapeFeature) -> list[list[tuple[float, float]]]:
    starts = feature.parts or [0]
    ends = [*starts[1:], len(feature.points)]
    return [
        feature.points[start:end]
        for start, end in zip(starts, ends, strict=True)
        if end - start >= 3
    ]
