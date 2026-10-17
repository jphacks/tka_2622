import { notFound, redirect } from "next/navigation";
import { AccountHeader } from "../../../components/account/AccountHeader";
import { InventoryItemFlow } from "../../../components/inventory/InventoryItemFlow";
import { AnalyzeResponseSchema } from "../../../types/recognition";
import { RuleResultSchema } from "../../../server/rules/schemas";
import {
  getSupabaseServerClient,
  requirePageUser,
} from "../../../lib/supabase/server";

export default async function InventoryItemPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("プロフィールを確認できませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { data: item, error } = await supabase
    .from("user_items")
    .select(
      "id, image_path, name, category, condition_grade, observations, recognition_result, recommended_action, recommendation_reason, selected_action, analysis_status, status, updated_at",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("持ち物を読み込めませんでした。");
  if (!item) notFound();

  const { data: signedImage, error: imageError } = await supabase.storage
    .from("item-images")
    .createSignedUrl(item.image_path, 60 * 60);
  if (imageError || !signedImage) {
    console.error("Could not create a private item image URL.", imageError);
    throw new Error("写真を読み込めませんでした。");
  }

  const { data: plan, error: planError } = await supabase
    .from("handling_plans")
    .select("selected_action, handling_guide")
    .eq("item_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (planError) throw new Error("整理プランを読み込めませんでした。");
  const savedResult = plan
    ? RuleResultSchema.safeParse(plan.handling_guide)
    : null;
  if (savedResult && !savedResult.success) {
    throw new Error("保存済みの整理プランを読み取れませんでした。");
  }
  const recognition = item.recognition_result
    ? AnalyzeResponseSchema.safeParse(item.recognition_result)
    : null;
  if (
    item.analysis_status === "succeeded" &&
    (!recognition || !recognition.success)
  ) {
    throw new Error("保存済みのAI分析結果を読み取れませんでした。");
  }

  return (
    <main className="inventory-stage">
      <AccountHeader />
      <InventoryItemFlow
        initialItem={{
          id: item.id,
          imageUrl: signedImage.signedUrl,
          name: item.name,
          category: item.category,
          conditionGrade: item.condition_grade,
          observations: item.observations,
          recommendedAction: item.recommended_action,
          recommendationReason: item.recommendation_reason,
          selectedAction: item.selected_action,
          analysisStatus: item.analysis_status,
          status: item.status,
          updatedAt: item.updated_at,
        }}
        initialRecognition={recognition?.success ? recognition.data : null}
        initialResult={savedResult?.success ? savedResult.data : null}
      />
    </main>
  );
}
