import {
  Pipeline2InputSchema,
  type Action,
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
    original.condition.grade !== edited.condition.grade
  );
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
