import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AccountHeader } from "../../../components/account/AccountHeader";
import { MovePlanPageClient } from "../../../components/inventory/MovePlanPageClient";
import {
  isMovePlanMigrationError,
  loadMovePlanSnapshot,
} from "../../../server/move-plan-data";
import { MovePlanSchema } from "../../../server/move-plan";
import { getSupabaseServerClient, requirePageUser } from "../../../lib/supabase/server";
import { mapSignedImageUrls } from "../../../lib/supabase/signed-image-urls";

export const metadata: Metadata = { title: "引っ越し整理プラン" };

export default async function MovePlanPage() {
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const storedPlanQuery = supabase
    .from("user_move_plans")
    .select("input_hash, plan_data, generated_at")
    .eq("user_id", user.id)
    .maybeSingle();
  let snapshot: Awaited<ReturnType<typeof loadMovePlanSnapshot>>;
  let storedPlanResult: Awaited<typeof storedPlanQuery>;
  try {
    [snapshot, storedPlanResult] = await Promise.all([
      loadMovePlanSnapshot(supabase, user.id),
      storedPlanQuery,
    ]);
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error("引っ越しプランの情報を読み込めませんでした。");
  }
  if (!snapshot.onboardingCompleted) redirect("/onboarding");

  const { source, itemRows } = snapshot;
  const { data: loadedPlan, error: storedPlanError } = storedPlanResult;
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

  const validPlansById = new Map(source.items.map((item) => [item.id, item]));
  let signedImageByPath = new Map<string, string>();
  if (itemRows.length > 0) {
    const { data: signedImages, error: signedImagesError } = await supabase.storage
      .from("item-images")
      .createSignedUrls(
        itemRows.map((item) => item.image_path),
        60 * 60,
      );
    if (signedImagesError || !signedImages) {
      console.error("Could not create move plan item photo URLs.", {
        errorType: signedImagesError?.name ?? null,
      });
      throw new Error("持ち物の写真を読み込めませんでした。");
    }
    const mappedImages = mapSignedImageUrls(
      itemRows.map((item) => item.image_path),
      signedImages,
    );
    if (!mappedImages.success) {
      console.error("Could not create move plan item photo URLs.", {
        reason: mappedImages.reason,
      });
      throw new Error("持ち物の写真を読み込めませんでした。");
    }
    signedImageByPath = mappedImages.urlsByPath;
  }
  const cards = itemRows.map((item) => {
    const image = signedImageByPath.get(item.image_path);
    if (!image) {
      console.error("Could not create a move plan item photo URL.", {
        reason: "SIGNED_URL_MISSING",
      });
      throw new Error("持ち物の写真を読み込めませんでした。");
    }
    const plan = validPlansById.get(item.id);
    return {
      id: item.id,
      imageUrl: image,
      name: plan?.name ?? item.name ?? "名前未確認",
      action: plan?.action ?? null,
      status: item.status as "pending" | "in_progress" | "completed",
    };
  });

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
