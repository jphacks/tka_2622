import type { Action } from "../../types/recognition";
import { EmptyRuleServiceProvider } from "./providers/empty-provider";
import type { RuleServiceProvider } from "./providers/types";
import { resolveAction } from "./action";
import { getExceptionNotices } from "./exceptions";
import { recommendAction } from "./recommendation";
import { RuleInputSchema, RuleResultSchema, type RuleInput } from "./schemas";
import { ruleItemCategory } from "../../lib/item-category";

const DEFAULT_SERVICE_PROVIDER = new EmptyRuleServiceProvider();

export async function evaluateRules(
  inputValue: RuleInput,
  serviceProvider: RuleServiceProvider = DEFAULT_SERVICE_PROVIDER,
) {
  const parsedInput = RuleInputSchema.parse(inputValue);
  const input: RuleInput = {
    ...parsedInput,
    item: {
      ...parsedInput.item,
      category: ruleItemCategory(
        parsedInput.item.category,
        parsedInput.item.name,
      ),
    },
  };
  const recommendation = recommendAction(input);
  const selectedAction: Action =
    input.selectedAction ?? recommendation.action;
  const actionResult = await resolveAction(input, selectedAction, serviceProvider);
  const notices = getExceptionNotices(input, selectedAction);

  if (selectedAction === "dispose") {
    notices.push({
      ruleId: "municipality-required",
      type: "needs_verification",
      message:
        "ごみの分別・回収方法は居住自治体によって異なり、このサービスでは自治体の公式ルールを照合していません。駅から居住自治体は判断せず、お住まいの自治体の公式案内をご確認ください。",
    });
  }

  const sections = [
    "RecommendationCard",
    {
      keep: "PackingChecklistCard",
      sell: "StoreList",
      give: "TransferPreparationCard",
      dispose: "DisposalGuideCard",
    }[selectedAction],
    ...(notices.length > 0 ? ["SafetyNoticeCard"] : []),
  ];

  return RuleResultSchema.parse({
    item: {
      name: input.item.name,
      category: input.item.category,
      conditionGrade: input.item.conditionGrade ?? null,
      observations: input.item.observations ?? [],
    },
    stationId: input.stationId ?? null,
    recommendedAction: recommendation.action,
    selectedAction,
    recommendationConfidence: recommendation.confidence,
    recommendationReason: recommendation.reason,
    nextAction: actionResult.nextAction,
    guidance: actionResult.guidance,
    services: actionResult.services,
    notices,
    sections,
  });
}
