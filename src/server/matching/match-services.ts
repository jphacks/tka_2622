import type {
  ServiceBusiness,
  ServiceMatchRequest,
} from "../../types/service";
import { MockServiceProvider } from "./providers/mock-provider";
import type { ServiceProvider } from "./providers/types";

const DEFAULT_PROVIDER = new MockServiceProvider();

export async function matchServices(
  input: ServiceMatchRequest,
  provider: ServiceProvider = DEFAULT_PROVIDER,
): Promise<ServiceBusiness[] | null> {
  const businesses = await provider.getBusinessesByStation(input.stationId);
  if (businesses === null) {
    return null;
  }

  return businesses
    .filter((business) =>
      business.supportedActions.includes(input.selectedAction),
    )
    .sort((a, b) => a.distanceMeters - b.distanceMeters)
    .slice(0, 10);
}
