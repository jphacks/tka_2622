import { redirect } from "next/navigation";
import { OnboardingForm } from "../../components/account/OnboardingForm";
import { Brand } from "../../components/account/Brand";
import { requirePageUser, getSupabaseServerClient } from "../../lib/supabase/server";

export default async function OnboardingPage() {
  const user = await requirePageUser();
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase
    .from("user_profiles")
    .select(
      "residence_type, nearest_station_id, moving_date, onboarding_completed",
    )
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) {
    throw new Error("プロフィールを読み込めませんでした。");
  }
  if (data?.onboarding_completed) redirect("/items");

  return (
    <main className="account-stage onboarding-stage">
      <header className="account-header">
        <a className="account-wordmark" href="/" aria-label="ものさき。">
          <Brand />
        </a>
        <span className="account-header-note">はじめに</span>
      </header>
      <OnboardingForm
        initialResidenceType={data?.residence_type ?? null}
        initialStationId={data?.nearest_station_id ?? null}
        initialMovingDate={data?.moving_date ?? null}
      />
    </main>
  );
}
