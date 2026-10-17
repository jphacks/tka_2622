import { describe, expect, it } from "vitest";
import { POST } from "../src/app/api/rules/evaluate/route";
import { evaluateRules } from "../src/server/rules/engine";
import type { RuleServiceProvider } from "../src/server/rules/providers/types";
import type { ServiceBusiness } from "../src/types/service";
import { buildRuleResultSpec } from "../src/lib/rule-ui/spec-builder";

function service(
  id: string,
  stationId: string,
  category: "electronics" | "books" | "furniture" | "other",
  distanceMeters: number,
): ServiceBusiness {
  return {
    id,
    stationId,
    name: `架空テスト店舗 ${id}`,
    address: "テスト用の架空住所",
    distanceMeters,
    description: "テストデータ",
    supportedActions: ["sell"],
    supportedCategories: [category],
    purchaseStatus: "confirmed",
    isMock: true,
  };
}

function post(payload: unknown): Request {
  return new Request("http://localhost/api/rules/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

describe("Rule Engine", () => {
  it("filters PSP sale services by station and electronics category, sorts them, and keeps user choice independent", async () => {
    const provider: RuleServiceProvider = {
      getBusinessesByStation: async () => [
        service("far-psp", "hachioji", "electronics", 1900),
        service("book-store", "hachioji", "books", 100),
        service("other-station", "shinjuku", "electronics", 50),
        service("near-psp", "hachioji", "electronics", 400),
        service("outside-3km", "hachioji", "electronics", 3001),
        {
          ...service("unconfirmed", "hachioji", "electronics", 10),
          purchaseStatus: "unconfirmed",
        },
      ],
    };
    const sellResult = await evaluateRules(
      {
        stationId: "hachioji",
        item: {
          name: "PSP",
          category: "electronics",
          workingStatus: "working",
        },
        selectedAction: "sell",
      },
      provider,
    );

    expect(sellResult.recommendedAction).toBe("sell");
    expect(sellResult.selectedAction).toBe("sell");
    expect(sellResult.services.items.map(({ id }) => id)).toEqual([
      "near-psp",
      "far-psp",
    ]);

    let providerCalled = false;
    const keepResult = await evaluateRules(
      {
        stationId: "hachioji",
        item: { name: "PSP", category: "electronics" },
        aiRecommendedAction: "sell",
        selectedAction: "keep",
      },
      {
        getBusinessesByStation: async () => {
          providerCalled = true;
          return [];
        },
      },
    );
    expect(keepResult.recommendedAction).toBe("sell");
    expect(keepResult.selectedAction).toBe("keep");
    expect(providerCalled).toBe(false);
  });

  it("matches book services only for books at the selected station", async () => {
    const provider: RuleServiceProvider = {
      getBusinessesByStation: async () => [
        service("furniture", "shinjuku", "furniture", 100),
        service("book", "shinjuku", "books", 300),
      ],
    };
    const result = await evaluateRules(
      {
        stationId: "shinjuku",
        item: { name: "参考書", category: "books" },
        selectedAction: "sell",
      },
      provider,
    );

    expect(result.services.items.map(({ id }) => id)).toEqual(["book"]);
  });

  it("does not show a confirmed shop when the selected category is not in its evidence", async () => {
    const result = await evaluateRules(
      {
        stationId: "shinjuku",
        item: { name: "対象商品", category: "other" },
        selectedAction: "sell",
      },
      {
        getBusinessesByStation: async () => [
          {
            ...service("unmatched-category", "shinjuku", "other", 100),
            supportedCategories: [],
          },
        ],
      },
    );

    expect(result.services.items).toEqual([]);
    expect(result.services.status).toBe("empty");
  });

  it("flags refrigerator disposal without making a municipal classification", async () => {
    const result = await evaluateRules({
      stationId: "mock-shinjuku",
      item: { name: "冷蔵庫", category: "electronics" },
      selectedAction: "dispose",
      location: { municipalityCode: "13104" },
    });

    expect(result.notices.map(({ ruleId }) => ruleId)).toContain(
      "home-appliance-recycling",
    );
    expect(result.notices.map(({ ruleId }) => ruleId)).toContain(
      "municipality-required",
    );
    expect(result.notices.find(({ ruleId }) =>
      ruleId === "home-appliance-recycling",
    )?.sourceUrl).toBe("https://www.env.go.jp/recycle/kaden/");
    expect(result.services.status).toBe("not_applicable");
  });

  it("adds battery and bulky-item notices only when those conditions are indicated", async () => {
    const battery = await evaluateRules({
      item: {
        name: "電子機器",
        category: "electronics",
        containsLithiumBattery: true,
      },
      selectedAction: "dispose",
    });
    const ordinaryElectronics = await evaluateRules({
      item: { name: "電子機器", category: "electronics" },
      selectedAction: "dispose",
    });
    const bulkyFurniture = await evaluateRules({
      item: {
        name: "ソファ",
        category: "furniture",
        isLargeItem: true,
      },
      selectedAction: "dispose",
    });

    expect(battery.notices.map(({ ruleId }) => ruleId)).toContain(
      "lithium-battery",
    );
    expect(ordinaryElectronics.notices.map(({ ruleId }) => ruleId)).not.toContain(
      "lithium-battery",
    );
    expect(bulkyFurniture.notices.map(({ ruleId }) => ruleId)).toContain(
      "bulky-item",
    );
  });

  it("keeps unknown electronics condition uncertain", async () => {
    const result = await evaluateRules({
      item: {
        name: "電子機器",
        category: "electronics",
        conditionGrade: null,
        workingStatus: "unknown",
      },
    });

    expect(result.recommendationConfidence).toBe("low");
    expect(result.recommendationReason).toContain("十分に確認できない");
    expect(result.recommendedAction).toBe("give");
    expect(result.selectedAction).toBe("give");
  });

  it("uses saved recommendations and item-specific guidance for guitar, book, refrigerator, and chair", async () => {
    const cases = [
      {
        name: "エレクトリックギター",
        category: "electronics" as const,
        conditionGrade: 4 as const,
        action: "keep" as const,
        reason: "ケースに収めて運ぶ方法が適しています。",
        guideIncludes: "ネックやボディ",
      },
      {
        name: "参考書",
        category: "books" as const,
        conditionGrade: 2 as const,
        action: "sell" as const,
        reason: "書き込みの状態を確認してから査定を相談できます。",
        guideIncludes: "書き込みや付属資料",
      },
      {
        name: "冷蔵庫",
        category: "electronics" as const,
        conditionGrade: null,
        action: "dispose" as const,
        reason: "家電リサイクルの対象か公式案内を確認してください。",
        guideIncludes: "家電リサイクル法",
      },
      {
        name: "ダイニングチェア",
        category: "furniture" as const,
        conditionGrade: 3 as const,
        action: "give" as const,
        reason: "椅子の状態と受け渡し条件を相手に伝えられます。",
        guideIncludes: "椅子の脚・背もたれ",
      },
    ];
    const results = await Promise.all(
      cases.map(({ name, category, conditionGrade, action, reason }) =>
        evaluateRules({
          item: { name, category, conditionGrade, observations: [] },
          aiRecommendedAction: action,
          aiRecommendationReason: reason,
        }),
      ),
    );
    const guideDetails = results.map((result) => {
      const spec = buildRuleResultSpec(result, undefined, {
        showRecommendation: false,
        showItemSummary: false,
        showActionCta: false,
      });
      return Object.values(spec.elements).filter((element) =>
        ["ActionGuideCard", "ChecklistCard", "PackingAdviceCard", "DisposalVerificationCard"].includes(
          element.type,
        ),
      );
    });

    expect(results.map(({ recommendedAction, selectedAction }) => [
      recommendedAction,
      selectedAction,
    ])).toEqual([
      ["keep", "keep"],
      ["sell", "sell"],
      ["dispose", "dispose"],
      ["give", "give"],
    ]);
    for (const [index, result] of results.entries()) {
      expect(result.recommendationReason).toContain(cases[index].reason);
      expect(result.recommendationReason).toContain("状態や条件は実物で確認");
    }
    expect(results[0].item.category).toBe("other");
    expect(guideDetails.map((details) => JSON.stringify(details))).toEqual(
      expect.arrayContaining(cases.map(({ guideIncludes }) =>
        expect.stringContaining(guideIncludes),
      )),
    );
    expect(
      guideDetails.every((details) =>
        details.every((element) => element.type !== "ItemSummaryCard"),
      ),
    ).toBe(true);
  });

  it("returns an honest empty sell state without a real service provider", async () => {
    const result = await evaluateRules({
      stationId: "shinjuku",
      item: { name: "本", category: "books" },
      selectedAction: "sell",
    });

    expect(result.services).toEqual({
      status: "empty",
      items: [],
      osmCandidates: [],
    });
  });

  it("requests a station before searching sell services", async () => {
    const result = await evaluateRules({
      item: { name: "参考書", category: "books" },
      aiRecommendedAction: "sell",
    });

    expect(result.selectedAction).toBe("sell");
    expect(result.services).toEqual({
      status: "needs_station",
      items: [],
      osmCandidates: [],
    });
  });

  it("evaluates the API input and rejects invalid requests", async () => {
    const originalUrl = process.env.SUPABASE_URL;
    const originalKey = process.env.SUPABASE_ANON_KEY;
    const originalPublicUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const originalPublishableKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

    try {
      const response = await POST(
        post({
          stationId: "shinjuku",
          item: { name: "本", category: "books" },
          aiRecommendedAction: null,
          selectedAction: "sell",
        }),
      );
      const body = await response.json();
      const invalid = await POST(
        post({ item: { name: "", category: "unknown" } }),
      );

      expect(response.status).toBe(503);
      expect(body.error.code).toBe("SERVICE_DIRECTORY_UNAVAILABLE");
      expect(body.error.message).toContain("サーバー側 Supabase キー");
      expect(invalid.status).toBe(400);
    } finally {
      if (originalUrl === undefined) delete process.env.SUPABASE_URL;
      else process.env.SUPABASE_URL = originalUrl;
      if (originalKey === undefined) delete process.env.SUPABASE_ANON_KEY;
      else process.env.SUPABASE_ANON_KEY = originalKey;
      if (originalPublicUrl === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_URL;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_URL = originalPublicUrl;
      }
      if (originalPublishableKey === undefined) {
        delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
      } else {
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY =
          originalPublishableKey;
      }
    }
  });
});
