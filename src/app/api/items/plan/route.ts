import { z } from "zod";
import { requireApiUser } from "../../../../lib/supabase/server";
import type { getSupabaseServerClient } from "../../../../lib/supabase/server";
import {
  buildMovePlanPrompt,
  validateMovePlan,
  MovePlanSchema,
} from "../../../../server/move-plan";
import { isMovePlanMigrationError, loadMovePlanSource } from "../../../../server/move-plan-data";
import {
  generateMovePlanText,
  QwenTextServiceError,
} from "../../../../server/recognition/qwen-text-client";
import {
  logServerPerformance,
  measureServerOperation,
} from "../../../../lib/server-performance";

const ClaimSchema = z.object({
  cacheHit: z.boolean(),
  inProgress: z.boolean(),
  inputHash: z.string().nullable(),
  plan: z.unknown().nullable(),
  generatedAt: z.string().nullable(),
});
const DeletePlanSchema = z.object({
  deleted: z.boolean(),
  inProgress: z.boolean(),
});

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ error: { code, message } }, { status });
}

function missingPlanMigration() {
  return errorResponse(
    "MOVE_PLAN_MIGRATION_REQUIRED",
    "引っ越しプランのデータベース設定が必要です。管理者にお問い合わせください。",
    503,
  );
}

