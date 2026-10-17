import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildMovePlanItems,
  hashMovePlanInput,
  MovePlanSchema,
  validateMovePlan,
} from "../src/server/move-plan";
import { moveDateForTask } from "../src/lib/move-plan-date";
import { RuleResultSchema } from "../src/server/rules/schemas";
import { POST as generateMovePlan } from "../src/app/api/items/plan/route";
import { requireApiUser } from "../src/lib/supabase/server";
import { loadMovePlanSource } from "../src/server/move-plan-data";
import { generateMovePlanText } from "../src/server/recognition/qwen-text-client";

vi.mock("../src/lib/supabase/server", () => ({
  requireApiUser: vi.fn(),
}));

vi.mock("../src/server/move-plan-data", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("../src/server/move-plan-data")>();
  return { ...actual, loadMovePlanSource: vi.fn() };
});

vi.mock("../src/server/recognition/qwen-text-client", async (importOriginal) => {
  const actual =
    await importOriginal<
      typeof import("../src/server/recognition/qwen-text-client")
    >();
  return { ...actual, generateMovePlanText: vi.fn() };
});

const itemId = "123e4567-e89b-42d3-a456-426614174000";
const foreignItemId = "123e4567-e89b-42d3-a456-426614174001";

const guide = RuleResultSchema.parse({
  item: {
    name: "エレクトリックギター",
    category: "electronics",
    conditionGrade: 3,
    observations: ["本体に小さな傷が見られる"],
  },
  stationId: null,
  recommendedAction: "keep",
  selectedAction: "keep",
  recommendationConfidence: "medium",
  recommendationReason: "状態を見ながら保管方法を検討します。",
  nextAction: { type: "review_packing_checklist", label: "梱包を確認する" },
  guidance: {
    title: "楽器の保管準備",
    introduction: "安全に保管する準備をします。",
    steps: ["弦を緩めてケースに収納する"],
    directoryMessage: "梱包前に状態を確認してください。",
  },
  services: { status: "not_applicable", items: [], osmCandidates: [] },
  notices: [],
  sections: [],
});

function sourceItem(id = itemId) {
  return {
    id,
    name: "エレクトリックギター",
    category: "electronics" as const,
    action: "keep" as const,
    status: "in_progress" as const,
    handlingGuide: guide,
  };
}

function task(overrides: Record<string, unknown> = {}) {
  return {
    itemId,
    action: "keep",
    taskTitle: "ギターを梱包する",
    taskDescription: "本体を保護して運搬できるようにします。",
    steps: ["弦を緩める", "ケースに入れて固定する"],
    daysBeforeMove: 7,
    priority: "medium",
    requiresOfficialConfirmation: false,
    ...overrides,
  };
}

