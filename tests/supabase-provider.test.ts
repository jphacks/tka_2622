import { describe, expect, it } from "vitest";
import { POST as evaluatePost } from "../src/app/api/rules/evaluate/route";
import { buildRuleResultSpec } from "../src/lib/rule-ui/spec-builder";
import { evaluateRules } from "../src/server/rules/engine";
import { SupabaseRuleServiceProvider } from "../src/server/rules/providers/supabase-provider";

const config = {
  url: "https://example.supabase.co",
  apiKey: "test-publishable-key",
};
const serviceConfig = {
  url: config.url,
  apiKey: "test-server-secret",
};

function osmRelation(
  stationId: string,
  objectId: string,
  distanceMeters: number,
  options: { verified?: boolean; category?: string } = {},
) {
  const sourceUrl = `https://www.openstreetmap.org/node/${objectId}`;
  return {
    station_id: stationId,
    osm_object_type: "node",
    osm_object_id: objectId,
    distance_meters: distanceMeters,
    match_radius_meters: 3000,
    distance_method: "Haversine straight-line distance",
    osm_business_candidates: {
      osm_object_type: "node",
      osm_object_id: objectId,
      name: "OSM候補の古書店",
      address: "OSM住所タグ",
      latitude: 35.68,
      longitude: 139.7,
      source: "Geofabrik Kantō bulk OpenStreetMap PBF",
      license: "ODbL-1.0 (© OpenStreetMap contributors)",
      tags: {
        shop: options.category ?? "books",
        _reuse_candidate: {
          candidate_id: `osm-node-${objectId}`,
          shop_tag: options.category ?? "books",
          amenity_tag: null,
          source_url: sourceUrl,
          purchase_status: "unconfirmed",
        },
      },
      validation_status: options.verified
        ? "valid_source_record"
        : "osm_candidate_not_branch_verified",
    },
  };
}

function relation(
  stationId: string,
  businessId: string,
  distanceMeters: number,
  purchaseStatus = "confirmed",
) {
  return {
    station_id: stationId,
    business_id: businessId,
    distance_meters: distanceMeters,
    businesses: {
      business_id: businessId,
      name: "BINGO自由が丘店",
      address: "東京都目黒区緑が丘2-6-19",
      website_url: "https://www.bookoff.co.jp/shop/shop87001.html",
      purchase_status: purchaseStatus,
      business_category: "総合リユースショップ",
      products_handled_source_text: "ブランドメンズ古着、服飾雑貨",
      service_type_evidence: "店頭で1品から査定、買取",
      usage_notes: "店頭にお持ちいただければ１品から査定、買取いたします。",
    },
  };
}

