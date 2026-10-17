import { NextResponse, type NextRequest } from "next/server";
import { updateProxySession } from "./src/lib/supabase/update-proxy-session";

export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isProtectedApi =
    pathname === "/api/profile" || pathname.startsWith("/api/items");
  let session: Awaited<ReturnType<typeof updateProxySession>>;

  try {
    session = await updateProxySession(request);
  } catch (error) {
    console.error("Supabase proxy session setup failed.", error);
    return isProtectedApi
      ? NextResponse.json(
          {
            error: {
              code: "AUTH_SERVICE_UNAVAILABLE",
              message: "認証サービスを利用できません。時間をおいて再度お試しください。",
            },
          },
          { status: 503 },
        )
      : new NextResponse("認証サービスを利用できません。", { status: 503 });
  }

  if (
    session.error &&
    session.error.name !== "AuthSessionMissingError"
  ) {
    console.error("Supabase proxy could not verify the session.", session.error);
    return isProtectedApi
      ? NextResponse.json(
          {
            error: {
              code: "AUTH_SERVICE_UNAVAILABLE",
              message: "認証を確認できません。時間をおいて再度お試しください。",
            },
          },
          { status: 503 },
        )
      : new NextResponse("認証を確認できません。", { status: 503 });
  }

  if (!session.claims?.sub) {
    if (isProtectedApi) {
      return NextResponse.json(
        {
          error: {
            code: "UNAUTHENTICATED",
            message: "ログインしてください。",
          },
        },
        { status: 401 },
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return session.response;
}

export const config = {
  matcher: [
    "/onboarding/:path*",
    "/settings/:path*",
    "/items/:path*",
    "/api/profile",
    "/api/items/:path*",
  ],
};
