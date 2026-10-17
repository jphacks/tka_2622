import type { ServiceBusiness } from "../../../types/service";
import type { RuleServiceProvider } from "./types";

export class EmptyRuleServiceProvider implements RuleServiceProvider {
  async getBusinessesByStation(): Promise<ServiceBusiness[]> {
    return [];
  }
}
