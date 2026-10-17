import type { ServiceBusiness } from "../../../types/service";

export interface ServiceProvider {
  getBusinessesByStation(stationId: string): Promise<ServiceBusiness[] | null>;
}