describe("SupabaseRuleServiceProvider", () => {
  it("maps database station ids directly to the selector station id", async () => {
    const provider = new SupabaseRuleServiceProvider(config, async () =>
      Response.json([
        {
          station_id: "mlit-n02-group-004196",
          station_name: "自由が丘",
          lines: "東急東横線",
        },
      ]),
    );

    await expect(provider.getStations()).resolves.toEqual([
      {
        id: "mlit-n02-group-004196",
        name: "自由が丘",
        lines: ["東急東横線"],
      },
    ]);
  });

  it("uses the existing NEXT_PUBLIC Supabase URL and publishable key on the server", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;
    const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalPublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_URL = config.url;
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = config.apiKey;
    let requestUrl = "";
    let requestKey = "";

    try {
      const provider = new SupabaseRuleServiceProvider(undefined, async (input, init) => {
        requestUrl = input.toString();
        requestKey = new Headers(init?.headers).get("apikey") ?? "";
        return Response.json([]);
      });
      await provider.getStations();

      expect(requestUrl).toContain("https://example.supabase.co/rest/v1/stations");
      expect(requestKey).toBe(config.apiKey);
    } finally {
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = originalKey;
      if (originalPublicUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      else process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      if (originalPublishableKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
          originalPublishableKey;
      }
    }
  });

  it("uses the unchanged station_id and returns only confirmed businesses within 3km", async () => {
    const urls: URL[] = [];
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(input.toString());
      urls.push(url);
      return Response.json([
        relation("station-a", "confirmed-farther", 1200),
        relation("station-a", "unconfirmed-near", 50, "unconfirmed"),
        relation("station-a", "confirmed-outside", 3001),
        relation("station-a", "confirmed-at-boundary", 3000),
        relation("station-b", "wrong-station", 10),
        relation("station-a", "confirmed-near", 300),
      ]);
    };
    const provider = new SupabaseRuleServiceProvider(config, fetcher);
    const businesses = await provider.getBusinessesByStation("station-a");

    expect(businesses.map(({ id }) => id)).toEqual([
      "confirmed-near",
      "confirmed-farther",
      "confirmed-at-boundary",
    ]);
    expect(businesses[0]).toMatchObject({
      stationId: "station-a",
      name: "BINGO自由が丘店",
      address: "東京都目黒区緑が丘2-6-19",
      externalUrl: "https://www.bookoff.co.jp/shop/shop87001.html",
      purchaseStatus: "confirmed",
      isMock: false,
    });
    expect(businesses[0].description).toContain("１品から査定");
    expect(businesses[0].supportedCategories).toContain("clothing");
    expect(urls[0].pathname).toBe("/rest/v1/station_businesses");
    expect(urls[0].searchParams.get("station_id")).toBe("eq.station-a");
    expect(urls[0].searchParams.get("distance_meters")).toBe("lte.3000");
    expect(urls[0].searchParams.get("businesses.purchase_status")).toBe(
      "eq.confirmed",
    );
    expect(urls[0].searchParams.get("order")).toBe("distance_meters.asc");
  });

  it("does not infer a supported category when the recorded product scope is unrelated", async () => {
    const row = relation("station-a", "golf-store", 300);
    row.businesses.business_category = "スポーツ用品";
    row.businesses.products_handled_source_text = "ゴルフクラブ";
    row.businesses.service_type_evidence = "ゴルフ用品専門店";
    const provider = new SupabaseRuleServiceProvider(config, async () =>
      Response.json([row]),
    );

    const businesses = await provider.getBusinessesByStation("station-a");

    expect(businesses[0].supportedCategories).toEqual([]);
  });

  it("refreshes results when a different station_id is requested", async () => {
    const fetcher: typeof fetch = async (input) => {
      const stationId = new URL(input.toString()).searchParams
        .get("station_id")
        ?.slice("eq.".length);
      return Response.json([relation(stationId ?? "", `${stationId}-business`, 200)]);
    };
    const provider = new SupabaseRuleServiceProvider(config, fetcher);

    const first = await provider.getBusinessesByStation("station-a");
    const second = await provider.getBusinessesByStation("station-b");

    expect(first[0].stationId).toBe("station-a");
    expect(first[0].id).toBe("station-a-business");
    expect(second[0].stationId).toBe("station-b");
    expect(second[0].id).toBe("station-b-business");
  });

  it("passes actual confirmed shop data through the Rule Engine", async () => {
    const provider = new SupabaseRuleServiceProvider(
      config,
      async (input) =>
        new URL(input.toString()).pathname.endsWith("/station_businesses")
          ? Response.json([
              relation("mlit-n02-group-004196", "meguro-reuse-10", 569),
            ])
          : Response.json([]),
      serviceConfig,
    );
    const result = await evaluateRules(
      {
        stationId: "mlit-n02-group-004196",
        item: { name: "古着", category: "clothing" },
        selectedAction: "sell",
      },
      provider,
    );

    expect(result.services.status).toBe("available");
    expect(result.services.items[0]).toMatchObject({
      id: "meguro-reuse-10",
      name: "BINGO自由が丘店",
      address: "東京都目黒区緑が丘2-6-19",
      distanceMeters: 569,
      externalUrl: "https://www.bookoff.co.jp/shop/shop87001.html",
    });
    const spec = buildRuleResultSpec(result);
    const storeList = Object.values(spec.elements).find(
      (element) => element.type === "StoreList",
    );
    expect(storeList?.props.items).toMatchObject([
      expect.objectContaining({
        id: "meguro-reuse-10",
        name: "BINGO自由が丘店",
        address: "東京都目黒区緑が丘2-6-19",
        distanceMeters: 569,
      }),
    ]);
  });

  it("returns OSM candidates separately without asserting they buy the selected category", async () => {
    let requestUrl = "";
    let requestApiKey = "";
    const provider = new SupabaseRuleServiceProvider(
      config,
      async (input, init) => {
        requestUrl = input.toString();
        requestApiKey = new Headers(init?.headers).get("apikey") ?? "";
        return Response.json([
          osmRelation("station-a", "123", 700),
          osmRelation("station-a", "outside-radius", 3001),
          osmRelation("another-station", "wrong-station", 50),
          osmRelation("station-a", "verified-row", 20, { verified: true }),
        ]);
      },
      serviceConfig,
    );

    const candidates = await provider.getOsmCandidatesByStation("station-a");

    expect(candidates).toEqual([
      {
        id: "node-123",
        name: "OSM候補の古書店",
        category: "books",
        latitude: 35.68,
        longitude: 139.7,
        distanceMeters: 700,
        sourceUrl: "https://www.openstreetmap.org/node/123",
        license: "ODbL-1.0 (© OpenStreetMap contributors)",
      },
    ]);
    expect(requestApiKey).toBe(serviceConfig.apiKey);
    expect(new URL(requestUrl).pathname).toBe(
      "/rest/v1/station_osm_candidate_matches",
    );
    expect(new URL(requestUrl).searchParams.get("station_id")).toBe(
      "eq.station-a",
    );
    expect(new URL(requestUrl).searchParams.get("distance_meters")).toBe(
      "lte.3000",
    );
  });

  it.each(["keep", "give", "dispose"] as const)(
    "does not require Supabase when evaluating %s",
    async (selectedAction) => {
      const originalUrl = process.env.SUPABASE_URL;
      const originalKey = process.env.SUPABASE_ANON_KEY;
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_ANON_KEY;

      try {
        const request = new Request("http://localhost/api/rules/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stationId: "station-a",
            item: { name: "本", category: "books" },
            selectedAction,
          }),
        });
        const response = await evaluatePost(request);

        expect(response.status).toBe(200);
        expect((await response.json()).services.status).toBe("not_applicable");
      } finally {
        if (originalUrl === undefined) delete process.env.SUPABASE_URL;
        else process.env.SUPABASE_URL = originalUrl;
        if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
        else process.env.SUPABASE_ANON_KEY = originalKey;
      }
    },
  );

  it("returns an explicit database configuration error for Sell", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;

    try {
      const request = new Request("http://localhost/api/rules/evaluate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stationId: "station-a",
          item: { name: "本", category: "books" },
          selectedAction: "sell",
        }),
      });
      const response = await evaluatePost(request);
      const payload = await response.json();

      expect(response.status).toBe(503);
      expect(payload.error.message).toContain("サーバー側 Supabase キー");
    } finally {
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = originalKey;
    }
  });
});
