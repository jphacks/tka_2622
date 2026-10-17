import { MOCK_BUSINESSES } from "../../../fixtures/mock-businesses";
import { MOCK_STATIONS } from "../../../fixtures/mock-stations";
import type { ServiceBusiness } from "../../../types/service";
import type { ServiceProvider } from "./types";

export class MockServiceProvider implements ServiceProvider {
  async getBusinessesByStation(
    stationId: string,
  ): Promise<ServiceBusiness[] | null> {
    if (!MOCK_STATIONS.some((station) => station.id === stationId)) {
      return null;
    }

    return MOCK_BUSINESSES.filter((business) => business.stationId === stationId);
  }
}
