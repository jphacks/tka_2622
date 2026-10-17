"use client";

import { useEffect, useId, useState } from "react";

interface ImageUploaderProps {
  file: File | null;
  onSelect: (file: File | null) => void;
  disabled?: boolean;
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="8" y="9" width="32" height="30" rx="3" />
      <circle cx="18" cy="19" r="3" />
      <path d="m10 35 11-11 7 7 5-5 5 5" />
    </svg>
  );
}

function FolderIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M3.5 9.5h9l2.7 3H28l-2.4 12H5.2L3.5 9.5Z" />
      <path d="M5 9.5V6.8h7l2.4 2.7" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M5 10.5h5l2-3h8l2 3h5v14H5v-14Z" />
      <circle cx="16" cy="17" r="5" />
    </svg>
  );
}

export function ImageUploader({
  file,
  onSelect,
  disabled = false,
}: ImageUploaderProps) {
  const galleryInputId = useId();
  const cameraInputId = useId();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = event.currentTarget.files?.[0];
    if (selectedFile) onSelect(selectedFile);
    event.currentTarget.value = "";
  }

  return (
    <section className="home-uploader" aria-labelledby="upload-title">
      <div className={`home-dropzone${previewUrl ? " has-preview" : ""}`}>
        {previewUrl ? (
          <div className="home-preview">
            <img src={previewUrl} alt="選択した写真のプレビュー" />
            <div className="home-preview-copy">
              <span>選択した写真</span>
              <strong>{file?.name}</strong>
            </div>
            <button
              type="button"
              className="home-remove-photo"
              onClick={() => onSelect(null)}
              disabled={disabled}
            >
              削除
            </button>
          </div>
        ) : (
          <label className="home-upload-surface" htmlFor={galleryInputId}>
            <span className="home-upload-icon">
              <ImageIcon />
            </span>
            <strong id="upload-title">写真をアップロード</strong>
            <span>JPG・PNG・WebP ／ 5MBまで</span>
          </label>
        )}
      </div>

      <input
        className="visually-hidden-input"
        id={galleryInputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        disabled={disabled}
      />
      <input
        className="visually-hidden-input"
        id={cameraInputId}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleChange}
        disabled={disabled}
      />

      {!previewUrl && (
        <div className="home-upload-actions">
          <label
            className={`home-photo-button${disabled ? " is-disabled" : ""}`}
            htmlFor={galleryInputId}
          >
            <FolderIcon />
            <span>写真を選ぶ</span>
          </label>
          <label
            className={`home-camera-button${disabled ? " is-disabled" : ""}`}
            htmlFor={cameraInputId}
          >
            <CameraIcon />
            <span>
              <strong>カメラで撮影</strong>
              <small>今すぐアイテムを撮る</small>
            </span>
            <span aria-hidden="true">›</span>
          </label>
        </div>
      )}

      {previewUrl && (
        <div className="home-change-actions">
          <label htmlFor={galleryInputId}>別の写真を選ぶ</label>
          <label htmlFor={cameraInputId}>撮り直す</label>
        </div>
      )}
    </section>
  );
}
