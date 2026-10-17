import type { ItemCategory } from "../../../types/recognition";
import type { ServiceBusiness } from "../../../types/service";
import type { OsmStoreCandidate } from "../../../types/service";

export interface RuleServiceProvider {
  getBusinessesByStation(stationId: string): Promise<ServiceBusiness[]>;
  getOsmCandidatesByStation?(
    stationId: string,
  ): Promise<OsmStoreCandidate[]>;
}

export interface RuleServiceQuery {
  stationId: string;
  itemCategory: ItemCategory;
}
