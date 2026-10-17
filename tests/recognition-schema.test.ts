import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  AnalyzeResponseSchema,
  Pipeline2InputSchema,
} from "../src/types/recognition";

const validResponse = {
  item: {
    name: "木製デスク",
    category: "furniture",
    condition: {
      grade: 3,
      observations: ["天板に細かな傷が見られる"],
      needsUserConfirmation: false,
    },
  },
  recommendation: {
    action: "sell",
    reason: "外観上は再利用できる可能性があります。",
  },
};

describe("recognition contract", () => {
  it("accepts a valid analysis response", () => {
    expect(AnalyzeResponseSchema.safeParse(validResponse).success).toBe(true);
  });

  it("accepts an unknown condition and no recommendation", () => {
    const response = {
      ...validResponse,
      item: {
        ...validResponse.item,
        condition: {
          grade: null,
          observations: [],
          needsUserConfirmation: true,
        },
      },
      recommendation: { action: null, reason: "写真では判断できません。" },
    };

    expect(AnalyzeResponseSchema.safeParse(response).success).toBe(true);
  });

  it("rejects invalid category, action, and grade values", () => {
    const invalid = {
      ...validResponse,
      item: {
        ...validResponse.item,
        category: "appliance",
        condition: {
          ...validResponse.item.condition,
          grade: 6,
        },
      },
      recommendation: {
        action: "recycle",
        reason: "理由",
      },
    };

    expect(AnalyzeResponseSchema.safeParse(invalid).success).toBe(false);
    expect(ACTIONS).toEqual(["keep", "sell", "give", "dispose"]);
  });

  it("requires one of the four final actions in Pipeline2Input", () => {
    const input = {
      item: {
        name: "木製デスク",
        category: "furniture",
        conditionGrade: 3,
        observations: ["天板に細かな傷が見られる"],
      },
      selectedAction: "give",
    };

    expect(Pipeline2InputSchema.safeParse(input).success).toBe(true);
    expect(
      Pipeline2InputSchema.safeParse({
        ...input,
        selectedAction: "recycle",
      }).success,
    ).toBe(false);
  });
});