async function releaseGeneration(
  supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>,
  generationToken: string,
) {
  try {
    const { error } = await supabase.rpc(
      "release_user_move_plan_generation",
      { p_generation_token: generationToken },
    );
    if (error) {
      console.error("Could not release the move plan generation claim.", {
        code: error.code ?? "UNKNOWN",
      });
    }
  } catch (error) {
    console.error("Could not release the move plan generation claim.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
}

async function generateMovePlanResponse(
  requestId: string,
): Promise<Response> {
  const traceFields = { request_id: requestId };
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  let source: Awaited<ReturnType<typeof loadMovePlanSource>>;
  try {
    source = await measureServerOperation(
      "move_plan.source_load",
      () => loadMovePlanSource(auth.supabase, auth.user.id),
      traceFields,
    );
  } catch (error) {
    if (error instanceof Error) {
      console.error("Could not prepare the move plan source.", {
        errorType: error.name,
      });
    }
    return errorResponse(
      "MOVE_PLAN_SOURCE_UNAVAILABLE",
      "引っ越しプランに必要な情報を読み込めませんでした。",
      503,
    );
  }
  if (source.items.length === 0) {
    return errorResponse(
      "MOVE_PLAN_ITEMS_REQUIRED",
      "整理方法を保存した持ち物がまだありません。",
      409,
    );
  }

  const generationToken = crypto.randomUUID();
  const { data: claimData, error: claimError } = await measureServerOperation(
    "move_plan.generation_claim",
    async () =>
      await auth.supabase.rpc("claim_user_move_plan_generation", {
        p_input_hash: source.inputHash,
        p_generation_token: generationToken,
      }),
    traceFields,
  );
  if (claimError) {
    console.error("Could not claim move plan generation.", {
      code: claimError.code ?? "UNKNOWN",
    });
    return isMovePlanMigrationError(claimError)
      ? missingPlanMigration()
      : errorResponse(
          "MOVE_PLAN_CLAIM_FAILED",
          "プラン作成を開始できませんでした。時間をおいて再度お試しください。",
          503,
        );
  }
  const claim = ClaimSchema.safeParse(claimData);
  if (!claim.success) {
    console.error("Move plan generation claim returned an invalid shape.", {
      issueCount: claim.error.issues.length,
    });
    return errorResponse(
      "MOVE_PLAN_CLAIM_INVALID",
      "プラン作成の状態を確認できませんでした。",
      503,
    );
  }
  if (claim.data.inProgress) {
    return errorResponse(
      "MOVE_PLAN_GENERATION_IN_PROGRESS",
      "引っ越し整理プランを作成しています。完了までお待ちください。",
      409,
    );
  }
  if (claim.data.cacheHit) {
    const cachedPlan = MovePlanSchema.safeParse(claim.data.plan);
    if (!cachedPlan.success) {
      console.error("Saved move plan failed schema validation.", {
        issueCount: cachedPlan.error.issues.length,
      });
      return errorResponse(
        "MOVE_PLAN_CACHE_INVALID",
        "保存済みプランを読み取れませんでした。",
        500,
      );
    }
    return Response.json({
      plan: cachedPlan.data,
      generatedAt: claim.data.generatedAt,
      cached: true,
      movingDate: source.movingDate,
    });
  }

  try {
    const prompt = buildMovePlanPrompt(
      source.items,
      source.selectedStationId,
    );
    logServerPerformance("move_plan.prompt_prepared", {
      ...traceFields,
      item_count: source.items.length,
      prompt_bytes: new TextEncoder().encode(prompt).byteLength,
    });
    const generated = await measureServerOperation(
      "move_plan.ai_generation",
      () => generateMovePlanText(prompt),
      { ...traceFields, item_count: source.items.length },
    );
    const plan = validateMovePlan(generated, source.items);

    const latestSource = await measureServerOperation(
      "move_plan.source_recheck",
      () => loadMovePlanSource(auth.supabase, auth.user.id),
      traceFields,
    );
    if (latestSource.inputHash !== source.inputHash) {
      await releaseGeneration(auth.supabase, generationToken);
      return errorResponse(
        "MOVE_PLAN_SOURCE_CHANGED",
        "持ち物の整理方法が変更されました。もう一度プランを作成してください。",
        409,
      );
    }

    const { data: savedData, error: saveError } = await measureServerOperation(
      "move_plan.save_result",
      async () =>
        await auth.supabase.rpc("save_user_move_plan_generation", {
          p_input_hash: source.inputHash,
          p_generation_token: generationToken,
          p_plan_data: plan,
        }),
      traceFields,
    );
    if (saveError) {
      console.error("Could not save the generated move plan.", {
        code: saveError.code ?? "UNKNOWN",
      });
      await releaseGeneration(auth.supabase, generationToken);
      return isMovePlanMigrationError(saveError)
        ? missingPlanMigration()
        : errorResponse(
            "MOVE_PLAN_SAVE_FAILED",
            "整理プランを保存できませんでした。既存のプランは保持されています。",
            503,
          );
    }
    const saved = z
      .object({
        inputHash: z.string(),
        plan: MovePlanSchema,
        generatedAt: z.string(),
      })
      .safeParse(savedData);
    if (!saved.success || saved.data.inputHash !== source.inputHash) {
      console.error("Saved move plan RPC returned an invalid result.", {
        issueCount: saved.success ? 0 : saved.error.issues.length,
      });
      return errorResponse(
        "MOVE_PLAN_SAVE_INVALID",
        "保存した整理プランを確認できませんでした。",
        503,
      );
    }
    return Response.json({
      plan: saved.data.plan,
      generatedAt: saved.data.generatedAt,
      cached: false,
      movingDate: source.movingDate,
    });
  } catch (error) {
    await releaseGeneration(auth.supabase, generationToken);
    if (error instanceof QwenTextServiceError) {
      const status = {
        AI_TIMEOUT: 504,
        AI_UNAVAILABLE: 502,
        AI_RESPONSE_INVALID: 502,
        SERVER_CONFIG_ERROR: 500,
      }[error.code];
      console.error("Move plan text generation failed.", {
        code: error.code,
        status,
      });
      return errorResponse(error.code, error.message, status);
    }
    console.error("Generated move plan failed validation.", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return errorResponse(
      "MOVE_PLAN_RESPONSE_INVALID",
      "AIの整理プランを確認できませんでした。既存のプランは保持されています。",
      502,
    );
  }
}

export async function POST(): Promise<Response> {
  const requestId = crypto.randomUUID();
  return measureServerOperation(
    "move_plan.request_total",
    () => generateMovePlanResponse(requestId),
    { request_id: requestId },
  );
}

export async function DELETE(): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase.rpc(
    "delete_user_move_plan_generation",
  );
  if (error) {
    console.error("Could not delete the saved move plan.", {
      code: error.code ?? "UNKNOWN",
    });
    return isMovePlanMigrationError(error)
      ? missingPlanMigration()
      : errorResponse(
          "MOVE_PLAN_DELETE_FAILED",
          "保存済みのプランを削除できませんでした。時間をおいて再度お試しください。",
          503,
        );
  }

  const result = DeletePlanSchema.safeParse(data);
  if (!result.success) {
    console.error("Move plan deletion returned an invalid result.", {
      issueCount: result.error.issues.length,
    });
    return errorResponse(
      "MOVE_PLAN_DELETE_INVALID",
      "プランの削除結果を確認できませんでした。",
      503,
    );
  }
  if (result.data.inProgress) {
    return errorResponse(
      "MOVE_PLAN_GENERATION_IN_PROGRESS",
      "プランを作成中のため削除できません。完了後にもう一度お試しください。",
      409,
    );
  }

  return Response.json({ deleted: result.data.deleted });
}
