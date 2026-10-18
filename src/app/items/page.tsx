import type { Metadata } from "next";
import { after } from "next/server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AccountHeader } from "../../components/account/AccountHeader";
import { InventoryCollection } from "../../components/inventory/InventoryCollection";
import {
  getSupabaseServerClient,
  requirePageUser,
} from "../../lib/supabase/server";
import {
  createMovePlanSource,
  isMovePlanMigrationError,
} from "../../server/move-plan-data";
import { mapSignedImageUrls } from "../../lib/supabase/signed-image-urls";
import {
  isServerPerformanceLoggingEnabled,
  logServerPerformance,
  measureServerOperation,
} from "../../lib/server-performance";
import { AnalyzeResponseSchema } from "../../types/recognition";

export const metadata: Metadata = { title: "持ち物一覧" };

export default async function ItemsPage() {
  const routeStartedAt = performance.now();
  const loggingEnabled = isServerPerformanceLoggingEnabled();
  const requestId = loggingEnabled
    ? (await headers()).get("x-performance-request-id") ?? undefined
    : undefined;
  const traceFields = { request_id: requestId };
  if (loggingEnabled) {
    logServerPerformance("items.request_started", {
      ...traceFields,
      node_process_uptime_ms: Number((process.uptime() * 1000).toFixed(1)),
      runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    });
    after(() => {
      logServerPerformance("items.response_completed", {
        ...traceFields,
        duration_ms: Number((performance.now() - routeStartedAt).toFixed(1)),
      });
    });
  }

  const user = await measureServerOperation(
    "items.auth.require_page_user",
    () => requirePageUser({ performanceRequestId: requestId }),
    traceFields,
  );
  const supabase = await measureServerOperation(
    "items.supabase.client_for_queries",
    () => getSupabaseServerClient(),
    traceFields,
  );
  const [
    { data: profile, error: profileError },
    movingDateResult,
    { data: items, error },
    { data: savedMovePlan, error: savedMovePlanError },
  ] = await measureServerOperation(
    "items.db.parallel_query_group",
    () =>
      Promise.all([
        measureServerOperation(
          "items.db.profile_onboarding",
          async () =>
            await supabase
              .from("user_profiles")
              .select("onboarding_completed, nearest_station_id")
              .eq("user_id", user.id)
              .maybeSingle(),
          traceFields,
        ),
        measureServerOperation(
          "items.db.profile_moving_date",
          async () =>
            await supabase
              .from("user_profiles")
              .select("moving_date")
              .eq("user_id", user.id)
              .maybeSingle(),
          traceFields,
        ),
        measureServerOperation(
          "items.db.inventory_with_handling_plans",
          async () =>
            await supabase
              .from("user_items")
              .select(
                "id, image_path, name, category, recognition_result, analysis_status, status, selected_action, handling_plans(item_id, selected_action, handling_guide)",
              )
              .eq("user_id", user.id)
              .order("created_at", { ascending: false }),
          traceFields,
        ),
        measureServerOperation(
          "items.db.saved_move_plan",
          async () =>
            await supabase
              .from("user_move_plans")
              .select("input_hash")
              .eq("user_id", user.id)
              .maybeSingle(),
          traceFields,
        ),
      ]),
    traceFields,
  );
  if (profileError) throw new Error("プロフィールを読み込めませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");
  if (error) throw new Error("持ち物一覧を読み込めませんでした。");
  if (
    movingDateResult.error &&
    !isMovePlanMigrationError(movingDateResult.error)
  ) {
    console.error("Could not load the move plan source.", {
      movingDateCode: movingDateResult.error.code ?? null,
    });
    throw new Error("引っ越しプランに必要な持ち物情報を読み込めませんでした。");
  }
  if (
    savedMovePlanError &&
    !isMovePlanMigrationError(savedMovePlanError)
  ) {
    console.error("Could not check the saved move plan status.", {
      code: savedMovePlanError.code ?? "UNKNOWN",
    });
    throw new Error("引っ越しプランの状態を読み込めませんでした。");
  }

  const dataTransformStartedAt = performance.now();
  const itemRows = items.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    status: item.status,
  }));
  const planRows = items.flatMap((item) => {
    const relatedPlans = item.handling_plans;
    if (!relatedPlans) return [];
    const plans = Array.isArray(relatedPlans) ? relatedPlans : [relatedPlans];
    return plans.map((plan) => ({ ...plan, item_id: item.id }));
  });
  const movePlanSource = createMovePlanSource(
    itemRows,
    planRows,
    profile.nearest_station_id ?? null,
    movingDateResult.data?.moving_date ?? null,
  );
  logServerPerformance("items.data_mapping_elapsed", {
    ...traceFields,
    duration_ms: Number(
      (performance.now() - dataTransformStartedAt).toFixed(1),
    ),
  });

  let signedImageByPath = new Map<string, string>();
  if (items.length > 0) {
    const { data: signedImages, error: signedImagesError } =
      await measureServerOperation(
        "items.storage.signed_urls",
        () =>
          supabase.storage
            .from("item-images")
            .createSignedUrls(
              items.map((item) => item.image_path),
              60 * 60,
            ),
        traceFields,
      );
    if (signedImagesError || !signedImages) {
      console.error(
        "Could not create private inventory image URLs.",
        signedImagesError,
      );
      throw new Error("持ち物の写真を読み込めませんでした。");
    }
    const mappedImages = mapSignedImageUrls(
      items.map((item) => item.image_path),
      signedImages,
    );
    if (!mappedImages.success) {
      console.error("Could not create private inventory image URLs.", {
        reason: mappedImages.reason,
      });
      throw new Error("持ち物の写真を読み込めませんでした。");
    }
    signedImageByPath = mappedImages.urlsByPath;
  }

  const viewModelStartedAt = performance.now();
  const inventoryItems = items.map((item) => {
    const image = signedImageByPath.get(item.image_path);
    if (!image) {
      console.error("Could not create a private inventory image URL.", {
        reason: "SIGNED_URL_MISSING",
      });
      throw new Error("持ち物の写真を読み込めませんでした。");
    }
    const recognition = item.recognition_result
      ? AnalyzeResponseSchema.safeParse(item.recognition_result)
      : null;
    if (recognition && !recognition.success) {
      console.error("Inventory recognition snapshot is invalid.", {
        reason: "stored_schema_validation_failed",
        issueCount: recognition.error.issues.length,
      });
    }
    return {
      id: item.id,
      name:
        item.name ??
        (recognition?.success ? recognition.data.item.name : null),
      analysisStatus: item.analysis_status,
      status: item.status,
      selectedAction: item.selected_action,
      imageUrl: image,
    };
  });
  const hasSavedMovePlan = Boolean(savedMovePlan?.input_hash);
  const movePlanNeedsUpdate =
    hasSavedMovePlan && savedMovePlan?.input_hash !== movePlanSource.inputHash;
  logServerPerformance("items.item_view_model_elapsed", {
    ...traceFields,
    duration_ms: Number(
      (performance.now() - viewModelStartedAt).toFixed(1),
    ),
  });
  logServerPerformance("items.data_preparation_completed", {
    ...traceFields,
    duration_ms: Number((performance.now() - routeStartedAt).toFixed(1)),
  });

  return (
    <main className="inventory-stage inventory-list-stage">
      <AccountHeader />
      <InventoryCollection
        items={inventoryItems}
        movePlan={{
          movingDate: movePlanSource.movingDate,
          totalItemCount: movePlanSource.totalItems,
          selectedItemCount: movePlanSource.items.length,
          completedItemCount: movePlanSource.completedItems,
          hasPlan: hasSavedMovePlan,
          needsUpdate: movePlanNeedsUpdate,
        }}
      />
    </main>
  );
}
