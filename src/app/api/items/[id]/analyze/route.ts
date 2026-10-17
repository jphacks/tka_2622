import { analyzeItem } from "../../../../../server/recognition/analyze-item";
import { RecognitionServiceError } from "../../../../../server/recognition/qwen-client";
import {
  getSupabaseServerClient,
  requireApiUser,
} from "../../../../../lib/supabase/server";

export const runtime = "nodejs";

const ITEM_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

async function markAnalysisFailed(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  itemId: string,
  userId: string,
) {
  const { error } = await supabase
    .from("user_items")
    .update({ analysis_status: "failed", updated_at: new Date().toISOString() })
    .eq("id", itemId)
    .eq("user_id", userId)
    .eq("analysis_status", "processing");
  if (error) console.error("Could not mark item analysis as failed.", error);
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!ITEM_ID_PATTERN.test(id)) {
    return errorResponse("INVALID_ITEM_ID", "持ち物を確認できません。", 400);
  }

  const { data: firstClaim, error: claimError } = await auth.supabase
    .from("user_items")
    .update({
      analysis_status: "processing",
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .in("analysis_status", ["pending", "failed"])
    .select("id, image_path")
    .maybeSingle();
  if (claimError) {
    console.error("Could not claim item analysis.", claimError);
    return errorResponse(
      "ANALYSIS_START_FAILED",
      "分析を開始できませんでした。時間をおいて再度お試しください。",
      503,
    );
  }
  let claimed = firstClaim;
  let observedStatus: string | null = null;
  if (!claimed) {
    const { data: current, error: currentError } = await auth.supabase
      .from("user_items")
      .select("analysis_status, updated_at")
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .maybeSingle();
    if (currentError) {
      console.error("Could not inspect the current item analysis status.", currentError);
      return errorResponse(
        "ANALYSIS_STATUS_UNAVAILABLE",
        "分析状態を確認できませんでした。",
        503,
      );
    }
    if (!current) return errorResponse("ITEM_NOT_FOUND", "持ち物が見つかりません。", 404);
    observedStatus = current.analysis_status;
    const staleBefore = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    if (
      current.analysis_status === "processing" &&
      current.updated_at < staleBefore
    ) {
      const { data: recovered, error: recoverError } = await auth.supabase
        .from("user_items")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .eq("user_id", auth.user.id)
        .eq("analysis_status", "processing")
        .lt("updated_at", staleBefore)
        .select("id, image_path")
        .maybeSingle();
      if (recoverError) {
        console.error("Could not recover stale item analysis.", recoverError);
        return errorResponse(
          "ANALYSIS_STATUS_UNAVAILABLE",
          "分析状態を確認できませんでした。",
          503,
        );
      }
      claimed = recovered;
    }
  }
  if (!claimed) {
    return errorResponse(
      "ANALYSIS_ALREADY_STARTED",
      observedStatus === "processing"
        ? "分析中です。完了するまでお待ちください。"
        : "この持ち物はすでに分析済みです。",
      409,
    );
  }

  const { data: image, error: downloadError } = await auth.supabase.storage
    .from("item-images")
    .download(claimed.image_path);
  if (downloadError || !image) {
    await markAnalysisFailed(auth.supabase, id, auth.user.id);
    console.error("Could not load the private image for analysis.", downloadError);
    return errorResponse(
      "IMAGE_LOAD_FAILED",
      "保存した写真を読み込めませんでした。写真を削除して再登録してください。",
      503,
    );
  }

  const extension = claimed.image_path.split(".").pop()?.toLowerCase();
  const mimeTypeByExtension: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
  };
  const mimeType = extension ? mimeTypeByExtension[extension] : undefined;
  if (!mimeType) {
    await markAnalysisFailed(auth.supabase, id, auth.user.id);
    return errorResponse(
      "IMAGE_TYPE_INVALID",
      "写真形式を確認できません。写真を削除して再登録してください。",
      400,
    );
  }

  try {
    const result = await analyzeItem({
      imageBase64: Buffer.from(await image.arrayBuffer()).toString("base64"),
      mimeType,
    });
    const { data, error: updateError } = await auth.supabase
      .from("user_items")
      .update({
        name: result.item.name,
        category: result.item.category,
        condition_grade: result.item.condition.grade,
        observations: result.item.condition.observations,
        recognition_result: result,
        recommended_action: result.recommendation.action,
        recommendation_reason: result.recommendation.reason,
        analysis_status: "succeeded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", auth.user.id)
      .eq("analysis_status", "processing")
      .select(
        "id, name, category, condition_grade, observations, recognition_result, recommended_action, recommendation_reason, analysis_status, status, selected_action",
      )
      .maybeSingle();
    if (updateError || !data) {
      if (updateError) console.error("Could not save the item analysis.", updateError);
      await markAnalysisFailed(auth.supabase, id, auth.user.id);
      return errorResponse(
        "ANALYSIS_SAVE_FAILED",
        "分析結果を保存できませんでした。もう一度お試しください。",
        503,
      );
    }
    return Response.json({ item: data });
  } catch (error) {
    await markAnalysisFailed(auth.supabase, id, auth.user.id);
    if (error instanceof RecognitionServiceError) {
      const statusByCode = {
        AI_TIMEOUT: 504,
        AI_UNAVAILABLE: 502,
        AI_RESPONSE_INVALID: 502,
        SERVER_CONFIG_ERROR: 500,
      } as const;
      return errorResponse(error.code, error.message, statusByCode[error.code]);
    }
    console.error("Unexpected item analysis failure.", error);
    return errorResponse(
      "ANALYSIS_FAILED",
      "写真を分析できませんでした。時間をおいて再度お試しください。",
      500,
    );
  }
}
