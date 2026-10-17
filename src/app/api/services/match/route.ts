import { matchServices } from "../../../../server/matching/match-services";
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

  const results = await matchServices(parsed.data);
  if (results === null) {
    return Response.json(
      { error: { code: "STATION_NOT_FOUND", message: "駅が見つかりませんでした。" } },
      { status: 404 },
    );
  }

  return Response.json({
    stationId: parsed.data.stationId,
    selectedAction: parsed.data.selectedAction,
    dataSource: "mock",
    results,
  });
}
