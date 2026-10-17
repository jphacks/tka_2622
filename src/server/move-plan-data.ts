import type { getSupabaseServerClient } from "../lib/supabase/server";
import { hashMovePlanInput, buildMovePlanItems, type MovePlanItem } from "./move-plan";

type SupabaseServerClient = Awaited<ReturnType<typeof getSupabaseServerClient>>;

export interface MovePlanSource {
  movingDate: string | null;
  selectedStationId: string | null;
  inputHash: string;
  items: MovePlanItem[];
  totalItems: number;
  completedItems: number;
}

export async function loadMovePlanSource(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<MovePlanSource> {
  const [profileResult, movingDateResult, itemsResult, plansResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("nearest_station_id")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_profiles")
      .select("moving_date")
      .eq("user_id", userId)
      .maybeSingle(),
    supabase
      .from("user_items")
      .select("id, name, category, status")
      .eq("user_id", userId)
      .order("created_at", { ascending: true }),
    supabase
      .from("handling_plans")
      .select("item_id, selected_action, handling_guide")
      .eq("user_id", userId),
  ]);
  if (
    profileResult.error ||
    (movingDateResult.error && !isMovePlanMigrationError(movingDateResult.error)) ||
    itemsResult.error ||
    plansResult.error
  ) {
    console.error("Could not load the move plan source.", {
      profileCode: profileResult.error?.code ?? null,
      movingDateCode: movingDateResult.error?.code ?? null,
      itemsCode: itemsResult.error?.code ?? null,
      plansCode: plansResult.error?.code ?? null,
    });
    throw new Error("引っ越しプランに必要な持ち物情報を読み込めませんでした。");
  }

  const items = buildMovePlanItems(
    (itemsResult.data ?? []) as Array<Record<string, unknown>>,
    (plansResult.data ?? []) as Array<Record<string, unknown>>,
  );
  const selectedStationId = profileResult.data?.nearest_station_id ?? null;
  return {
    movingDate: movingDateResult.data?.moving_date ?? null,
    selectedStationId,
    inputHash: hashMovePlanInput(items, selectedStationId),
    items,
    totalItems: itemsResult.data?.length ?? 0,
    completedItems:
      itemsResult.data?.filter((item) => item.status === "completed").length ?? 0,
  };
}

export function isMovePlanMigrationError(error: { code?: string }): boolean {
  return (
    error.code === "PGRST205" ||
    error.code === "PGRST204" ||
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST202"
  );
}