function configureGeneration(
  rpcReplies: Array<{ data: unknown; error: null | { code: string } }>,
) {
  const rpc = vi.fn(
    async (...args: [string, Record<string, unknown>]) => {
      void args;
      return rpcReplies.shift() ?? { data: null, error: null };
    },
  );
  vi.mocked(requireApiUser).mockResolvedValue({
    supabase: { rpc },
    user: { id: "user-1" },
  } as never);
  const item = sourceItem();
  vi.mocked(loadMovePlanSource).mockResolvedValue({
    movingDate: "2026-11-15",
    selectedStationId: "station-a",
    inputHash: "a".repeat(64),
    items: [item],
    totalItems: 1,
    completedItems: 0,
  });
  return { rpc, item };
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("move plan validation and source handling", () => {
  it("accepts a task plan that covers each saved item and action", () => {
    const result = validateMovePlan(
      {
        summary: "ギターを安全に梱包します。",
        tasks: [task()],
      },
      [sourceItem()],
    );
    expect(result.tasks[0].itemId).toBe(itemId);
  });

  it("rejects invented items, mismatched actions, duplicate work, and unverified disposal", () => {
    const validTask = task();
    expect(() =>
      validateMovePlan(
        { summary: "まとめ", tasks: [task({ itemId: foreignItemId })] },
        [sourceItem()],
      ),
    ).toThrow();
    expect(() =>
      validateMovePlan(
        { summary: "まとめ", tasks: [task({ action: "sell" })] },
        [sourceItem()],
      ),
    ).toThrow();
    expect(() =>
      validateMovePlan(
        {
          summary: "まとめ",
          tasks: [validTask, { ...validTask }],
        },
        [sourceItem()],
      ),
    ).toThrow();
    expect(() =>
      validateMovePlan(
        {
          summary: "まとめ",
          tasks: [
            task({
              action: "dispose",
              requiresOfficialConfirmation: false,
            }),
          ],
        },
        [{ ...sourceItem(), action: "dispose" }],
      ),
    ).toThrow();
  });

  it("requires every saved item and limits generated work per item", () => {
    expect(() =>
      validateMovePlan(
        { summary: "まとめ", tasks: [task()] },
        [sourceItem(), sourceItem(foreignItemId)],
      ),
    ).toThrow();
    expect(() =>
      validateMovePlan(
        {
          summary: "まとめ",
          tasks: [
            task({ taskTitle: "ギターを梱包する 1" }),
            task({ taskTitle: "ギターを梱包する 2" }),
            task({ taskTitle: "ギターを梱包する 3" }),
            task({ taskTitle: "ギターを梱包する 4" }),
          ],
        },
        [sourceItem()],
      ),
    ).toThrow();
  });

  it("includes only valid saved plans belonging to loaded inventory items", () => {
    const items = buildMovePlanItems(
      [
        {
          id: itemId,
          name: "エレクトリックギター",
          category: "electronics",
          status: "in_progress",
        },
      ],
      [
        {
          item_id: itemId,
          selected_action: "keep",
          handling_guide: guide,
        },
        {
          item_id: foreignItemId,
          selected_action: "keep",
          handling_guide: guide,
        },
        {
          item_id: itemId,
          selected_action: "sell",
          handling_guide: guide,
        },
      ],
    );
    expect(items).toHaveLength(1);
    expect(items[0].action).toBe("keep");
  });

  it("hashes meaningful source changes but ignores progress and item ordering", () => {
    const first = sourceItem(itemId);
    const second = sourceItem(foreignItemId);
    const initialHash = hashMovePlanInput([first, second], "station-a");
    expect(
      hashMovePlanInput(
        [
          { ...second, status: "completed" },
          { ...first, status: "completed" },
        ],
        "station-a",
      ),
    ).toBe(initialHash);
    expect(
      hashMovePlanInput(
        [{ ...first, name: "別のギター" }, second],
        "station-a",
      ),
    ).not.toBe(initialHash);
    expect(hashMovePlanInput([first, second], "station-b")).not.toBe(
      initialHash,
    );
  });

  it("validates the stored output schema and derives dates without timezone shifts", () => {
    expect(MovePlanSchema.safeParse({ summary: "OK", tasks: [task()] }).success)
      .toBe(true);
    expect(moveDateForTask("2024-03-01", 1)).toBe("2024-02-29");
    expect(moveDateForTask("2026-03-01", 14)).toBe("2026-02-15");
    expect(moveDateForTask(null, 14)).toBeNull();
    expect(moveDateForTask("2026-02-30", 1)).toBeNull();
  });
});

describe("POST /api/items/plan", () => {
  it("returns a cached plan without calling Qwen", async () => {
    const savedPlan = { summary: "保存済み", tasks: [task()] };
    configureGeneration([
      {
        data: {
          cacheHit: true,
          inProgress: false,
          inputHash: "a".repeat(64),
          plan: savedPlan,
          generatedAt: "2026-10-01T00:00:00.000Z",
        },
        error: null,
      },
    ]);

    const response = await generateMovePlan();

    expect(response.status).toBe(200);
    expect((await response.json()).cached).toBe(true);
    expect(generateMovePlanText).not.toHaveBeenCalled();
  });

  it("calls Qwen only after a generation claim and saves the validated result", async () => {
    const savedPlan = { summary: "保存結果", tasks: [task()] };
    const { rpc, item } = configureGeneration([
      {
        data: {
          cacheHit: false,
          inProgress: false,
          inputHash: null,
          plan: null,
          generatedAt: null,
        },
        error: null,
      },
      {
        data: {
          inputHash: "a".repeat(64),
          plan: savedPlan,
          generatedAt: "2026-10-01T00:00:00.000Z",
        },
        error: null,
      },
    ]);
    vi.mocked(generateMovePlanText).mockResolvedValue(savedPlan);

    const response = await generateMovePlan();

    expect(response.status).toBe(200);
    expect((await response.json()).plan.summary).toBe("保存結果");
    expect(generateMovePlanText).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls[0][0]).toBe("claim_user_move_plan_generation");
    expect(rpc.mock.calls[1][0]).toBe("save_user_move_plan_generation");
    expect(vi.mocked(generateMovePlanText).mock.calls[0][0]).toContain(item.id);
  });

  it("does not invoke Qwen when another generation owns the claim", async () => {
    configureGeneration([
      {
        data: {
          cacheHit: false,
          inProgress: true,
          inputHash: null,
          plan: null,
          generatedAt: null,
        },
        error: null,
      },
    ]);

    const response = await generateMovePlan();

    expect(response.status).toBe(409);
    expect(generateMovePlanText).not.toHaveBeenCalled();
  });

  it("releases a failed generation claim without saving over an existing plan", async () => {
    const { rpc } = configureGeneration([
      {
        data: {
          cacheHit: false,
          inProgress: false,
          inputHash: null,
          plan: {
            summary: "以前のプラン",
            tasks: [task()],
          },
          generatedAt: "2026-09-01T00:00:00.000Z",
        },
        error: null,
      },
      { data: null, error: null },
    ]);
    vi.mocked(generateMovePlanText).mockRejectedValue(new Error("provider down"));

    const response = await generateMovePlan();

    expect(response.status).toBe(502);
    expect(rpc.mock.calls.map(([name]) => name)).toEqual([
      "claim_user_move_plan_generation",
      "release_user_move_plan_generation",
    ]);
  });
});
