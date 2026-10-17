import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

export async function getSupabaseServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY must be configured.",
    );
  }

  const cookieStore = await cookies();
  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Server Components cannot write cookies; proxy.ts persists refreshed tokens.
        }
      },
    },
  });
}

export async function requirePageUser(): Promise<User> {
  const supabase = await getSupabaseServerClient();
  let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    authResult = await supabase.auth.getUser();
  } catch (error) {
    console.error("Supabase session verification request failed.", error);
    throw new Error("認証サービスに接続できません。時間をおいて再度お試しください。");
  }
  const { data, error } = authResult;
  if (
    error &&
    error.status !== 401 &&
    error.name !== "AuthSessionMissingError"
  ) {
    throw new Error("認証サービスに接続できません。時間をおいて再度お試しください。");
  }
  if (!data.user) {
    redirect("/login");
  }
  return data.user;
}

export async function requireApiUser(): Promise<
  | { supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>; user: User }
  | { response: NextResponse }
> {
  let supabase: Awaited<ReturnType<typeof getSupabaseServerClient>>;
  try {
    supabase = await getSupabaseServerClient();
  } catch (error) {
    console.error("Supabase server client configuration failed.", error);
    return {
      response: NextResponse.json(
        {
          error: {
            code: "SERVER_CONFIGURATION_ERROR",
            message: "認証サービスを利用できません。管理者にお問い合わせください。",
          },
        },
        { status: 500 },
      ),
    };
  }

  let authResult: Awaited<ReturnType<typeof supabase.auth.getUser>>;
  try {
    authResult = await supabase.auth.getUser();
  } catch (error) {
    console.error("Supabase session verification request failed.", error);
    return {
      response: NextResponse.json(
        {
          error: {
            code: "AUTH_SERVICE_UNAVAILABLE",
            message: "認証を確認できません。時間をおいて再度お試しください。",
          },
        },
        { status: 503 },
      ),
    };
  }
  const { data, error } = authResult;
  if (
    error &&
    error.status !== 401 &&
    error.name !== "AuthSessionMissingError"
  ) {
    console.error("Supabase session verification failed.", error);
    return {
      response: NextResponse.json(
        {
          error: {
            code: "AUTH_SERVICE_UNAVAILABLE",
            message: "認証を確認できません。時間をおいて再度お試しください。",
          },
        },
        { status: 503 },
      ),
    };
  }
  if (!data.user) {
    return {
      response: NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "ログインしてください。",
          },
        },
        { status: 401 },
      ),
    };
  }
  return { supabase, user: data.user };
}
