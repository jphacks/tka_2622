import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountHeader } from "../../../../components/account/AccountHeader";
import { InventoryConsultFlow } from "../../../../components/inventory/InventoryConsultFlow";
import { getSupabaseServerClient, requirePageUser } from "../../../../lib/supabase/server";
import { SupabaseRuleServiceProvider } from "../../../../server/rules/providers/supabase-provider";
import { refreshSavedPlanServices } from "../../../../server/rules/refresh-services";
import { refreshDisposalGuide } from "../../../../server/disposal/collection-schedule";
import { RuleResultSchema } from "../../../../server/rules/schemas";
import { AnalyzeResponseSchema, ActionSchema } from "../../../../types/recognition";

export const metadata: Metadata = { title: "AI相談・整理プラン" };

export default async function InventoryItemConsultPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("onboarding_completed, nearest_station_id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("プロフィールを確認できませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { data: item, error: itemError } = await supabase
    .from("user_items")
    .select(
      "id, image_path, name, category, condition_grade, observations, recognition_result, selected_action, analysis_status, status",
    )
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (itemError) throw new Error("持ち物を読み込めませんでした。");
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
  const parsedPlan = plan
    ? RuleResultSchema.safeParse(plan.handling_guide)
    : null;
  if (parsedPlan && !parsedPlan.success) {
    throw new Error("保存済みの整理プランを読み取れませんでした。");
  }
  if (
    plan &&
    parsedPlan?.success &&
    plan.selected_action !== parsedPlan.data.selectedAction
  ) {
    throw new Error("保存済みの整理方法と手順が一致しません。");
  }

  const refreshedResult = parsedPlan?.success
    ? await refreshSavedPlanServices(
        parsedPlan.data,
        new SupabaseRuleServiceProvider(),
      )
    : null;
  const savedResult = refreshedResult?.disposal
    ? {
        ...refreshedResult,
        disposal: await refreshDisposalGuide(refreshedResult.disposal),
      }
    : refreshedResult;

  const parsedRecognition = item.recognition_result
    ? AnalyzeResponseSchema.safeParse(item.recognition_result)
    : null;
  const recognition =
    item.analysis_status === "succeeded" && parsedRecognition?.success
      ? parsedRecognition.data
      : null;
  const selectedAction = plan
    ? ActionSchema.parse(plan.selected_action)
    : item.selected_action
      ? ActionSchema.parse(item.selected_action)
      : null;

  return (
    <main className="inventory-stage inventory-consult-stage">
      <AccountHeader />
      <InventoryConsultFlow
        initialItem={{
          id: item.id,
          imageUrl: signedImage.signedUrl,
          name: item.name,
          category: item.category,
          conditionGrade: item.condition_grade,
          observations: item.observations,
          analysisStatus: item.analysis_status,
          status: item.status,
          selectedAction,
        }}
        initialRecognition={recognition}
        initialResult={savedResult}
        nearestStationId={profile.nearest_station_id}
      />
    </main>
  );
}
