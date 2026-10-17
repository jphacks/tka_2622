import { validateImageFile } from "../../../lib/image-validation";
import { requireApiUser } from "../../../lib/supabase/server";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function GET(): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  const { data, error } = await auth.supabase
    .from("user_items")
    .select(
      "id, name, category, condition_grade, analysis_status, status, selected_action, created_at, handling_plans(selected_action)",
    )
    .eq("user_id", auth.user.id)
    .order("created_at", { ascending: false });
  if (error) {
    console.error("Could not load inventory items.", error);
    return Response.json(
      {
        error: {
          code: "ITEMS_LOAD_FAILED",
          message: "持ち物を取得できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }
  return Response.json({ items: data });
}

export async function POST(request: Request): Promise<Response> {
  const auth = await requireApiUser();
  if ("response" in auth) return auth.response;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      {
        error: {
          code: "INVALID_REQUEST",
          message: "画像を送信してください。",
        },
      },
      { status: 400 },
    );
  }

  const image = formData.get("image");
  if (image === null || typeof image === "string") {
    return Response.json(
      {
        error: {
          code: "INVALID_IMAGE",
          message: "画像ファイルを選択してください。",
        },
      },
      { status: 400 },
    );
  }

  const validationError = validateImageFile(image);
  if (validationError) {
    return Response.json(
      {
        error: { code: "INVALID_IMAGE", message: validationError },
      },
      { status: image.size > 5 * 1024 * 1024 ? 413 : 400 },
    );
  }

  const itemId = crypto.randomUUID();
  const imagePath = `${auth.user.id}/${itemId}/${crypto.randomUUID()}.${EXTENSIONS[image.type]}`;
  const { error: uploadError } = await auth.supabase.storage
    .from("item-images")
    .upload(imagePath, image, {
      contentType: image.type,
      cacheControl: "3600",
      upsert: false,
    });
  if (uploadError) {
    console.error("Could not upload a private item image.", uploadError);
    return Response.json(
      {
        error: {
          code: "IMAGE_UPLOAD_FAILED",
          message: "写真を安全に保存できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }

  const { data, error: insertError } = await auth.supabase
    .from("user_items")
    .insert({
      id: itemId,
      user_id: auth.user.id,
      image_path: imagePath,
      analysis_status: "pending",
      status: "pending",
    })
    .select("id, analysis_status, status, created_at")
    .single();
  if (insertError) {
    const { error: cleanupError } = await auth.supabase.storage
      .from("item-images")
      .remove([imagePath]);
    if (cleanupError) {
      console.error("Could not clean up the image after item creation failed.", {
        insertError,
        cleanupError,
      });
    }
    console.error("Could not create an inventory item.", insertError);
    return Response.json(
      {
        error: {
          code: "ITEM_CREATE_FAILED",
          message: "持ち物を保存できませんでした。時間をおいて再度お試しください。",
        },
      },
      { status: 503 },
    );
  }

  return Response.json({ item: data }, { status: 201 });
}
