import { afterEach, describe, expect, it, vi } from "vitest";
import { PATCH } from "../src/app/api/items/[id]/route";
import { requireApiUser } from "../src/lib/supabase/server";
import { AnalyzeResponseSchema } from "../src/types/recognition";

vi.mock("../src/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

const itemId = "123e4567-e89b-42d3-a456-426614174000";
const recognitionResult = {
  item: {
    name: "古い品名",
    category: "electronics",
    condition: {
      grade: 3,
      observations: ["元の観察"],
      needsUserConfirmation: false,
    },
  },
  recommendation: { action: "sell", reason: "売却の可能性があります。" },
};

function configureAuth(
  current: Record<string, unknown> = {
    recognition_result: recognitionResult,
    analysis_status: "succeeded",
    status: "pending",
  },
) {
  let savedUpdate: Record<string, unknown> | null = null;
  const loadQuery = {
    select: vi.fn(() => loadQuery),
    eq: vi.fn(() => loadQuery),
    is: vi.fn(() => loadQuery),
    maybeSingle: vi.fn().mockResolvedValue({
      data: current,
      error: null,
    }),
  };
  const updateQuery = {
    eq: vi.fn(() => updateQuery),
    is: vi.fn(() => updateQuery),
    select: vi.fn(() => updateQuery),
    maybeSingle: vi.fn().mockImplementation(async () => ({
      data: savedUpdate,
      error: null,
    })),
  };
  const supabase = {
    from: vi.fn(() => ({
      ...loadQuery,
      update: vi.fn((value: Record<string, unknown>) => {
        savedUpdate = value;
        return updateQuery;
      }),
    })),
  };
  vi.mocked(requireApiUser).mockResolvedValue({
    supabase,
    user: { id: "user-1" },
  } as never);
  return () => savedUpdate;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("PATCH /api/items/[id]", () => {
  it("persists edited item fields in the recognition snapshot while preserving its original basis", async () => {
    configureAuth();
    const response = await PATCH(
      new Request(`http://localhost/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "新しい品名",
          category: "electronics",
          conditionGrade: 5,
          observations: ["更新した観察"],
        }),
      }),
      { params: Promise.resolve({ id: itemId }) },
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    const storedRecognition = AnalyzeResponseSchema.parse(
      payload.item.recognition_result,
    );
    expect(storedRecognition.item).toMatchObject({
      name: "新しい品名",
      category: "electronics",
      condition: {
        grade: 5,
        observations: ["更新した観察"],
      },
    });
    expect(storedRecognition.recommendationBasis).toEqual(
      recognitionResult.item,
    );
    expect(storedRecognition.recommendation).toEqual(
      recognitionResult.recommendation,
    );
  });

  it("saves a manual name and category without pretending failed AI recognition succeeded", async () => {
    const readUpdate = configureAuth({
      recognition_result: null,
      analysis_status: "failed",
      status: "pending",
    });
    const response = await PATCH(
      new Request(`http://localhost/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: "Sony PSP",
          category: "electronics",
          conditionGrade: null,
          observations: [],
        }),
      }),
      { params: Promise.resolve({ id: itemId }) },
    );

    expect(response.status).toBe(200);
    expect(readUpdate()).toMatchObject({
      name: "Sony PSP",
      category: "electronics",
    });
    expect(readUpdate()).not.toHaveProperty("analysis_status", "succeeded");
    expect(readUpdate()).not.toHaveProperty("recognition_result");
  });
});
