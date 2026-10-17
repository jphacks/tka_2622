import { evaluateRules } from "../../../../server/rules/engine";
import { RuleInputSchema } from "../../../../server/rules/schemas";
import { SupabaseRuleServiceProvider } from "../../../../server/rules/providers/supabase-provider";

export async function POST(request: Request): Promise<Response> {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "リクエストを読み取れませんでした。",
        },
      },
      { status: 400 },
    );
  }

  const parsed = RuleInputSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "物品情報や整理方法を確認してください。",
        },
      },
      { status: 400 },
    );
  }

  try {
    const result = await evaluateRules(
      parsed.data,
      new SupabaseRuleServiceProvider(),
    );
    return Response.json(result);
  } catch (error) {
    return Response.json(
      {
        error: {
          code: "SERVICE_DIRECTORY_UNAVAILABLE",
          message:
            error instanceof Error
              ? error.message
              : "買取サービス情報を取得できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
}
