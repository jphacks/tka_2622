"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ImageUploader } from "../recognition/ImageUploader";

export function NewInventoryItemForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || saving) return;
    setSaving(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.set("image", file);
      const response = await fetch("/api/items", {
        method: "POST",
        body: formData,
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "持ち物を登録できませんでした。";
        throw new Error(message);
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("item" in payload) ||
        typeof payload.item !== "object" ||
        payload.item === null ||
        !("id" in payload.item) ||
        typeof payload.item.id !== "string"
      ) {
        throw new Error("登録した持ち物を確認できませんでした。");
      }
      router.push(`/items/${payload.item.id}`);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "持ち物を登録できませんでした。時間をおいて再度お試しください。",
      );
      setSaving(false);
    }
  }

  return (
    <section className="inventory-form-panel" aria-labelledby="new-item-title">
      <Link href="/items" className="inventory-back-link">← 持ち物一覧</Link>
      <h1 id="new-item-title">写真で持ち物を登録</h1>
      <p className="account-lead">
        写真は非公開で保存され、AIの分析に使用します。電話番号など個人情報が写らない写真を選んでください。
      </p>
      <form onSubmit={handleSubmit}>
        <ImageUploader file={file} onSelect={setFile} disabled={saving} />
        {error && (
          <p className="account-error" role="alert">{error}</p>
        )}
        <button className="account-primary" type="submit" disabled={!file || saving}>
          {saving ? "安全に保存しています…" : "持ち物を登録する"}
          {!saving && <span aria-hidden="true">→</span>}
        </button>
      </form>
      <p className="inventory-privacy-note">
        対応形式：JPEG・PNG・WebP、5MBまで。登録後にAI識別を自動で開始します。
      </p>
    </section>
  );
}
