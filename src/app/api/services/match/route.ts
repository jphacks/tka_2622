import { SupabaseRuleServiceProvider } from "../../../../server/rules/providers/supabase-provider";
import { ServiceMatchRequestSchema } from "../../../../types/service";

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "リクエストを読み取れませんでした。" } },
      { status: 400 },
    );
  }

  const parsed = ServiceMatchRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "検索条件を確認してください。" } },
      { status: 400 },
    );
  }

  if (parsed.data.selectedAction !== "sell") {
    return Response.json({
      stationId: parsed.data.stationId,
      selectedAction: parsed.data.selectedAction,
      dataSource: "supabase",
      results: [],
    });
  }

  try {
    const businesses = await new SupabaseRuleServiceProvider()
      .getBusinessesByStation(parsed.data.stationId);
    const results = businesses
      .filter((business) => business.purchaseStatus === "confirmed")
      .filter((business) => business.distanceMeters <= 3000)
      .filter((business) =>
        business.supportedCategories?.includes(parsed.data.item.category),
      )
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .slice(0, 10);

    return Response.json({
      stationId: parsed.data.stationId,
      selectedAction: parsed.data.selectedAction,
      dataSource: "supabase",
      results,
    });
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "SERVICE_DIRECTORY_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "買取サービス情報を取得できませんでした。",
        },
      },
      { status: 503 },
    );
  }
}
