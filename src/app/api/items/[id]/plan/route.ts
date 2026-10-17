import { z } from "zod";
import { evaluateRules } from "../../../../../server/rules/engine";
import { RuleResultSchema } from "../../../../../server/rules/schemas";
import { SupabaseRuleServiceProvider } from "../../../../../server/rules/providers/supabase-provider";
import { requireApiUser } from "../../../../../lib/supabase/server";

const PayloadSchema = z.object({
  selectedAction: z.enum(["sell", "give", "dispose", "keep"]),
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
    .select("id, name, category, condition_grade, observations, analysis_status")
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
    const result = RuleResultSchema.parse(
      await evaluateRules(
        {
          stationId: profile.nearest_station_id,
          item: {
            name: item.name,
            category: item.category,
            conditionGrade: item.condition_grade,
            observations: item.observations,
          },
          selectedAction: parsed.data.selectedAction,
        },
        new SupabaseRuleServiceProvider(),
      ),
    );
    const serviceReferences = {
      confirmed: result.services.items,
      osmCandidates: result.services.osmCandidates,
    };
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
