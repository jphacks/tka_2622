import type { Action } from "../../types/recognition";
import type { RuleInput } from "./schemas";

export interface Recommendation {
  action: Action;
  confidence: "low" | "medium" | "high";
  reason: string;
}

const REUSABLE_CATEGORIES = new Set([
  "furniture",
  "electronics",
  "books",
  "clothing",
  "bicycle",
  "household",
]);

function hasPoorAppearance(input: RuleInput): boolean {
  return (
    input.item.condition === "poor" ||
    (input.item.conditionGrade !== null &&
      input.item.conditionGrade !== undefined &&
      input.item.conditionGrade <= 2)
  );
}

function hasUnknownAppearance(input: RuleInput): boolean {
  return (
    input.item.condition === "unknown" ||
    (input.item.condition === undefined &&
      input.item.conditionGrade == null)
  );
}

export function recommendAction(input: RuleInput): Recommendation {
  if (input.preferredAction) {
    return {
      action: input.preferredAction,
      confidence: "high",
      reason: "ご希望の整理方法を優先しました。",
    };
  }

  if (input.item.workingStatus === "not_working") {
    return {
      action: "dispose",
      confidence: "medium",
      reason:
        "動作しないとの情報があるため、処分を候補にしました。品目によって回収方法が異なるため、自治体の案内をご確認ください。",
    };
  }

  if (
    input.item.workingStatus === "working" &&
    REUSABLE_CATEGORIES.has(input.item.category)
  ) {
    const uncertainAppearance =
      hasPoorAppearance(input) || hasUnknownAppearance(input);
    return {
      action: "sell",
      confidence: uncertainAppearance ? "low" : "medium",
      reason: uncertainAppearance
        ? "動作は確認されていますが、外観状態が不明または良好でないため、売却は低確度の候補です。買取可否や条件は店舗への確認が必要です。"
        : "使用可能と確認されたため、売却を候補にしました。買取可否や条件は店舗への確認が必要です。",
    };
  }

  if (input.aiRecommendedAction) {
    const aiReason = input.aiRecommendationReason?.trim();
    return {
      action: input.aiRecommendedAction,
      confidence:
        input.item.workingStatus === "unknown" ||
        hasPoorAppearance(input) ||
        hasUnknownAppearance(input)
          ? "low"
          : "medium",
      reason: aiReason
        ? `${aiReason} 状態や条件は実物で確認してください。`
        : "AIの提案を参考にしています。状態や条件は実物で確認してください。",
    };
  }

  return {
    action: "give",
    confidence: "low",
    reason:
      "状態や動作状況を十分に確認できないため、譲渡を含む選択肢を仮の候補として示しています。再利用できるかを確認してからお決めください。",
  };
}
