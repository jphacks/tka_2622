import { redirect } from "next/navigation";
import { AccountHeader } from "../../components/account/AccountHeader";
import { InventoryCollection } from "../../components/inventory/InventoryCollection";
import {
  getSupabaseServerClient,
  requirePageUser,
} from "../../lib/supabase/server";
import { AnalyzeResponseSchema } from "../../types/recognition";

export default async function ItemsPage() {
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile, error: profileError } = await supabase
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (profileError) throw new Error("プロフィールを読み込めませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  const { data: items, error } = await supabase
    .from("user_items")
    .select(
      "id, image_path, name, recognition_result, analysis_status, status, selected_action",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) throw new Error("持ち物一覧を読み込めませんでした。");

  const inventoryItems = await Promise.all(
    items.map(async (item) => {
      const { data: image, error: imageError } = await supabase.storage
        .from("item-images")
        .createSignedUrl(item.image_path, 60 * 60);
      if (imageError || !image) {
        console.error("Could not create a private inventory image URL.", imageError);
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
        imageUrl: image.signedUrl,
      };
    }),
  );

  return (
    <main className="inventory-stage inventory-list-stage">
      <AccountHeader />
      <InventoryCollection items={inventoryItems} />
    </main>
  );
}
