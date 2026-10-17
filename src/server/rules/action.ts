import { ACTION_GUIDES } from "../../lib/action-guides";
import type { Action } from "../../types/recognition";
import type { ServiceBusiness } from "../../types/service";
import type { OsmStoreCandidate } from "../../types/service";
import type { RuleInput } from "./schemas";
import type { RuleServiceProvider } from "./providers/types";

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管の準備を進める",
  sell: "近くの買取相談先を確認する",
  give: "譲渡の準備を進める",
  dispose: "居住自治体の処分ルールを確認する",
};

const NEXT_ACTION_TYPES: Record<
  Action,
  | "search_services"
  | "review_packing_checklist"
  | "prepare_transfer"
  | "check_local_disposal_rules"
> = {
  keep: "review_packing_checklist",
  sell: "search_services",
  give: "prepare_transfer",
  dispose: "check_local_disposal_rules",
};

export interface ActionResult {
  selectedAction: Action;
  nextAction: {
    type:
      | "search_services"
      | "review_packing_checklist"
      | "prepare_transfer"
      | "check_local_disposal_rules";
    label: string;
  };
  guidance: (typeof ACTION_GUIDES)[Action];
  services: {
    status:
      | "available"
      | "empty"
      | "needs_station"
      | "not_applicable"
      | "error";
    items: ServiceBusiness[];
    osmCandidates: OsmStoreCandidate[];
  };
}

export async function resolveAction(
  input: RuleInput,
  action: Action,
  serviceProvider: RuleServiceProvider,
): Promise<ActionResult> {
  let services: ActionResult["services"] = {
    status: "not_applicable",
    items: [],
    osmCandidates: [],
  };

  if (action === "sell") {
    if (!input.stationId) {
      services = { status: "needs_station", items: [], osmCandidates: [] };
    } else {
      const [businesses, osmCandidates] = await Promise.all([
        serviceProvider.getBusinessesByStation(input.stationId),
        serviceProvider.getOsmCandidatesByStation?.(input.stationId) ??
          Promise.resolve([]),
      ]);
      const items = businesses
        .filter((business) => business.stationId === input.stationId)
        .filter((business) => business.supportedActions.includes("sell"))
        .filter((business) => business.purchaseStatus === "confirmed")
        .filter((business) => business.distanceMeters <= 3000)
        .filter((business) =>
          business.supportedCategories?.includes(input.item.category),
        )
        .sort((a, b) => a.distanceMeters - b.distanceMeters)
        .slice(0, 10);
      services = {
        status: items.length > 0 ? "available" : "empty",
        items,
        osmCandidates,
      };
    }
  }

  return {
    selectedAction: action,
    nextAction: {
      type: NEXT_ACTION_TYPES[action],
      label: ACTION_LABELS[action],
    },
    guidance:
      action === "sell"
        ? {
            ...ACTION_GUIDES.sell,
            directoryMessage:
              services.status === "empty"
                ? "この駅の周辺では、確認済みの買取サービスがまだ登録されていません。"
                : "買取対象や受付条件は店舗によって異なるため、利用前に確認してください。",
          }
        : ACTION_GUIDES[action],
    services,
  };
}
