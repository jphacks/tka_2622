import { z } from "zod";
import { evaluateRules } from "../../../../../server/rules/engine";
import { RuleResultSchema } from "../../../../../server/rules/schemas";
import { SupabaseRuleServiceProvider } from "../../../../../server/rules/providers/supabase-provider";
import { requireApiUser } from "../../../../../lib/supabase/server";
import { isRecommendationCurrent } from "../../../../../lib/recognition-workflow";

const PayloadSchema = z.object({
  selectedAction: z.enum(["sell", "give", "dispose", "keep"]),
  stationId: z.string().trim().min(1).optional(),
  municipalityCode: z.string().regex(/^13\d{3}$/).optional(),
  disposalArea: z.string().trim().min(1).max(100).optional(),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json(
      { error: { code: "INVALID_ITEM_ID", message: "持ち物を確認できません。" } },
      { status: 400 },
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "整理方法を確認してください。" } },
      { status: 400 },
    );
  }
  const parsed = PayloadSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "INVALID_ACTION", message: "整理方法を選択してください。" } },
      { status: 400 },
    );
  }

  const { data: item, error: itemError } = await auth.supabase
    .from("user_items")
    .select(
      "id, name, category, condition_grade, observations, analysis_status, recommended_action, recommendation_reason, recognition_result",
    )
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (itemError) {
    console.error("Could not load the item for its handling plan.", itemError);
    return Response.json(
      { error: { code: "ITEM_LOAD_FAILED", message: "持ち物を読み込めませんでした。" } },
      { status: 503 },
    );
  }
  if (!item) {
    return Response.json(
      { error: { code: "ITEM_NOT_FOUND", message: "持ち物が見つかりません。" } },
      { status: 404 },
    );
  }
  if (
    item.analysis_status !== "succeeded" ||
    !item.name ||
    !item.category
  ) {
    return Response.json(
      {
        error: {
          code: "ITEM_NOT_ANALYZED",
          message: "分析が完了した持ち物から整理方法を選択してください。",
        },
      },
      { status: 409 },
    );
  }
  const recommendationIsCurrent = isRecommendationCurrent(
    item.recognition_result,
  );

  const { data: profile, error: profileError } = await auth.supabase
    .from("user_profiles")
    .select("nearest_station_id")
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (profileError) {
    console.error("Could not load the profile station.", profileError);
    return Response.json(
      {
        error: {
          code: "PROFILE_LOAD_FAILED",
          message: "最寄り駅を読み込めませんでした。",
        },
      },
      { status: 503 },
    );
  }
  if (!profile?.nearest_station_id) {
    return Response.json(
      {
        error: {
          code: "ONBOARDING_REQUIRED",
          message: "持ち物を追加する前に、最寄り駅を設定してください。",
        },
      },
      { status: 409 },
    );
  }

  try {
    const serviceProvider = new SupabaseRuleServiceProvider();
    if (parsed.data.stationId) {
      const stations = await serviceProvider.getStations();
      if (!stations.some(({ id }) => id === parsed.data.stationId)) {
        return Response.json(
          {
            error: {
              code: "INVALID_STATION",
              message: "駅の選択内容を確認してください。",
            },
          },
          { status: 400 },
        );
      }
    }
    const result = RuleResultSchema.parse(
      await evaluateRules(
        {
          stationId: parsed.data.stationId ?? profile.nearest_station_id,
          item: {
            name: item.name,
            category: item.category,
            conditionGrade: item.condition_grade,
            observations: item.observations,
          },
          aiRecommendedAction: recommendationIsCurrent
            ? item.recommended_action
            : null,
          aiRecommendationReason: recommendationIsCurrent
            ? item.recommendation_reason
            : undefined,
          selectedAction: parsed.data.selectedAction,
          municipalityCode: parsed.data.municipalityCode,
          disposalArea: parsed.data.disposalArea,
        },
        serviceProvider,
      ),
    );
    const serviceReferences = [
      ...result.services.items.map((service) => ({
        source: "confirmed_business" as const,
        id: service.id,
      })),
      ...result.services.osmCandidates.map((candidate) => ({
        source: "osm_candidate" as const,
        id: candidate.id,
      })),
    ];
    const { data: plan, error: saveError } = await auth.supabase.rpc(
      "save_user_item_handling_plan",
      {
        p_item_id: id,
        p_selected_action: parsed.data.selectedAction,
        p_handling_guide: result,
        p_service_references: serviceReferences,
      },
    );
    if (saveError) {
      console.error("Could not atomically save the handling plan.", saveError);
      return Response.json(
        {
          error: {
            code: "PLAN_SAVE_FAILED",
            message: "整理プランを保存できませんでした。時間をおいて再度お試しください。",
          },
        },
        { status: 503 },
      );
    }
    if (!plan || plan.selected_action !== parsed.data.selectedAction) {
      console.error("The handling plan RPC returned no matching saved plan.", {
        itemId: id,
        selectedAction: parsed.data.selectedAction,
      });
      return Response.json(
        {
          error: {
            code: "PLAN_SAVE_FAILED",
            message: "保存結果を確認できませんでした。時間をおいて再度お試しください。",
          },
        },
        { status: 503 },
      );
    }
    return Response.json({ result, plan });
  } catch (error) {
    console.error("Could not generate the handling plan.", error);
    return Response.json(
      {
        error: {
          code: "GUIDANCE_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "整理方法の案内を取得できませんでした。",
        },
      },
      { status: 503 },
    );
  }
}
