import { redirect } from "next/navigation";
import { AccountHeader } from "../../components/account/AccountHeader";
import { OnboardingForm } from "../../components/account/OnboardingForm";
import {
  getSupabaseServerClient,
  requirePageUser,
} from "../../lib/supabase/server";

export default async function SettingsPage() {
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data: profile, error } = await supabase
    .from("user_profiles")
    .select("residence_type, nearest_station_id, onboarding_completed")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new Error("プロフィールを読み込めませんでした。");
  if (!profile?.onboarding_completed) redirect("/onboarding");

  return (
    <main className="inventory-stage">
      <AccountHeader />
      <OnboardingForm
        initialResidenceType={profile.residence_type}
        initialStationId={profile.nearest_station_id}
        isSettings
      />
    </main>
  );
}
