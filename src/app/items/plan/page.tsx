import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeader } from "../../../components/account/AccountHeader";
import { MovePlanPageClient } from "../../../components/inventory/MovePlanPageClient";
import {
  isMovePlanMigrationError,
  loadMovePlanSource,
} from "../../../server/move-plan-data";
import {
  MovePlanSchema,
  buildMovePlanItems,
} from "../../../server/move-plan";
import { getSupabaseServerClient, requirePageUser } from "../../../lib/supabase/server";

export const metadata: Metadata = { title: "引っ越し整理プラン" };

export default async function MovePlanPage() {
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("プロフィールを読み込めませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  let source: Awaited<ReturnType<typeof loadMovePlanSource>>;
  try {
    source = await loadMovePlanSource(supabase, user.id);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("引っ越しプランの情報を読み込めませんでした。");
  }

  const [{ data: itemRows, error: itemsError }, { data: planRows, error: plansError }] =
    await Promise.all([
      supabase
        .from("user_items")
        .select("id, image_path, name, category, status")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true }),
      supabase
        .from("handling_plans")
        .select("item_id, selected_action, handling_guide")
        .eq("user_id", user.id),
    ]);
  if (itemsError || plansError) {
    console.error("Could not load move plan inventory cards.", {
      itemsCode: itemsError?.code ?? null,
      plansCode: plansError?.code ?? null,
    });
    if (
      (itemsError && isMovePlanMigrationError(itemsError)) ||
      (plansError && isMovePlanMigrationError(plansError))
    ) {
      throw new Error("引っ越しプランのデータベース migration を適用してください。");
    }
    throw new Error("持ち物一覧を読み込めませんでした。");
  }

  const { data: loadedPlan, error: storedPlanError } = await supabase
    .from("user_move_plans")
    .select("input_hash, plan_data, generated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  let storedPlan = loadedPlan;
  let generationAvailable = true;
  if (storedPlanError) {
    if (isMovePlanMigrationError(storedPlanError)) {
      generationAvailable = false;
      storedPlan = null;
      console.warn("Move plan storage migration is not applied yet.", {
        code: storedPlanError.code ?? "UNKNOWN",
      });
    } else {
      console.error("Could not load the saved move plan.", {
        code: storedPlanError.code ?? "UNKNOWN",
      });
      throw new Error("保存済みの引っ越しプランを読み込めませんでした。");
    }
  }
  const savedPlan = storedPlan?.plan_data
    ? MovePlanSchema.safeParse(storedPlan.plan_data)
    : null;
  if (savedPlan && !savedPlan.success) {
    console.error("Saved move plan failed schema validation.", {
      issueCount: savedPlan.error.issues.length,
    });
    throw new Error("保存済みの引っ越しプランを読み取れませんでした。");
  }

  const validPlans = buildMovePlanItems(
    (itemRows ?? []) as Array<Record<string, unknown>>,
    (planRows ?? []) as Array<Record<string, unknown>>,
  );
  const validPlansById = new Map(validPlans.map((item) => [item.id, item]));
  const cards = await Promise.all(
    (itemRows ?? []).map(async (item) => {
      const { data: image, error } = await supabase.storage
        .from("item-images")
        .createSignedUrl(item.image_path, 60 * 60);
      if (error || !image) {
        console.error("Could not create a move plan item photo URL.", {
          errorType: error?.name ?? null,
        });
        throw new Error("持ち物の写真を読み込めませんでした。");
      }
      const plan = validPlansById.get(item.id);
      return {
        id: item.id,
        imageUrl: image.signedUrl,
        name: plan?.name ?? item.name ?? "名前未確認",
        action: plan?.action ?? null,
        status: item.status as "pending" | "in_progress" | "completed",
      };
    }),
  );

  return (
    <main className="inventory-stage move-plan-stage">
      <AccountHeader />
      <MovePlanPageClient
        movingDate={source.movingDate}
        selectedItemCount={source.items.length}
        totalItemCount={source.totalItems}
        completedItemCount={source.completedItems}
        items={cards}
        plan={savedPlan?.success ? savedPlan.data : null}
        isStale={
          Boolean(savedPlan?.success) &&
          storedPlan?.input_hash !== source.inputHash
        }
        generatedAt={storedPlan?.generated_at ?? null}
        generationAvailable={generationAvailable}
      />
    </main>
  );
}
