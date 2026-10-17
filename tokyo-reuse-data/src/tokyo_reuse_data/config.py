from dataclasses import dataclass


@dataclass(frozen=True)
class SourceDefinition:
    source_id: str
    name: str
    url: str
    version: str
    license_name: str
    license_url: str
    allows_long_term_storage: bool
    attribution: str
    filename: str
    file_format: str
    scope: str


SOURCES = (
    SourceDefinition(
        source_id="mlit-n02-2025",
        name="国土数値情報 鉄道データ N02 2025",
        url="https://nlftp.mlit.go.jp/ksj/gml/data/N02/N02-25/N02-25_GML.zip",
        version="2025",
        license_name="オープンデータ（CC BY 4.0）",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        allows_long_term_storage=True,
        attribution="出典：国土数値情報 鉄道データ（2025年）, 国土交通省",
        filename="N02-25_GML.zip",
        file_format="zip/shapefile+GML",
        scope="全国（東京範囲はN03-2024で判定）",
    ),
    SourceDefinition(
        source_id="mlit-n03-tokyo-2024",
        name="国土数値情報 行政区域データ N03 東京都",
        url="https://nlftp.mlit.go.jp/ksj/gml/data/N03/N03-2024/N03-20240101_13_GML.zip",
        version="2024-01-01",
        license_name="オープンデータ（CC BY 4.0）",
        license_url="https://creativecommons.org/licenses/by/4.0/",
        allows_long_term_storage=True,
        attribution="出典：国土数値情報 行政区域データ（2024年）, 国土交通省",
        filename="N03-20240101_13_GML.zip",
        file_format="zip/shapefile",
        scope="東京都（都道府県コード13）",
    ),
    SourceDefinition(
        source_id="meguro-reuse-shops",
        name="目黒区 リユースショップ",
        url="https://data.bodik.jp/dataset/04387579-72fb-45af-b8ac-ae6a0c13dafa/resource/72ee7d30-0bfc-4937-8bfa-1b516bf3101d/download/131105_reuse_shop.csv",
        version="最終更新 2025-11-26",
        license_name="CC BY 4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/deed.ja",
        allows_long_term_storage=True,
        attribution="目黒区「リユースショップ」データ（CC BY 4.0）を出典として表示",
        filename="131105_reuse_shop.csv",
        file_format="CSV",
        scope="目黒区データセット（原CSVは複数自治体のレコードを含む）",
    ),
    SourceDefinition(
        source_id="shinagawa-reuse-cooperators",
        name="品川区 リユース事業協力店",
        url="https://www.opendata.metro.tokyo.lg.jp/shinagawa/reuse.csv",
        version="CSV resource 2020-10-05; catalog metadata 2026-06-12",
        license_name="CC BY 4.0",
        license_url="https://creativecommons.org/licenses/by/4.0/deed.ja",
        allows_long_term_storage=True,
        attribution="品川区「リユース事業協力店一覧」（CC BY 4.0）を出典として表示",
        filename="shinagawa_reuse.csv",
        file_format="CSV",
        scope="品川区のリユース事業協力店一覧（区外住所のレコードは除外）",
    ),
)
