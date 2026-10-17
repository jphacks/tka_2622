import { describe, expect, it } from "vitest";
import { MOCK_ANALYSIS } from "../src/fixtures/mock-analysis";
import {
  buildPipeline2Input,
  isItemUnidentified,
  isItemEdited,
} from "../src/lib/recognition-workflow";
import { displayItemCategory } from "../src/lib/item-category";
import { validateImageFile } from "../src/lib/image-validation";

describe("recognition workflow helpers", () => {
  it("uses only edited item data and the user's selected action", () => {
    const editedItem = {
      ...MOCK_ANALYSIS.item,
      name: "携帯ゲーム機",
      condition: { ...MOCK_ANALYSIS.item.condition, grade: 3 as const },
    };
    const input = buildPipeline2Input(editedItem, "give");

    expect(input).toEqual({
      item: {
        name: "携帯ゲーム機",
        category: "electronics",
        conditionGrade: 3,
        observations: MOCK_ANALYSIS.item.condition.observations,
      },
      selectedAction: "give",
    });
    expect(isItemEdited(MOCK_ANALYSIS.item, editedItem)).toBe(true);
  });

  it("does not mark unchanged recognition data as edited", () => {
    expect(isItemEdited(MOCK_ANALYSIS.item, MOCK_ANALYSIS.item)).toBe(false);
  });

  it("distinguishes an unidentifiable object from analysis failure", () => {
    expect(
      isItemUnidentified({
        ...MOCK_ANALYSIS,
        item: { ...MOCK_ANALYSIS.item, name: "不明な物品" },
      }),
    ).toBe(true);
    expect(isItemUnidentified(MOCK_ANALYSIS)).toBe(false);
    expect(isItemUnidentified(null)).toBe(false);
  });

  it("tracks edits to recognized observations as well as item fields", () => {
    const editedItem = {
      ...MOCK_ANALYSIS.item,
      condition: {
        ...MOCK_ANALYSIS.item.condition,
        observations: ["別の観察内容"],
      },
    };

    expect(isItemEdited(MOCK_ANALYSIS.item, editedItem)).toBe(true);
  });

  it("displays existing categories appropriately for common recognized items", () => {
    expect(displayItemCategory("electronics", "Sony PSP")).toBe("ゲーム機");
    expect(displayItemCategory("electronics", "Sony PSP-2000")).toBe("ゲーム機");
    expect(displayItemCategory("other", "Electric Guitar")).toBe("楽器");
    expect(displayItemCategory("furniture", "Dining Chair")).toBe("家具");
    expect(displayItemCategory("electronics", "Refrigerator")).toBe("家電");
    expect(displayItemCategory("books", "Book")).toBe("本・書籍");
  });

  it("accepts JPEG, PNG, and WebP up to 5 MB", () => {
    expect(validateImageFile({ type: "image/jpeg", size: 1 })).toBeNull();
    expect(
      validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 }),
    ).toBeNull();
    expect(validateImageFile({ type: "image/webp", size: 1 })).toBeNull();
  });

  it("rejects unsupported, empty, and oversized images", () => {
    expect(
      validateImageFile({ type: "image/gif", size: 100 }),
    ).toContain("JPEG");
    expect(
      validateImageFile({ type: "image/png", size: 0 }),
    ).toContain("空");
    expect(
      validateImageFile({ type: "image/png", size: 5 * 1024 * 1024 + 1 }),
    ).toContain("5MB");
  });
});
