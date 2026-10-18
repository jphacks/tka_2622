import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "../src/app/api/items/[id]/analyze/route";
import { requireApiUser } from "../src/lib/supabase/server";
import { AI_STREAM_CONTENT_TYPE, readAiResponse } from "../src/lib/ai-stream";

const mocks = vi.hoisted(() => ({
  analyzeItem: vi.fn(),
}));

vi.mock("../src/lib/supabase/server", () => ({
  getSupabaseServerClient: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock("../src/server/recognition/analyze-item", () => ({
  analyzeItem: mocks.analyzeItem,
}));

const itemId = "123e4567-e89b-42d3-a456-426614174000";
const pspRecognition = {
  item: {
    name: "Sony PSP",
    category: "electronics",
    condition: {
      grade: 4,
      observations: ["黒い携帯型ゲーム機"],
      needsUserConfirmation: true,
    },
  },
  recommendation: {
    action: "keep",
    reason: "動作確認ができていないため、状態を確認してから決めましょう。",
  },
};

function configureSupabase({
  claimResult = { id: itemId, image_path: "user-1/item-1/image.jpg" },
  currentItem = null,
}: {
  claimResult?: Record<string, unknown> | null;
  currentItem?: Record<string, unknown> | null;
} = {}) {
  let updateCount = 0;
  let maybeSingleCount = 0;
  const updateValues: Record<string, unknown>[] = [];
  const savedItem = {
    id: itemId,
    name: pspRecognition.item.name,
    category: pspRecognition.item.category,
    condition_grade: pspRecognition.item.condition.grade,
    observations: pspRecognition.item.condition.observations,
    recognition_result: pspRecognition,
    recommended_action: pspRecognition.recommendation.action,
    recommendation_reason: pspRecognition.recommendation.reason,
    analysis_status: "succeeded",
    status: "pending",
    selected_action: null,
  };
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  query.update = vi.fn((values: Record<string, unknown>) => {
    updateCount += 1;
    updateValues.push(values);
    return query;
  });
  query.select = vi.fn(() => query);
  query.eq = vi.fn(() => query);
  query.in = vi.fn(() => query);
  query.lt = vi.fn(() => query);
  query.maybeSingle = vi.fn(async () => {
    maybeSingleCount += 1;
    if (maybeSingleCount === 1) return { data: claimResult, error: null };
    if (updateCount === 1) return { data: currentItem, error: null };
    return { data: savedItem, error: null };
  });
  const supabase = {
    from: vi.fn(() => query),
    storage: {
      from: vi.fn(() => ({
        download: vi.fn().mockResolvedValue({
          data: new Blob(["image bytes"], { type: "image/jpeg" }),
          error: null,
        }),
      })),
    },
  };
  vi.mocked(requireApiUser).mockResolvedValue({
    supabase,
    user: { id: "user-1" },
  } as never);
  return { updateValues, supabase };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/items/[id]/analyze", () => {
  it("persists the schema-validated PSP identification and visible condition", async () => {
    const { updateValues } = configureSupabase();
    mocks.analyzeItem.mockResolvedValue(pspRecognition);

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: itemId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      item: {
        name: "Sony PSP",
        category: "electronics",
        condition_grade: 4,
        analysis_status: "succeeded",
        recognition_result: pspRecognition,
      },
    });
    expect(updateValues[1]).toMatchObject({
      name: "Sony PSP",
      category: "electronics",
      condition_grade: 4,
      analysis_status: "succeeded",
    });
    expect(mocks.analyzeItem).toHaveBeenCalledOnce();
  });

  it("streams the partial analysis when the client asks for a stream", async () => {
    configureSupabase();
    mocks.analyzeItem.mockImplementation(
      async (_input: unknown, onPartial?: (partial: unknown) => void) => {
        onPartial?.({ item: { name: "Sony" } });
        return pspRecognition;
      },
    );

    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        headers: { Accept: AI_STREAM_CONTENT_TYPE },
      }),
      { params: Promise.resolve({ id: itemId }) },
    );
    const partials: unknown[] = [];
    const result = await readAiResponse(response, (data) => partials.push(data));

    expect(response.headers.get("content-type")).toContain(AI_STREAM_CONTENT_TYPE);
    expect(partials).toEqual([{ item: { name: "Sony" } }]);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      item: { name: "Sony PSP", analysis_status: "succeeded" },
    });
  });

  it("returns a valid stored recognition result without calling Qwen again", async () => {
    const cachedItem = {
      id: itemId,
      name: "Sony PSP",
      category: "electronics",
      condition_grade: 4,
      observations: pspRecognition.item.condition.observations,
      recognition_result: pspRecognition,
      recommended_action: "keep",
      recommendation_reason: pspRecognition.recommendation.reason,
      analysis_status: "succeeded",
      status: "pending",
      selected_action: null,
      updated_at: new Date().toISOString(),
    };
    configureSupabase({ claimResult: null, currentItem: cachedItem });

    const response = await POST(new Request("http://localhost"), {
      params: Promise.resolve({ id: itemId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ item: cachedItem });
    expect(mocks.analyzeItem).not.toHaveBeenCalled();
  });
});
