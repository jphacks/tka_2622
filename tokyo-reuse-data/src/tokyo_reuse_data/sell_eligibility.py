from __future__ import annotations


def filter_sell_eligible_links(
    links: list[dict[str, object]],
    businesses: list[dict[str, object]],
) -> list[dict[str, object]]:
    businesses_by_id = {
        str(business["business_id"]): business for business in businesses
    }
    eligible_links: list[dict[str, object]] = []
    for link in links:
        business_id = str(link["business_id"])
        business = businesses_by_id.get(business_id)
        if business is None:
            raise ValueError(f"Station link references an unknown business: {business_id}")
        if business.get("purchase_status") == "confirmed":
            eligible_links.append(link)
    return eligible_links
