"""Build the Tokyo garbage collection schedule data bundled with the app.

Reads a local checkout of https://github.com/tecolicom/japan-gomi-data
(CC BY 4.0) and writes compact JSON files under src/data/gomi/tokyo/ plus a
generated TypeScript loader. The source checkout is only read; nothing in it
is executed.

    python scripts/build-gomi-schedule.py --source <path-to-japan-gomi-data>
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIR = ROOT / "src" / "data" / "gomi" / "tokyo"
DATASET_URL = "https://github.com/tecolicom/japan-gomi-data"
PERIOD_PATTERN = re.compile(r"^(\d{4})-(\d{2})--(\d{4})-(\d{2})$")
WEEKDAYS = {"MO", "TU", "WE", "TH", "FR", "SA", "SU"}
PATTERNS = {"weekly", "monthly_nth", "monthly_specific"}


def load_yaml(path: Path):
    with path.open(encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def period_bounds(period: str) -> tuple[str, str]:
    match = PERIOD_PATTERN.match(period)
    if not match:
        raise ValueError(f"Unexpected period: {period}")
    from_year, from_month, to_year, to_month = (int(part) for part in match.groups())
    next_year, next_month = (to_year + 1, 1) if to_month == 12 else (to_year, to_month + 1)
    # "to" is the last day of to_month, expressed as the day before next month.
    return (
        f"{from_year:04d}-{from_month:02d}-01",
        f"{next_year:04d}-{next_month:02d}-01",
    )


def category_labels(source: Path, taxonomy: dict) -> dict[str, str]:
    common = load_yaml(source / "schema" / "categories.yaml")["categories"]
    overrides = taxonomy.get("overrides") or {}
    labels = {}
    for key in taxonomy["categories"]:
        label = (overrides.get(key) or {}).get("label") or common[key]["label"]
        labels[key] = label
    return labels


def build_rule(rule: dict, path: Path) -> dict:
    pattern = rule["pattern"]
    if pattern not in PATTERNS:
        raise ValueError(f"{path}: unsupported pattern {pattern}")
    days = rule.get("days") or []
    if any(day not in WEEKDAYS for day in days):
        raise ValueError(f"{path}: unexpected weekday in {days}")
    built = {"category": rule["category"], "pattern": pattern}
    if days:
        built["days"] = list(days)
    if rule.get("occurrences"):
        built["occurrences"] = list(rule["occurrences"])
    if rule.get("dates"):
        built["dates"] = sorted(str(date) for date in rule["dates"])
    if rule.get("note"):
        built["note"] = rule["note"]
    return built


def build_course(path: Path, categories: dict[str, str]) -> dict:
    data = load_yaml(path)
    metadata = data["metadata"]
    rules = [build_rule(rule, path) for rule in data["rules"]]
    for rule in rules:
        if rule["category"] not in categories:
            raise ValueError(f"{path}: category {rule['category']} not in taxonomy")
    return {
        "id": str(metadata["course"]),
        "name": metadata.get("course_name_ja"),
        "areas": [
            {
                key: value
                for key, value in {
                    "name": area["name"],
                    "yomi": area.get("yomi"),
                    "note": area.get("note"),
                }.items()
                if value
            }
            for area in metadata.get("areas") or []
        ],
        "rules": rules,
        "overrides": [
            {
                key: value
                for key, value in {
                    "date": str(override["date"]),
                    "category": override.get("category"),
                    "cancelled": override.get("cancelled"),
                }.items()
                if value is not None
            }
            for override in data.get("overrides") or []
        ],
        "unknownPeriods": [
            {"from": str(item["from"]), "to": str(item["to"])}
            for item in data.get("unknown_periods") or []
        ],
    }


def course_sort_key(course: dict):
    return [int(part) if part.isdigit() else part for part in re.split(r"(\d+)", course["id"])]


def build_municipality(source: Path, directory: Path, survey: dict) -> dict | None:
    meta_path = directory / "meta.yaml"
    taxonomy_path = directory / "taxonomy.yaml"
    period_dirs = sorted(
        path for path in directory.iterdir() if path.is_dir() and PERIOD_PATTERN.match(path.name)
    )
    if not meta_path.exists() or not taxonomy_path.exists() or not period_dirs:
        return None

    meta = load_yaml(meta_path)
    categories = category_labels(source, load_yaml(taxonomy_path))
    periods = []
    for period_dir in period_dirs:
        courses = sorted(
            (build_course(path, categories) for path in period_dir.glob("course-*.yaml")),
            key=course_sort_key,
        )
        names = [area["name"] for course in courses for area in course["areas"]]
        duplicates = sorted({name for name in names if names.count(name) > 1})
        if duplicates:
            raise ValueError(f"{period_dir}: duplicate area names {duplicates[:5]}")
        first_course = load_yaml(next(period_dir.glob("course-*.yaml")))
        source_info = first_course["metadata"]["source"]
        start, end = period_bounds(period_dir.name)
        periods.append(
            {
                "period": period_dir.name,
                "start": start,
                "endExclusive": end,
                "edition": source_info.get("edition_ja"),
                "sourceUrl": source_info.get("source_url") or source_info.get("pdf_url"),
                "courses": courses,
            }
        )

    return {
        "code": str(survey["code"]),
        "name": survey["name_ja"],
        "officialUrl": (meta.get("source") or {}).get("index_url") or survey["schedule_url"],
        "categories": categories,
        "periods": periods,
    }


def dataset_revision(source: Path) -> str | None:
    try:
        return subprocess.run(
            ["git", "-C", str(source), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        ).stdout.strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def write_json(path: Path, value) -> None:
    path.write_text(
        json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", required=True, type=Path)
    args = parser.parse_args()
    source = args.source.resolve()
    tokyo = source / "municipalities" / "tokyo"

    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for stale in OUTPUT_DIR.glob("*.json"):
        stale.unlink()

    index = []
    schedule_codes = []
    for directory in sorted(path for path in tokyo.iterdir() if path.is_dir()):
        survey = load_yaml(directory / "survey.yaml")
        municipality = build_municipality(source, directory, survey)
        entry = {
            "code": str(survey["code"]),
            "name": survey["name_ja"],
            "officialUrl": survey["schedule_url"],
            "hasSchedule": municipality is not None,
        }
        if municipality:
            entry["officialUrl"] = municipality["officialUrl"]
            entry["periods"] = [
                {"start": period["start"], "endExclusive": period["endExclusive"]}
                for period in municipality["periods"]
            ]
            write_json(OUTPUT_DIR / f"{entry['code']}.json", municipality)
            schedule_codes.append(entry["code"])
        index.append(entry)

    index.sort(key=lambda entry: entry["code"])
    write_json(
        OUTPUT_DIR / "index.json",
        {
            "source": {
                "name": "japan-gomi-data",
                "url": DATASET_URL,
                "revision": dataset_revision(source),
                "license": "CC BY 4.0",
            },
            "municipalities": index,
        },
    )

    loaders = "\n".join(
        f'  "{code}": () => import("./{code}.json"),' for code in sorted(schedule_codes)
    )
    (OUTPUT_DIR / "loaders.ts").write_text(
        "// Generated by scripts/build-gomi-schedule.py. Do not edit by hand.\n"
        "export const scheduleLoaders: Record<string, () => Promise<{ default: unknown }>> = {\n"
        f"{loaders}\n"
        "};\n",
        encoding="utf-8",
    )
    print(f"{len(index)} municipalities, {len(schedule_codes)} with schedules -> {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
