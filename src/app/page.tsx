import { redirect } from "next/navigation";
import { getSupabaseServerClient } from "../lib/supabase/server";

export default async function HomePage() {
  const supabase = await getSupabaseServerClient();
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    console.error("Could not read the local session for home navigation.", {
      name: error.name,
      status: error.status,
      code: error.code,
    });
    redirect("/login");
  }
  redirect(data.session ? "/items" : "/login");
}
