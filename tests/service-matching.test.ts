import { describe, expect, it } from "vitest";
import { matchServices } from "../src/server/matching/match-services";
import type { ServiceBusiness, ServiceMatchRequest } from "../src/types/service";

const baseInput: ServiceMatchRequest = {
  item: {
    name: "エレキギター",
    category: "other",
    conditionGrade: 4,
    observations: [],
  },
  selectedAction: "sell",
  stationId: "mock-takadanobaba",
};

describe("service matching", () => {
  it("filters services by station and action, then sorts by distance", async () => {
    const results = await matchServices(baseInput);

    expect(results?.map(({ distanceMeters }) => distanceMeters)).toEqual([
      280, 640, 910,
    ]);
    expect(results?.every(({ stationId, supportedActions }) =>
      stationId === baseInput.stationId &&
      supportedActions.includes("sell"),
    )).toBe(true);
  });

  it("returns no sale services for other actions", async () => {
    for (const selectedAction of ["keep", "give", "dispose"] as const) {
      const results = await matchServices({
        ...baseInput,
        selectedAction,
      });
      expect(results).toEqual([]);
    }
  });

  it("returns null for an unknown station and an empty list for a known station without data", async () => {
    await expect(
      matchServices({ ...baseInput, stationId: "mock-not-a-station" }),
    ).resolves.toBeNull();
    await expect(
      matchServices({ ...baseInput, stationId: "mock-shibuya" }),
    ).resolves.toEqual([]);
  });

  it("sorts and limits provider results to ten", async () => {
    const businesses: ServiceBusiness[] = Array.from(
      { length: 12 },
      (_, index) => ({
        id: `service-${index}`,
        stationId: baseInput.stationId,
        name: `架空デモ店 ${index}`,
        address: "駅周辺（架空のデモ住所）",
        distanceMeters: 1200 - index * 100,
        description: "架空のデモです。",
        supportedActions: ["sell"],
        isMock: true,
      }),
    );
    const provider = {
      getBusinessesByStation: async () => businesses,
    };

    const results = await matchServices(baseInput, provider);

    expect(results).toHaveLength(10);
    expect(results?.map(({ distanceMeters }) => distanceMeters)).toEqual([
      100, 200, 300, 400, 500, 600, 700, 800, 900, 1000,
    ]);
  });
});
