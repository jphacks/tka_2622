import { z } from "zod";
import { requireApiUser } from "../../../../../lib/supabase/server";

const StatusSchema = z.object({
  status: z.enum(["in_progress", "completed"]),
});

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json(
      { error: { code: "INVALID_ITEM_ID", message: "持ち物を確認できません。" } },
      { status: 400 },
    );
  }
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return Response.json(
      { error: { code: "INVALID_REQUEST", message: "状態を確認してください。" } },
      { status: 400 },
    );
  }
  const parsed = StatusSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      { error: { code: "INVALID_STATUS", message: "状態を確認してください。" } },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("user_items")
    .update({
      status: parsed.data.status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .not("selected_action", "is", null)
    .select("id, status")
    .maybeSingle();
  if (error) {
    console.error("Could not update the item completion state.", error);
    return Response.json(
      {
        error: {
          code: "ITEM_STATUS_UPDATE_FAILED",
          message: "進捗を保存できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
  if (!data) {
    return Response.json(
      {
        error: {
          code: "PLAN_NOT_FOUND",
          message: "整理プランを保存してから進捗を更新してください。",
        },
      },
      { status: 409 },
    );
  }
  return Response.json({ item: data });
}
