import { describe, expect, it, vi } from "vitest";
import { refreshSavedPlanServices } from "../src/server/rules/refresh-services";
import type { RuleServiceProvider } from "../src/server/rules/providers/types";
import { RuleResultSchema, type RuleResult } from "../src/server/rules/schemas";

function savedSellPlan(overrides: Partial<RuleResult> = {}): RuleResult {
  return RuleResultSchema.parse({
    item: {
      name: "PSP",
      category: "electronics",
      conditionGrade: 3,
      observations: [],
    },
    stationId: "station-a",
    recommendedAction: "sell",
    selectedAction: "sell",
    recommendationConfidence: "medium",
    recommendationReason: "保存時の理由",
    nextAction: { type: "search_services", label: "近くの買取相談先を確認する" },
    guidance: {
      title: "保存時の案内",
      introduction: "保存時の導入",
      steps: ["保存時の手順"],
      directoryMessage: "保存時のメッセージ",
    },
    services: {
      status: "available",
      items: [
        {
          id: "store-1",
          stationId: "station-a",
          name: "保存時の店舗",
          address: "東京都",
          distanceMeters: 300,
          description: "店頭買取",
          supportedActions: ["sell"],
          supportedCategories: ["electronics"],
          purchaseStatus: "confirmed",
          isMock: false,
        },
      ],
      osmCandidates: [
        {
          id: "osm-node-1",
          name: "保存時の候補",
          category: "second_hand",
          latitude: 35.6,
          longitude: 139.68,
          distanceMeters: 450,
          sourceUrl: "https://www.openstreetmap.org/node/1",
          license: "ODbL-1.0",
        },
      ],
    },
    notices: [],
    sections: ["services"],
    ...overrides,
  });
}

const currentProvider: RuleServiceProvider = {
  getBusinessesByStation: async () => [
    {
      id: "store-1",
      stationId: "station-a",
      name: "保存時の店舗",
      address: "東京都",
      distanceMeters: 300,
      description: "店頭買取",
      supportedActions: ["sell"],
      supportedCategories: ["electronics"],
      purchaseStatus: "confirmed",
      isMock: false,
      openingHours: ["営業日：月〜日", "営業時間：11:00〜20:00"],
    },
  ],
  getOsmCandidatesByStation: async () => [
    {
      id: "osm-node-1",
      name: "保存時の候補",
      category: "second_hand",
      latitude: 35.6,
      longitude: 139.68,
      distanceMeters: 450,
      sourceUrl: "https://www.openstreetmap.org/node/1",
      license: "ODbL-1.0",
      openingHours: "Mo-Su 11:00-20:00",
    },
  ],
};

describe("refreshSavedPlanServices", () => {
  it("replaces the saved shop snapshot with current shop info and keeps the saved plan", async () => {
    const saved = savedSellPlan();
    const refreshed = await refreshSavedPlanServices(saved, currentProvider);

    expect(refreshed.services.items[0]?.openingHours).toEqual([
      "営業日：月〜日",
      "営業時間：11:00〜20:00",
    ]);
    expect(refreshed.services.osmCandidates[0]?.openingHours).toBe(
      "Mo-Su 11:00-20:00",
    );
    expect(refreshed.selectedAction).toBe("sell");
    expect(refreshed.guidance).toEqual(saved.guidance);
    expect(refreshed.recommendationReason).toBe("保存時の理由");
    expect(saved.services.items[0]?.openingHours).toBeUndefined();
  });

  it("keeps the saved snapshot when the shop directory is unavailable", async () => {
    const saved = savedSellPlan();
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const refreshed = await refreshSavedPlanServices(saved, {
      getBusinessesByStation: async () => {
        throw new Error("down");
      },
    });
    error.mockRestore();

    expect(refreshed).toBe(saved);
  });

  it("does not query shops for non-sell plans or plans without a station", async () => {
    const getBusinessesByStation = vi.fn(async () => []);
    const provider = { getBusinessesByStation };

    await refreshSavedPlanServices(
      savedSellPlan({ selectedAction: "keep" }),
      provider,
    );
    await refreshSavedPlanServices(savedSellPlan({ stationId: null }), provider);

    expect(getBusinessesByStation).not.toHaveBeenCalled();
  });
});
