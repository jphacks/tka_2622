import { resolveAction } from "./action";
import type { RuleResult } from "./schemas";
import type { RuleServiceProvider } from "./providers/types";

/**
 * A saved plan embeds the shop list as it was at save time. Re-read the
 * current shops for the plan's station so the page shows today's data
 * (e.g. opening hours added later), keeping the saved action and guidance.
 * The refreshed result is for display only; it is never written back.
 */
export async function refreshSavedPlanServices(
  result: RuleResult,
  serviceProvider: RuleServiceProvider,
): Promise<RuleResult> {
  if (result.selectedAction !== "sell" || !result.stationId) return result;

  try {
    const { services } = await resolveAction(
      { stationId: result.stationId, item: result.item },
      "sell",
      serviceProvider,
    );
    return { ...result, services };
  } catch (error) {
    console.error("Could not refresh the saved plan's shop list.", error);
    return result;
  }
}
