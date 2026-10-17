import { StationListResponseSchema } from "../../../types/station";
import { SupabaseRuleServiceProvider } from "../../../server/rules/providers/supabase-provider";

export async function GET(): Promise<Response> {
  try {
    const provider = new SupabaseRuleServiceProvider();
    const response = StationListResponseSchema.parse({
      stations: await provider.getStations(),
    });
    return Response.json(response);
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "STATION_DIRECTORY_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "駅の一覧を取得できませんでした。",
        },
      },
      { status: 503 },
    );
  }
}
