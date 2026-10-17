import {
  AnalyzeResponseSchema,
  Pipeline2InputSchema,
  type Action,
  type AnalyzeResponse,
  type Pipeline2Input,
  type RecognizedItem,
} from "../types/recognition";

export function isItemEdited(
  original: RecognizedItem,
  edited: RecognizedItem,
): boolean {
  return (
    original.name !== edited.name ||
    original.category !== edited.category ||
    original.condition.grade !== edited.condition.grade ||
    JSON.stringify(original.condition.observations) !==
      JSON.stringify(edited.condition.observations)
  );
}

export function isRecommendationCurrent(
  recognitionValue: AnalyzeResponse | unknown,
): recognitionValue is AnalyzeResponse {
  const parsed = AnalyzeResponseSchema.safeParse(recognitionValue);
  if (!parsed.success) return false;
  return !isItemEdited(
    parsed.data.recommendationBasis ?? parsed.data.item,
    parsed.data.item,
  );
}

export function isItemUnidentified(
  recognition: AnalyzeResponse | null,
): boolean {
  return recognition?.item.name.trim() === "不明な物品";
}

export function buildPipeline2Input(
  item: RecognizedItem,
  selectedAction: Action,
): Pipeline2Input {
  return Pipeline2InputSchema.parse({
    item: {
      name: item.name,
      category: item.category,
      conditionGrade: item.condition.grade,
      observations: item.condition.observations,
    },
    selectedAction,
  });
}
