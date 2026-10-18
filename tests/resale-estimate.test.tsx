import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RecognitionLivePreview } from "../src/components/ai/AiLivePreview";
import { ResaleEstimateCard } from "../src/components/ai/ResaleEstimateCard";
import { RECOGNITION_SYSTEM_PROMPT } from "../src/server/recognition/recognition-prompt";
import { AnalyzeResponseSchema } from "../src/types/recognition";

const base = {
  item: {
    name: "木製デスク",
    category: "furniture",
    condition: { grade: 4, observations: ["天板に小さな傷"], needsUserConfirmation: true },
  },
  recommendation: { action: "sell", reason: "状態が良いため" },
};

const resale = {
  likelihood: "medium",
  reason: "木製家具は需要があります。サイズと傷の程度で査定が変わります。",
  priceRange: { min: 1000, max: 5000 },
  tips: ["引き出しの動きを確認する"],
};

describe("resale estimate schema", () => {
  it("accepts a resale estimate", () => {
    const parsed = AnalyzeResponseSchema.parse({ ...base, resale });
    expect(parsed.resale).toEqual(resale);
  });

  it("keeps older results without an estimate valid", () => {
    expect(AnalyzeResponseSchema.parse(base).resale).toBeUndefined();
  });

  it("drops a malformed estimate instead of failing the analysis", () => {
    for (const broken of [
      { ...resale, priceRange: { min: 5000, max: 1000 } },
      { ...resale, likelihood: "certain" },
      { ...resale, priceRange: { min: -1, max: 10 } },
    ]) {
      const parsed = AnalyzeResponseSchema.safeParse({ ...base, resale: broken });
      expect(parsed.success).toBe(true);
      expect(parsed.data?.resale).toBeUndefined();
    }
  });

  it("asks the model for the estimate before the recommendation", () => {
    const shape = RECOGNITION_SYSTEM_PROMPT.slice(
      RECOGNITION_SYSTEM_PROMPT.indexOf('{"item"'),
    );
    expect(shape.indexOf('"resale"')).toBeGreaterThan(0);
    expect(shape.indexOf('"resale"')).toBeLessThan(shape.indexOf('"recommendation"'));
  });
});

describe("ResaleEstimateCard", () => {
  it("shows the likelihood, price range, reason and tips with a disclaimer", () => {
    const html = renderToStaticMarkup(
      <ResaleEstimateCard
        estimate={{ ...resale, likelihood: "medium" } as never}
      />,
    );
    expect(html).toContain("売れる可能性があります");
    expect(html).toContain("1,000〜5,000円");
    expect(html).toContain("引き出しの動きを確認する");
    expect(html).toContain("保証されません");
  });

  it("omits the price when the AI gives none", () => {
    const html = renderToStaticMarkup(
      <ResaleEstimateCard
        estimate={{ ...resale, likelihood: "low", priceRange: null } as never}
      />,
    );
    expect(html).toContain("売れる可能性は低めです");
    expect(html).not.toContain("買取額の目安");
  });
});

describe("RecognitionLivePreview", () => {
  it("shows the resale estimate while the AI is still writing", () => {
    const html = renderToStaticMarkup(
      <RecognitionLivePreview
        partial={{ item: base.item, resale: { likelihood: "high", priceRange: { min: 3000, max: 8000 } } }}
      />,
    );
    expect(html).toContain("売れるかを推定しています");
    expect(html).toContain("売れる可能性");
    expect(html).toContain("3,000〜8,000円");
  });
});
