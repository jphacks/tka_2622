import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/items/[id]/plan/route";
import { requireApiUser } from "../src/lib/supabase/server";

vi.mock("../src/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("../src/server/rules/providers/supabase-provider", () => ({
  SupabaseRuleServiceProvider: class {
    async getBusinessesByStation() {
      return [
        {
          id: "confirmed-store",
          stationId: "station-a",
          name: "確認済み買取店",
          address: "東京都",
          distanceMeters: 300,
          description: "店頭買取",
          supportedActions: ["sell"],
          supportedCategories: ["electronics"],
          purchaseStatus: "confirmed",
          isMock: false,
        },
      ];
    }

    async getOsmCandidatesByStation() {
      return [
        {
          id: "osm-node-123",
          name: "未確認候補",
          category: "reuse",
          latitude: 35.68,
          longitude: 139.7,
          distanceMeters: 450,
          sourceUrl: "https://www.openstreetmap.org/node/123",
          license: "ODbL-1.0",
        },
      ];
    }
  },
}));

const itemId = "123e4567-e89b-42d3-a456-426614174000";

function configureAuth() {
  const readQuery = (data: unknown) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({ data, error: null }),
    };
    return query;
  };
  const rpc = vi
    .fn(async (...args: [string, Record<string, unknown>]) => ({
      data: {
        id: "plan-1",
        selected_action: args[1].p_selected_action,
      },
      error: null,
    }));
  const supabase = {
    from: vi.fn((table: string) =>
      readQuery(
        table === "user_items"
          ? {
              id: itemId,
              name: "タブレット",
              category: "electronics",
              condition_grade: 4,
              observations: [],
              analysis_status: "succeeded",
            }
          : { nearest_station_id: "station-a" },
      ),
    ),
    rpc,
  };
  vi.mocked(requireApiUser).mockResolvedValue({
    supabase,
    user: { id: "user-1" },
  } as never);
  return rpc;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/items/[id]/plan", () => {
  it.each(["keep", "sell", "give", "dispose"] as const)(
    "saves %s plan service references as a JSON array",
    async (selectedAction) => {
      const rpc = configureAuth();
      const response = await POST(
        new Request("http://localhost/api/items/test/plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ selectedAction }),
        }),
        { params: Promise.resolve({ id: itemId }) },
      );

      expect(response.status).toBe(200);
      const payload = await response.json();
      expect(payload.plan.selected_action).toBe(selectedAction);
      const [, arguments_] = rpc.mock.calls[0];
      expect(Array.isArray(arguments_.p_service_references)).toBe(true);
      if (selectedAction === "sell") {
        expect(arguments_.p_service_references).toEqual([
          { source: "confirmed_business", id: "confirmed-store" },
          { source: "osm_candidate", id: "osm-node-123" },
        ]);
      } else {
        expect(arguments_.p_service_references).toEqual([]);
      }
      expect(arguments_.p_selected_action).toBe(selectedAction);
    },
  );

  it("reports a missing saved row as a failure instead of returning success", async () => {
    const rpc = configureAuth();
    rpc.mockResolvedValueOnce({ data: null, error: null } as never);
    const response = await POST(
      new Request("http://localhost/api/items/test/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedAction: "keep" }),
      }),
      { params: Promise.resolve({ id: itemId }) },
    );
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe("PLAN_SAVE_FAILED");
  });
});
