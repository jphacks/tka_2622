import { MOCK_STATIONS } from "../../../fixtures/mock-stations";
import { StationListResponseSchema } from "../../../types/station";

export async function GET(): Promise<Response> {
  const response = StationListResponseSchema.parse({
    stations: MOCK_STATIONS,
  });
  return Response.json(response);
}
