from tokyo_reuse_data.businesses import standardize_business_rows
from tokyo_reuse_data.deduplication import merge_businesses
from tokyo_reuse_data.encoding import decode_csv
from tokyo_reuse_data.geospatial import distance_meters, point_in_polygon
from tokyo_reuse_data.matching import link_stations_to_businesses
from tokyo_reuse_data.shinagawa import standardize_shinagawa_rows
from tokyo_reuse_data.sell_eligibility import filter_sell_eligible_links


def _business_row(**overrides: str | None) -> dict[str, str | None]:
    row = {
        "都道府県コード又は市区町村コード": "131105",
        "NO": "1",
        "都道府県名": "東京都",
        "市区町村名": "目黒区",
        "名称": "デモリユース店",
        "名称_カナ": None,
        "店舗の種類": "総合リユースショップ",
        "住所": "目黒区の原資料記載住所",
        "方書": None,
        "緯度": "35.633",
        "経度": "139.698",
        "電話番号": None,
        "取扱商品": "本、衣類",
        "買取基準": "詳細は、店舗にお問い合わせいただくか店舗ホームページをご覧ください。",
        "利用方法特記事項": "店頭買取を行っています。",
        "備考": None,
    }
    row.update(overrides)
    return row


def test_detects_utf8_sig_and_cp932():
    utf8_text, utf8_encoding = decode_csv("店名,住所\n試験,東京\n".encode("utf-8-sig"))
    cp932_text, cp932_encoding = decode_csv("店名,住所\n試験,東京\n".encode("cp932"))

    assert utf8_encoding == "utf-8-sig"
    assert "試験" in utf8_text
    assert cp932_encoding == "cp932"
    assert "東京" in cp932_text


def test_business_scope_and_service_confirmation_do_not_infer_buyback():
    rows = [
        _business_row(),
        _business_row(**{"NO": "2", "利用方法特記事項": None}),
        _business_row(**{"NO": "3", "市区町村名": "渋谷区"}),
        _business_row(
            **{
                "NO": "4",
                "名称": "ゴルフ用品買取店",
                "利用方法特記事項": "クラブの買い取りならびに販売をしています。",
            }
        ),
    ]

    businesses, counts = standardize_business_rows(rows)

    assert len(businesses) == 3
    assert counts["source_rows"] == 4
    assert counts["in_meguro_rows"] == 3
    assert businesses[0]["purchase_status"] == "confirmed"
    assert businesses[1]["purchase_status"] == "unconfirmed"
    assert businesses[1]["products_handled_source_text"] == "本、衣類"
    assert businesses[2]["purchase_status"] == "confirmed"
    assert businesses[2]["sales_status"] == "confirmed"
    assert businesses[2]["service_type_status"] == "buyback_and_sales_confirmed"


def test_explicit_sales_without_buyback_is_not_assumed_to_be_sales_only():
    businesses, _ = standardize_business_rows(
        [
            _business_row(
                **{
                    "名称": "デモ販売店",
                    "利用方法特記事項": "中古品を販売しています。",
                }
            ),
            _business_row(
                **{
                    "NO": "2",
                    "名称": "販売専門デモ店",
                    "利用方法特記事項": "販売を行い、買取は行っていません。",
                }
            ),
        ]
    )

    assert businesses[0]["sales_status"] == "confirmed"
    assert businesses[0]["purchase_status"] == "unconfirmed"
    assert businesses[0]["service_type_status"] == "sales_confirmed_buyback_unconfirmed"
    assert businesses[1]["purchase_status"] == "not_offered"
    assert businesses[1]["service_type_status"] == "sales_only_confirmed"


def test_sell_eligibility_filter_excludes_unconfirmed_and_unknown_links_fail():
    businesses = [
        {"business_id": "confirmed", "purchase_status": "confirmed"},
        {"business_id": "unconfirmed", "purchase_status": "unconfirmed"},
    ]
    links = [
        {"station_id": "s1", "business_id": "confirmed"},
        {"station_id": "s1", "business_id": "unconfirmed"},
    ]

    assert filter_sell_eligible_links(links, businesses) == [links[0]]
    try:
        filter_sell_eligible_links(
            [{"station_id": "s1", "business_id": "unknown"}], businesses
        )
    except ValueError as error:
        assert "unknown business" in str(error)
    else:
        raise AssertionError("Unknown business references must fail explicitly")


