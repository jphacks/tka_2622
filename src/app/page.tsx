import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../lib/supabase/server";

export default async function HomePage() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (
    error &&
    error.status !== 401 &&
    error.name !== "AuthSessionMissingError"
  ) {
    throw new Error("認証サービスに接続できません。時間をおいて再度お試しください。");
  }
  redirect(data.user ? "/items" : "/login");
}
