import { describe, expect, it } from "vitest";
import { MOCK_ANALYSIS } from "../src/fixtures/mock-analysis";
import { evaluateRules } from "../src/server/rules/engine";
import type { RuleServiceProvider } from "../src/server/rules/providers/types";
import {
  buildRuleResultSpec,
  validateRuleUiSpec,
} from "../src/lib/rule-ui/spec-builder";
import type { RuleUiComposer } from "../src/lib/rule-ui/spec-builder";
import type { Spec } from "@json-render/core";

function componentTypes(spec: Spec): string[] {
  return Object.values(spec.elements).map((element) => element.type);
}

async function mockItem(action: "keep" | "sell" | "give" | "dispose") {
  return evaluateRules({
    item: {
      name: MOCK_ANALYSIS.item.name,
      category: MOCK_ANALYSIS.item.category,
      conditionGrade: MOCK_ANALYSIS.item.condition.grade,
      observations: MOCK_ANALYSIS.item.condition.observations,
    },
    aiRecommendedAction: MOCK_ANALYSIS.recommendation.action,
    aiRecommendationReason: MOCK_ANALYSIS.recommendation.reason,
    selectedAction: action,
  });
}

describe("RuleResult to json-render Spec", () => {
  it("shows PSP sale guidance and a needs-station state without fake businesses", async () => {
    const result = await mockItem("sell");
    const spec = buildRuleResultSpec(result);

    expect(result.services.status).toBe("needs_station");
    expect(componentTypes(spec)).toContain("ChecklistCard");
    expect(componentTypes(spec)).toContain("EmptyStateCard");
    expect(componentTypes(spec)).toContain("StoreList");
    expect(componentTypes(spec)).toContain("OsmCandidateList");
    expect(validateRuleUiSpec(spec)).not.toBeNull();
  });

  it("shows the coverage-aware Japanese message when no confirmed business matches", async () => {
    const result = await evaluateRules({
      stationId: "mlit-n02-group-003053",
      item: { name: "本", category: "books" },
      selectedAction: "sell",
    });
    const spec = buildRuleResultSpec(result);
    const emptyState = Object.values(spec.elements).find(
      (element) => element.type === "EmptyStateCard",
    );

    expect(emptyState?.props.message).toBe(
      "この駅の周辺では、確認済みの買取サービスがまだ登録されていません。",
    );
  });

  it("switches PSP to the keep checklist without changing the AI recommendation", async () => {
    const result = await mockItem("keep");
    const spec = buildRuleResultSpec(result);

    expect(result.recommendedAction).toBe("sell");
    expect(result.selectedAction).toBe("keep");
    expect(componentTypes(spec)).toContain("ChecklistCard");
    expect(componentTypes(spec)).not.toContain("StoreList");
  });

  it("builds an item summary and a transfer checklist for give", async () => {
    const result = await mockItem("give");
    const spec = buildRuleResultSpec(result);

    expect(result.recommendedAction).toBe("sell");
    expect(result.selectedAction).toBe("give");
    expect(componentTypes(spec)).toContain("ItemSummaryCard");
    expect(componentTypes(spec)).toContain("ChecklistCard");
    expect(componentTypes(spec)).not.toContain("StoreList");
  });

  it("adds a book-specific sale preparation step", async () => {
    const result = await evaluateRules({
      item: {
        name: "参考書",
        category: "books",
        conditionGrade: 4,
        observations: [],
      },
      selectedAction: "sell",
    });
    const spec = buildRuleResultSpec(result);
    const checklist = Object.values(spec.elements).find(
      (element) => element.type === "ChecklistCard",
    );

    expect(checklist?.props.items).toContain(
      "書き込みや付属資料の有無を確認する",
    );
    expect(componentTypes(spec)).toContain("EmptyStateCard");
  });

  it("renders only confirmed category-matched services supplied by the provider", async () => {
    const provider: RuleServiceProvider = {
      getBusinessesByStation: async () => [
        {
          id: "confirmed-book-store",
          stationId: "mock-shinjuku",
          name: "確認済みテスト買取店",
          address: "テスト用住所",
          distanceMeters: 420,
          description: "書籍カテゴリの確認済みテストデータ",
          supportedActions: ["sell"],
          supportedCategories: ["books"],
          purchaseStatus: "confirmed",
          isMock: false,
        },
        {
          id: "wrong-category",
          stationId: "mock-shinjuku",
          name: "対象外店舗",
          address: "テスト用住所",
          distanceMeters: 100,
          description: "異なるカテゴリ",
          supportedActions: ["sell"],
          supportedCategories: ["furniture"],
          purchaseStatus: "confirmed",
          isMock: false,
        },
      ],
    };
    const result = await evaluateRules(
      {
        stationId: "mock-shinjuku",
        item: { name: "参考書", category: "books" },
        selectedAction: "sell",
      },
      provider,
    );
    const spec = buildRuleResultSpec(result);
    const storeList = Object.values(spec.elements).find(
      (element) => element.type === "StoreList",
    );

    expect(storeList?.props).toMatchObject({
      items: [
        expect.objectContaining({
          id: "confirmed-book-store",
          name: "確認済みテスト買取店",
        }),
      ],
    });
    expect(componentTypes(spec)).toContain("OsmCandidateList");
  });

  it("keeps OSM candidates separate and never treats their category as buyback verification", async () => {
    const result = await evaluateRules(
      {
        stationId: "station-a",
        item: { name: "本", category: "books" },
        selectedAction: "sell",
      },
      {
        getBusinessesByStation: async () => [],
        getOsmCandidatesByStation: async () => [
          {
            id: "node-123",
            name: "OSM候補書店",
            category: "books",
            latitude: 35.68,
            longitude: 139.7,
            distanceMeters: 400,
            sourceUrl: "https://www.openstreetmap.org/node/123",
            license: "ODbL-1.0 (© OpenStreetMap contributors)",
          },
        ],
      },
    );
    const spec = buildRuleResultSpec(result);
    const osmList = Object.values(spec.elements).find(
      (element) => element.type === "OsmCandidateList",
    );

    expect(result.services.items).toEqual([]);
    expect(result.services.osmCandidates).toHaveLength(1);
    expect(osmList?.props.items).toMatchObject([
      expect.objectContaining({
        id: "node-123",
        category: "books",
        distanceMeters: 400,
      }),
    ]);
  });

  it("renders refrigerator disposal notices and municipal verification", async () => {
    const result = await evaluateRules({
      item: {
        name: "冷蔵庫",
        category: "electronics",
        conditionGrade: null,
        observations: [],
      },
      selectedAction: "dispose",
    });
    const spec = buildRuleResultSpec(result);
    const notices = Object.values(spec.elements).find(
      (element) => element.type === "NoticeCard",
    );

    expect(notices?.props).toMatchObject({
      notices: expect.arrayContaining([
        expect.objectContaining({ ruleId: "home-appliance-recycling" }),
        expect.objectContaining({ ruleId: "municipality-required" }),
      ]),
    });
    expect(componentTypes(spec)).not.toContain("StoreList");
  });

  it("renders category- and action-specific electric guitar results and CTAs", async () => {
    const base = {
      item: {
        name: "エレクトリックギター",
        category: "electronics" as const,
        conditionGrade: 3 as const,
        observations: ["本体の外観を確認"],
      },
      aiRecommendedAction: "give" as const,
      aiRecommendationReason: "AIの参考提案",
    };
    const sell = await evaluateRules({ ...base, selectedAction: "sell" });
    const keep = await evaluateRules({ ...base, selectedAction: "keep" });
    const sellSpec = buildRuleResultSpec(sell);
    const keepSpec = buildRuleResultSpec(keep);
    const sellGuide = Object.values(sellSpec.elements).find(
      (element) => element.type === "ActionGuideCard",
    );
    const keepGuide = Object.values(keepSpec.elements).find(
      (element) => element.type === "ActionGuideCard",
    );
    const sellCta = Object.values(sellSpec.elements).find(
      (element) => element.type === "ActionCtaCard",
    );
    const keepCta = Object.values(keepSpec.elements).find(
      (element) => element.type === "ActionCtaCard",
    );

    expect(sell.selectedAction).toBe("sell");
    expect(keep.selectedAction).toBe("keep");
    expect(sellGuide?.props.introduction).toContain("アンプ等");
    expect(keepGuide?.props.introduction).toContain("ネックやボディ");
    expect(sellCta?.props).toEqual({
      label: "近くの買取店を探す",
      target: "#station-selector",
    });
    expect(keepCta?.props).toEqual({
      label: "持っていく準備をする",
      target: "#action-checklist",
    });
    expect(componentTypes(sellSpec)).toContain("StoreList");
    expect(componentTypes(keepSpec)).toContain("PackingAdviceCard");
    expect(componentTypes(keepSpec)).not.toContain("StoreList");
  });

  it("shows book transfer channels without inventing a confirmed destination", async () => {
    const result = await evaluateRules({
      item: { name: "参考書", category: "books", conditionGrade: 4 },
      aiRecommendedAction: "sell",
      selectedAction: "give",
    });
    const spec = buildRuleResultSpec(result);
    const channels = Object.values(spec.elements).find(
      (element) => element.type === "TransferChannelsCard",
    );
    const cta = Object.values(spec.elements).find(
      (element) => element.type === "ActionCtaCard",
    );

    expect(result.selectedAction).toBe("give");
    expect(componentTypes(spec)).toContain("TransferChannelsCard");
    expect(componentTypes(spec)).not.toContain("StoreList");
    expect(channels?.props.channels).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ title: "知人・学校・職場" }),
        expect.objectContaining({ title: "地域の譲渡募集" }),
      ]),
    );
    expect(cta?.props).toEqual({
      label: "譲り先を探す",
      target: "#transfer-channels",
    });
  });

  it("shows refrigerator disposal verification without guessing its local waste category", async () => {
    const result = await evaluateRules({
      item: { name: "冷蔵庫", category: "electronics", conditionGrade: null },
      aiRecommendedAction: "keep",
      selectedAction: "dispose",
    });
    const spec = buildRuleResultSpec(result);
    const verification = Object.values(spec.elements).find(
      (element) => element.type === "DisposalVerificationCard",
    );
    const cta = Object.values(spec.elements).find(
      (element) => element.type === "ActionCtaCard",
    );

    expect(result.selectedAction).toBe("dispose");
    expect(componentTypes(spec)).toContain("DisposalVerificationCard");
    expect(componentTypes(spec)).toContain("NoticeCard");
    expect(componentTypes(spec)).not.toContain("StoreList");
    expect(verification?.props.items).toContain("「冷蔵庫」の分別・回収区分");
    expect(cta?.props).toEqual({
      label: "処分方法を確認する",
      target: "#disposal-notices",
    });
    expect(JSON.stringify(verification?.props)).not.toMatch(/粗大ごみ|可燃ごみ|不燃ごみ/);
  });

  it("falls back to the deterministic layout when a composer returns an invalid plan", async () => {
    const result = await mockItem("sell");
    const invalidComposer: RuleUiComposer = {
      compose: () => ({ blocks: ["UnknownComponent"] }),
    };
    const spec = buildRuleResultSpec(result, invalidComposer);

    expect(componentTypes(spec)).toContain("RecommendationCard");
    expect(componentTypes(spec)).toContain("EmptyStateCard");
    expect(validateRuleUiSpec({ root: "missing", elements: {} })).toBeNull();
  });
});
