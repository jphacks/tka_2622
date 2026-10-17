from __future__ import annotations

import unicodedata


def _key(value: object) -> str:
    normalized = unicodedata.normalize("NFKC", str(value or ""))
    return "".join(character for character in normalized if not character.isspace())


def _entity_key(business: dict[str, object]) -> tuple[str, str, str]:
    municipality = _key(business.get("municipality"))
    address = _key(business.get("address"))
    detail = _key(business.get("address_detail"))
    if municipality and not address.startswith(municipality):
        address = municipality + address
    return _key(business.get("name")), address, detail


def merge_businesses(
    existing: list[dict[str, object]],
    incoming: list[dict[str, object]],
) -> tuple[list[dict[str, object]], int]:
    merged = list(existing)
    known_keys = {_entity_key(business) for business in existing}
    duplicate_count = 0
    for business in incoming:
        key = _entity_key(business)
        if key in known_keys:
            duplicate_count += 1
            continue
        known_keys.add(key)
        merged.append(business)
    return merged, duplicate_count
