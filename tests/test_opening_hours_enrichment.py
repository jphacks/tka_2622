import importlib.util
import csv
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path


SCRIPT_PATH = Path(__file__).resolve().parents[1] / "scripts" / "enrich_opening_hours.py"
SPEC = importlib.util.spec_from_file_location("enrich_opening_hours", SCRIPT_PATH)
assert SPEC and SPEC.loader
ENRICHMENT = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(ENRICHMENT)


def business(**overrides):
    row = {
        "business_id": "shop-1",
        "name": "リユースショップ青山",
        "address": "Tokyo",
        "latitude": 35.0,
        "longitude": 139.0,
        "coordinate_status": "provided_by_source",
        "opening_days": "月曜日",
        "weekday_open": None,
        "weekday_close": None,
        "holiday_open": None,
        "holiday_close": None,
        "hours_notes": None,
        "osm_object_type": None,
        "osm_object_id": None,
        "opening_hours": None,
    }
    row.update(overrides)
    return row


def osm_element(
    element_id,
    name,
    latitude=35.0001,
    longitude=139.0001,
    opening_hours="Mo-Fr 10:00-18:00",
):
    tags = {"name": name, "shop": "second_hand"}
    if opening_hours is not None:
        tags["opening_hours"] = opening_hours
    return {
        "type": "node",
        "id": element_id,
        "lat": latitude,
        "lon": longitude,
        "tags": tags,
    }


class OpeningHoursMatchingTests(unittest.TestCase):
    def decide(self, row, elements):
        return ENRICHMENT.decide_business(
            row,
            {ENRICHMENT.element_key(element): element for element in elements},
            has_enrichment_fields=True,
        )

    def test_unique_exact_name_nearby_is_automatically_matched(self):
        result = self.decide(
            business(),
            [osm_element(1, "リユースショップ青山")],
        )

        self.assertEqual(result[0]["decision"], "matched")
        self.assertLessEqual(result[0]["distance_meters"], 100)
        self.assertEqual(result[0]["opening_hours"], "Mo-Fr 10:00-18:00")

    def test_missing_osm_hours_remain_null_on_an_exact_match(self):
        result = self.decide(
            business(),
            [osm_element(1, "リユースショップ青山", opening_hours=None)],
        )

        self.assertEqual(result[0]["decision"], "matched")
        self.assertIsNone(result[0]["opening_hours"])

    def test_multiple_exact_candidates_are_sent_for_manual_review(self):
        result = self.decide(
            business(),
            [
                osm_element(1, "リユースショップ青山"),
                osm_element(2, "リユースショップ青山", latitude=35.0002),
            ],
        )

        self.assertEqual({row["decision"] for row in result}, {"manual_review"})
        self.assertEqual(len(result), 2)

    def test_similar_but_not_exact_name_is_not_automatically_matched(self):
        result = self.decide(
            business(),
            [osm_element(1, "リユースショップ青山店")],
        )

        self.assertEqual(result[0]["decision"], "manual_review")

    def test_uncertain_coordinates_require_manual_review(self):
        result = self.decide(
            business(coordinate_status="source_coordinate_conflict"),
            [osm_element(1, "リユースショップ青山")],
        )

        self.assertEqual(result[0]["decision"], "manual_review")

    def test_exact_match_plus_a_competing_similar_candidate_needs_review(self):
        result = self.decide(
            business(),
            [
                osm_element(1, "リユースショップ青山"),
                osm_element(2, "リユースショップ青山店", latitude=35.0002),
            ],
        )

        self.assertEqual({row["decision"] for row in result}, {"manual_review"})

    def test_existing_opening_hours_are_preserved(self):
        result = self.decide(
            business(opening_hours="Tu-Sa 11:00-19:00"),
            [osm_element(1, "リユースショップ青山")],
        )

        self.assertEqual(result[0]["decision"], "skipped_existing")
        self.assertEqual(
            result[0]["reason"],
            "OSM opening_hours already populated; preserved.",
        )

    def test_complete_existing_schedule_is_not_redundantly_enriched(self):
        result = self.decide(
            business(
                weekday_open="10:00",
                weekday_close="19:00",
                holiday_open="10:00",
                holiday_close="18:00",
            ),
            [osm_element(1, "リユースショップ青山")],
        )

        self.assertEqual(result[0]["decision"], "skipped_existing")
        self.assertIn("hours are complete", result[0]["reason"])

    def test_existing_osm_id_is_matched_before_coordinate_search(self):
        row = business(osm_object_type="way", osm_object_id="42")
        element = osm_element(42, "リユースショップ青山")
        element["type"] = "way"

        result = self.decide(row, [element])

        self.assertEqual(result[0]["decision"], "matched")
        self.assertIn("Existing OSM ID", result[0]["reason"])

    def test_existing_osm_id_with_name_conflict_needs_review(self):
        row = business(osm_object_type="node", osm_object_id="42")

        result = self.decide(row, [osm_element(42, "別の店舗")])

        self.assertEqual(result[0]["decision"], "manual_review")
        self.assertIn("conflicts", result[0]["reason"])

    def test_japanese_company_suffix_and_fullwidth_names_normalize(self):
        self.assertEqual(
            ENRICHMENT.normalize_name("株式会社ＢＯＯＫ ＯＦＦ"),
            ENRICHMENT.normalize_name("BOOKOFF"),
        )

    def test_bulk_osm_csvs_deduplicate_objects_and_retain_hours(self):
        fields = [
            "candidate_id",
            "name",
            "latitude",
            "longitude",
            "secondary_tags",
            "osm_type",
            "osm_id",
        ]
        with tempfile.TemporaryDirectory() as directory:
            csv_path = Path(directory) / "candidates.csv"
            with csv_path.open("w", encoding="utf-8", newline="") as stream:
                writer = csv.DictWriter(stream, fieldnames=fields)
                writer.writeheader()
                writer.writerow(
                    {
                        "candidate_id": "node-1",
                        "name": "リユースショップ青山",
                        "latitude": "35.0001",
                        "longitude": "139.0001",
                        "secondary_tags": json.dumps(
                            {"shop": "second_hand", "opening_hours": "Mo-Fr 10:00-18:00"},
                            ensure_ascii=False,
                        ),
                        "osm_type": "node",
                        "osm_id": "1",
                    }
                )
                writer.writerow(
                    {
                        "candidate_id": "node-1-duplicate",
                        "name": "リユースショップ青山",
                        "latitude": "35.0001",
                        "longitude": "139.0001",
                        "secondary_tags": json.dumps(
                            {"shop": "second_hand"}, ensure_ascii=False
                        ),
                        "osm_type": "node",
                        "osm_id": "1",
                    }
                )

            elements, row_count, rows_with_hours = ENRICHMENT.read_bulk_osm_candidates(
                [csv_path]
            )

        self.assertEqual(row_count, 2)
        self.assertEqual(rows_with_hours, 1)
        self.assertEqual(len(elements), 1)
        self.assertEqual(
            elements[("node", "1")]["tags"]["opening_hours"],
            "Mo-Fr 10:00-18:00",
        )

    def test_recently_checked_records_are_not_queried_again(self):
        row = business(
            opening_hours_checked_at=(
                datetime.now(timezone.utc) - timedelta(days=2)
            ).isoformat()
        )

        self.assertTrue(ENRICHMENT.recently_checked(row, 30))
        self.assertFalse(ENRICHMENT.recently_checked(row, 1))


if __name__ == "__main__":
    unittest.main()