def test_missing_coordinates_are_pending_and_never_linked():
    businesses, _ = standardize_business_rows(
        [_business_row(**{"緯度": None, "経度": None})]
    )
    station = {
        "station_id": "station-1",
        "latitude": "35.633",
        "longitude": "139.698",
    }

    assert businesses[0]["coordinate_status"] == "pending_geocoding"
    assert businesses[0]["latitude"] is None
    assert link_stations_to_businesses([station], businesses) == []


def test_point_in_polygon_handles_hole_and_border():
    outer = [(0, 0), (10, 0), (10, 10), (0, 10), (0, 0)]
    hole = [(4, 4), (6, 4), (6, 6), (4, 6), (4, 4)]

    assert point_in_polygon(2, 2, [outer, hole])
    assert not point_in_polygon(5, 5, [outer, hole])
    assert point_in_polygon(0, 4, [outer])


def test_distance_matching_is_straight_line_and_limited_to_three_kilometers():
    near_station = {
        "station_id": "station-1",
        "latitude": "35.633",
        "longitude": "139.698",
    }
    businesses = [
        {
            "business_id": "near",
            "latitude": "35.633",
            "longitude": "139.699",
        },
        {
            "business_id": "far",
            "latitude": "35.633",
            "longitude": "139.75",
        },
    ]

    links = link_stations_to_businesses([near_station], businesses)

    assert [link["business_id"] for link in links] == ["near"]
    assert links[0]["distance_meters"] == round(
        distance_meters(139.698, 35.633, 139.699, 35.633)
    )


def test_shinagawa_partners_are_not_assumed_to_offer_buyback():
    rows = [
        {
            "店名": "修理協力店A",
            "住所": "品川区北品川1-1-1",
            "種別": "家具",
            "郵便番号": "140-0001",
            "電話": None,
            "営業時間": None,
            "定休日": None,
            "緯度": "1",
            "経度": "1",
        },
        {
            "店名": "修理協力店B",
            "住所": "品川区北品川2-2-2",
            "種別": "家具",
            "郵便番号": "140-0001",
            "電話": None,
            "営業時間": None,
            "定休日": None,
            "緯度": "1",
            "経度": "1",
        },
        {
            "店名": "座標なし店舗",
            "住所": "品川区大井1-1-1",
            "種別": "洋服",
            "郵便番号": "140-0014",
            "電話": None,
            "営業時間": None,
            "定休日": None,
            "緯度": None,
            "経度": None,
        },
        {
            "店名": "区外店舗",
            "住所": "大田区東馬込2-8-1",
            "種別": "電化製品",
            "郵便番号": "143-0022",
            "電話": None,
            "営業時間": None,
            "定休日": None,
            "緯度": "1",
            "経度": "1",
        },
    ]
    ward_polygon = [[(0, 0), (2, 0), (2, 2), (0, 2), (0, 0)]]

    businesses, counts = standardize_shinagawa_rows(rows, [ward_polygon])

    assert len(businesses) == 3
    assert counts["source_rows"] == 4
    assert counts["excluded_out_of_scope"] == 1
    assert counts["coordinates_missing"] == 1
    assert counts["coordinate_conflicts"] == 2
    assert all(business["purchase_status"] == "unconfirmed" for business in businesses)
    assert all(business["latitude"] is None for business in businesses)
    assert all(business["source_id"] == "shinagawa-reuse-cooperators" for business in businesses)


def test_business_merge_deduplicates_entity_without_merging_branches():
    existing = [
        {
            "business_id": "verified",
            "name": "同一ブランド",
            "municipality": "品川区",
            "address": "北品川1-1-1",
            "address_detail": None,
        }
    ]
    incoming = [
        {
            "business_id": "duplicate",
            "name": "同一ブランド",
            "municipality": "品川区",
            "address": "北品川1-1-1",
            "address_detail": None,
        },
        {
            "business_id": "branch",
            "name": "同一ブランド",
            "municipality": "品川区",
            "address": "北品川2-2-2",
            "address_detail": None,
        },
    ]

    merged, duplicate_count = merge_businesses(existing, incoming)

    assert [business["business_id"] for business in merged] == ["verified", "branch"]
    assert duplicate_count == 1
