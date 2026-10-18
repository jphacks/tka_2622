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

export interface MovePlanSnapshot {
  source: MovePlanSource;
  itemRows: Array<{
    id: string;
    image_path: string;
    name: string | null;
    category: string | null;
    status: string;
  }>;
  onboardingCompleted: boolean;
}

export function createMovePlanSource(
  itemRows: Array<Record<string, unknown>>,
  planRows: Array<Record<string, unknown>>,
  selectedStationId: string | null,
  movingDate: string | null,
): MovePlanSource {
  const items = buildMovePlanItems(itemRows, planRows);
  return {
    movingDate,
    selectedStationId,
    inputHash: hashMovePlanInput(items, selectedStationId),
    items,
    totalItems: itemRows.length,
    completedItems: itemRows.filter((item) => item.status === "completed").length,
  };
}

export async function loadMovePlanSnapshot(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<MovePlanSnapshot> {
  const [profileResult, movingDateResult, itemsResult, plansResult] = await Promise.all([
    supabase
      .from("user_profiles")
      .select("nearest_station_id, onboarding_completed")
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

  const itemRows = (itemsResult.data ?? []) as MovePlanSnapshot["itemRows"];
  const planRows = (plansResult.data ?? []) as Array<Record<string, unknown>>;
  const selectedStationId = profileResult.data?.nearest_station_id ?? null;
  return {
    source: createMovePlanSource(
      itemRows,
      planRows,
      selectedStationId,
      movingDateResult.data?.moving_date ?? null,
    ),
    itemRows,
    onboardingCompleted: profileResult.data?.onboarding_completed ?? false,
  };
}

export async function loadMovePlanSource(
  supabase: SupabaseServerClient,
  userId: string,
): Promise<MovePlanSource> {
  const snapshot = await loadMovePlanSnapshot(supabase, userId);
  return snapshot.source;
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
