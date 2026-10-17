import { z } from "zod";
import { requireApiUser } from "../../../lib/supabase/server";

const ProfileInputSchema = z.object({
  residenceType: z.enum(["apartment", "dormitory", "sharehouse"]),
  nearestStationId: z.string().trim().min(1).max(100),
});

function profileSchemaUnavailable(error: { code?: string }): boolean {
  return error.code === "PGRST205" || error.code === "42P01";
}

export async function GET(): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("user_profiles")
    .select("residence_type, nearest_station_id, onboarding_completed")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (error) {
    console.error("Could not load the user profile.", error);
    return Response.json(
      {
        error: {
          code: profileSchemaUnavailable(error)
            ? "PROFILE_MIGRATION_REQUIRED"
            : "PROFILE_LOAD_FAILED",
          message: profileSchemaUnavailable(error)
            ? "プロフィール機能のデータベース設定が完了していません。管理者にお問い合わせください。"
            : "プロフィールを取得できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
  return Response.json({ profile: data });
}

export async function PUT(request: Request): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "入力内容を読み取れませんでした。",
        },
      },
      { status: 400 },
    );
  }

  const parsed = ProfileInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "INVALID_PROFILE",
          message: "住居タイプと最寄り駅を選択してください。",
        },
      },
      { status: 400 },
    );
  }

  const { data: station, error: stationError } = await auth.supabase
    .from("stations")
    .select("station_id")
    .eq("station_id", parsed.data.nearestStationId)
    .maybeSingle();
  if (stationError) {
    console.error("Could not verify the selected station.", stationError);
    return Response.json(
      {
        error: {
          code: "STATION_LOOKUP_FAILED",
          message: "駅情報を確認できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
  if (!station) {
    return Response.json(
      {
        error: {
          code: "STATION_NOT_FOUND",
          message: "駅の一覧から最寄り駅を選択してください。",
        },
      },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("user_profiles")
    .upsert(
      {
        user_id: auth.user.id,
        residence_type: parsed.data.residenceType,
        nearest_station_id: parsed.data.nearestStationId,
        onboarding_completed: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" },
    )
    .select("residence_type, nearest_station_id, onboarding_completed")
    .single();
  if (error) {
    console.error("Could not save the user profile.", error);
    return Response.json(
      {
        error: {
          code: profileSchemaUnavailable(error)
            ? "PROFILE_MIGRATION_REQUIRED"
            : "PROFILE_SAVE_FAILED",
          message: profileSchemaUnavailable(error)
            ? "プロフィール機能のデータベース設定が完了していません。管理者にお問い合わせください。"
            : "プロフィールを保存できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
  return Response.json({ profile: data });
}
