import { z } from "zod";
import { requireApiUser } from "../../../../lib/supabase/server";

const ItemIdSchema = z.string().uuid();
const ItemEditSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.enum([
    "furniture",
    "electronics",
    "books",
    "clothing",
    "bicycle",
    "household",
    "other",
  ]),
  conditionGrade: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
    z.null(),
  ]),
  observations: z.array(z.string().trim().min(1).max(300)).max(20),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!ItemIdSchema.safeParse(id).success) {
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
      {
        error: { code: "INVALID_REQUEST", message: "入力内容を読み取れませんでした。" },
      },
      { status: 400 },
    );
  }
  const parsed = ItemEditSchema.safeParse(payload);
  if (!parsed.success) {
    return Response.json(
      {
        error: {
          code: "INVALID_ITEM",
          message: "物品名、カテゴリ、状態を確認してください。",
        },
      },
      { status: 400 },
    );
  }

  const { data, error } = await auth.supabase
    .from("user_items")
    .update({
      name: parsed.data.name,
      category: parsed.data.category,
      condition_grade: parsed.data.conditionGrade,
      observations: parsed.data.observations,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .eq("analysis_status", "succeeded")
    .is("selected_action", null)
    .select(
      "id, name, category, condition_grade, observations, recognition_result, recommended_action, recommendation_reason, analysis_status, status, selected_action",
    )
    .maybeSingle();
  if (error) {
    console.error("Could not update an inventory item.", error);
    return Response.json(
      {
        error: {
          code: "ITEM_UPDATE_FAILED",
          message: "物品情報を保存できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
  if (!data) {
    return Response.json(
      {
        error: {
          code: "ITEM_NOT_EDITABLE",
          message: "分析が完了した持ち物のみ編集できます。",
        },
      },
      { status: 409 },
    );
  }
  return Response.json({ item: data });
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;
  const { id } = await context.params;
  if (!ItemIdSchema.safeParse(id).success) {
    return Response.json(
      { error: { code: "INVALID_ITEM_ID", message: "持ち物を確認できません。" } },
      { status: 400 },
    );
  }

  const { data: item, error: lookupError } = await auth.supabase
    .from("user_items")
    .select("id, image_path")
    .eq("id", id)
    .eq("user_id", auth.user.id)
    .maybeSingle();
  if (lookupError) {
    console.error("Could not find an inventory item for deletion.", lookupError);
    return Response.json(
      {
        error: {
          code: "ITEM_LOOKUP_FAILED",
          message: "持ち物を確認できませんでした。",
        },
      },
      { status: 503 },
    );
  }
  if (!item) {
    return Response.json(
      { error: { code: "ITEM_NOT_FOUND", message: "持ち物が見つかりません。" } },
      { status: 404 },
    );
  }

  const { data: imageBackup, error: backupError } = await auth.supabase.storage
    .from("item-images")
    .download(item.image_path);
  if (backupError || !imageBackup) {
    console.error("Could not back up the private image before deletion.", backupError);
    return Response.json(
      {
        error: {
          code: "IMAGE_DELETE_PREPARATION_FAILED",
          message: "写真を確認できないため、持ち物は削除されていません。",
        },
      },
      { status: 503 },
    );
  }

  const { error: removeError } = await auth.supabase.storage
    .from("item-images")
    .remove([item.image_path]);
  if (removeError) {
    console.error("Could not remove the private item image.", removeError);
    return Response.json(
      {
        error: {
          code: "IMAGE_DELETE_FAILED",
          message: "写真を削除できませんでした。持ち物は削除されていません。",
        },
      },
      { status: 503 },
    );
  }

  const { error: deleteError } = await auth.supabase
    .from("user_items")
    .delete()
    .eq("id", id)
    .eq("user_id", auth.user.id);
  if (deleteError) {
    console.error("Could not delete an inventory item after image cleanup.", deleteError);
    const { error: restoreError } = await auth.supabase.storage
      .from("item-images")
      .upload(item.image_path, imageBackup, {
        contentType: imageBackup.type || "application/octet-stream",
        cacheControl: "3600",
        upsert: true,
      });
    if (restoreError) {
      console.error("Could not restore the private image after item deletion failed.", {
        deleteError,
        restoreError,
      });
    }
    return Response.json(
      {
        error: {
          code: "ITEM_DELETE_FAILED",
          message: restoreError
            ? "持ち物の記録と写真を削除できませんでした。管理者にお問い合わせください。"
            : "持ち物を削除できませんでした。写真は復元済みです。",
        },
      },
      { status: 503 },
    );
  }
  return Response.json({ deleted: true });
}
