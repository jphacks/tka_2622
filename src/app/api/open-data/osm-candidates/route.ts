import { SupabaseRuleServiceProvider } from "../../../../server/rules/providers/supabase-provider";

export async function GET(): Promise<Response> {
  try {
    const dataset = await new SupabaseRuleServiceProvider()
      .getOsmCandidateDataset();
    const release = {
      title: "Tokyo reuse shop candidates and station matches",
      attribution: "© OpenStreetMap contributors",
      source: "Geofabrik Kantō bulk OpenStreetMap PBF",
      sourceUrl: "https://download.geofabrik.de/asia/japan/kanto.html",
      license: "Open Database License (ODbL) v1.0",
      licenseUrl: "https://opendatacommons.org/licenses/odbl/1-0/",
      copyrightUrl: "https://www.openstreetmap.org/copyright",
      stationSource: {
        name: "国土交通省 国土数値情報 鉄道 N02 2025",
        license: "CC BY 4.0",
        sourceUrl:
          "https://nlftp.mlit.go.jp/ksj/gml/datalist/KsjTmplt-N02-2025.html",
      },
      notes: [
        "候補の買取サービス、営業状況、対象商品は確認されていません。",
        "stationMatches は駅座標とOSM候補座標の直線距離で作成した導出データです。",
        "この候補・関連データベースはODbL v1.0で提供されます。",
      ],
      ...dataset,
    };
    return new Response(JSON.stringify(release), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition":
          'attachment; filename="tokyo-osm-reuse-candidates-odbl.json"',
        "Cache-Control": "public, max-age=3600",
      },
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "OSM_DATASET_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "OSM候補データを取得できませんでした。",
        },
      },
      { status: 503 },
    );
  }
}
