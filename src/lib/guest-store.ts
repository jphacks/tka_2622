import { z } from "zod";
import { ActionSchema, AnalyzeResponseSchema } from "../types/recognition";
import { RuleResultSchema } from "../server/rules/schemas";

const GUEST_ITEMS_KEY = "monosaki.guest.items.v1";
const GUEST_MOVE_DATE_KEY = "monosaki.guest.moving-date.v1";
const GUEST_DATABASE = "monosaki-guest";
const GUEST_DATABASE_VERSION = 1;
const GUEST_PHOTOS_STORE = "photos";

export const GuestItemSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime(),
  analysis: AnalyzeResponseSchema,
  selectedAction: ActionSchema.nullable(),
  status: z.enum(["pending", "in_progress", "completed"]),
  guide: RuleResultSchema.nullable(),
});

export type GuestItem = z.infer<typeof GuestItemSchema>;

function openGuestDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("このブラウザーではローカル保存を利用できません。"));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(GUEST_DATABASE, GUEST_DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(GUEST_PHOTOS_STORE)) {
        request.result.createObjectStore(GUEST_PHOTOS_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("ゲスト用の写真保存領域を開けませんでした。"));
    request.onblocked = () =>
      reject(new Error("別のタブが保存領域を使用中です。タブを閉じて再度お試しください。"));
  });
}

function readItemsFromStorage(): GuestItem[] {
  const raw = window.localStorage.getItem(GUEST_ITEMS_KEY);
  if (raw === null) return [];

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("ブラウザーに保存されたゲストデータを読み取れませんでした。");
  }
  const parsed = z.array(GuestItemSchema).safeParse(value);
  if (!parsed.success) {
    throw new Error("ブラウザーに保存されたゲストデータの形式が正しくありません。");
  }
  return parsed.data;
}

function writeItemsToStorage(items: GuestItem[]) {
  const parsed = z.array(GuestItemSchema).safeParse(items);
  if (!parsed.success) {
    throw new Error("ゲストデータを保存できませんでした。");
  }
  try {
    window.localStorage.setItem(GUEST_ITEMS_KEY, JSON.stringify(parsed.data));
  } catch {
    throw new Error("ブラウザーの保存容量が不足しています。不要なデータを削除してください。");
  }
}

export function loadGuestItems(): GuestItem[] {
  return readItemsFromStorage();
}

export async function saveGuestItem(item: GuestItem, photo: Blob): Promise<void> {
  const database = await openGuestDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GUEST_PHOTOS_STORE, "readwrite");
      transaction.objectStore(GUEST_PHOTOS_STORE).put(photo, item.id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("写真をブラウザーに保存できませんでした。"));
      transaction.onabort = () =>
        reject(new Error("写真の保存が中断されました。"));
    });
  } finally {
    database.close();
  }

  try {
    writeItemsToStorage([item, ...readItemsFromStorage()]);
  } catch (error) {
    await deleteGuestPhoto(item.id);
    throw error;
  }
}

export function saveGuestItems(items: GuestItem[]): void {
  writeItemsToStorage(items);
}

export async function loadGuestPhoto(id: string): Promise<Blob | null> {
  const database = await openGuestDatabase();
  try {
    return await new Promise<Blob | null>((resolve, reject) => {
      const transaction = database.transaction(GUEST_PHOTOS_STORE, "readonly");
      const request = transaction.objectStore(GUEST_PHOTOS_STORE).get(id);
      request.onsuccess = () =>
        resolve(request.result instanceof Blob ? request.result : null);
      request.onerror = () =>
        reject(new Error("保存した写真を読み込めませんでした。"));
    });
  } finally {
    database.close();
  }
}

async function deleteGuestPhoto(id: string): Promise<void> {
  const database = await openGuestDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GUEST_PHOTOS_STORE, "readwrite");
      transaction.objectStore(GUEST_PHOTOS_STORE).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("写真の一時データを削除できませんでした。"));
    });
  } finally {
    database.close();
  }
}

export function loadGuestMovingDate(): string {
  return window.localStorage.getItem(GUEST_MOVE_DATE_KEY) ?? "";
}

export function saveGuestMovingDate(value: string): void {
  try {
    if (value) window.localStorage.setItem(GUEST_MOVE_DATE_KEY, value);
    else window.localStorage.removeItem(GUEST_MOVE_DATE_KEY);
  } catch {
    throw new Error("引っ越し予定日をブラウザーに保存できませんでした。");
  }
}

export async function clearGuestData(): Promise<void> {
  const database = await openGuestDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(GUEST_PHOTOS_STORE, "readwrite");
      transaction.objectStore(GUEST_PHOTOS_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(new Error("ゲストの写真データを削除できませんでした。"));
    });
  } finally {
    database.close();
  }
  window.localStorage.removeItem(GUEST_ITEMS_KEY);
  window.localStorage.removeItem(GUEST_MOVE_DATE_KEY);
}
