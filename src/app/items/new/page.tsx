import { NewInventoryItemForm } from "../../../components/inventory/NewInventoryItemForm";
import { Brand } from "../../../components/account/Brand";
import {
  getSupabaseServerClient,
  requirePageUser,
} from "../../../lib/supabase/server";
import { redirect } from "next/navigation";

export default async function NewItemPage() {
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("プロフィールを確認できませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  return (
    <main className="inventory-stage inventory-form-stage">
      <a className="account-wordmark" href="/items" aria-label="持ち物一覧に戻る">
        <Brand />
      </a>
      <NewInventoryItemForm />
    </main>
  );
}
