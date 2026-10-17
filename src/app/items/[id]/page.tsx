import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { AccountHeader } from "../../../components/account/AccountHeader";
import { InventoryItemFlow } from "../../../components/inventory/InventoryItemFlow";
import { ActionSchema, AnalyzeResponseSchema } from "../../../types/recognition";
import { RuleResultSchema } from "../../../server/rules/schemas";
import {
  getSupabaseServerClient,
  requirePageUser,
} from "../../../lib/supabase/server";

export const metadata: Metadata = { title: "持ち物詳細" };

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
      "id, image_path, name, category, condition_grade, observations, recognition_result, recommended_action, recommendation_reason, selected_action, analysis_status, status, created_at, updated_at",
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

  const { data: handlingPlan, error: planError } = await supabase
    .from("handling_plans")
    .select("selected_action, handling_guide")
    .eq("item_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (planError) throw new Error("整理プランを読み込めませんでした。");
  const savedResult = handlingPlan
    ? RuleResultSchema.safeParse(handlingPlan.handling_guide)
    : null;
  if (savedResult && !savedResult.success) {
    throw new Error("保存済みの整理プランを読み取れませんでした。");
  }
  if (
    handlingPlan &&
    savedResult?.success &&
    handlingPlan.selected_action !== savedResult.data.selectedAction
  ) {
    throw new Error("保存済みの整理方法と手順が一致しません。");
  }
  const savedAction = handlingPlan
    ? ActionSchema.parse(handlingPlan.selected_action)
    : item.selected_action
      ? ActionSchema.parse(item.selected_action)
      : null;

  const recognition = item.recognition_result
    ? AnalyzeResponseSchema.safeParse(item.recognition_result)
    : null;
  if (
    item.analysis_status === "succeeded" &&
    (!recognition || !recognition.success)
  ) {
    throw new Error("保存済みのAI分析結果を読み取れませんでした。");
  }
  const recognizedItem = recognition?.success ? recognition.data.item : null;

  return (
    <main className="inventory-stage inventory-detail-stage">
      <AccountHeader />
      <InventoryItemFlow
        initialItem={{
          id: item.id,
          imageUrl: signedImage.signedUrl,
          name: item.name ?? recognizedItem?.name ?? null,
          category: item.category ?? recognizedItem?.category ?? null,
          conditionGrade:
            item.condition_grade ?? recognizedItem?.condition.grade ?? null,
          analysisStatus: item.analysis_status,
          status: item.status,
          capturedAt: item.created_at,
        }}
        initialRecognition={recognition?.success ? recognition.data : null}
        initialSelectedAction={savedAction}
        initialResult={savedResult?.success ? savedResult.data : null}
      />
    </main>
  );
}
