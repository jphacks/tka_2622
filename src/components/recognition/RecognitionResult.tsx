"use client";

import { useEffect, useState } from "react";
import {
  ITEM_CATEGORIES,
  type ItemCategory,
  type RecognizedItem,
} from "../../types/recognition";

const CATEGORY_LABELS: Record<ItemCategory, string> = {
  furniture: "家具",
  electronics: "家電・電子機器",
  books: "本・教材",
  clothing: "衣類",
  bicycle: "自転車",
  household: "日用品",
  other: "その他",
};

const GRADES = [
  { value: 5, label: "非常に良い" },
  { value: 4, label: "良い" },
  { value: 3, label: "普通" },
  { value: 2, label: "悪い" },
  { value: 1, label: "非常に悪い" },
] as const;

interface RecognitionResultProps {
  item: RecognizedItem;
  photo?: File | null;
  photoUrl?: string | null;
  readOnly?: boolean;
  isEdited: boolean;
  isManualEntry: boolean;
  onEditPhoto?: () => void;
  onNameChange: (name: string) => void;
  onCategoryChange: (category: ItemCategory) => void;
  onGradeChange: (grade: RecognizedItem["condition"]["grade"]) => void;
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 3.5h7l4 4V21H7V3.5Z" />
      <path d="M14 3.5V8h4M10 12h5M10 16h5" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 20 4.1-1 10-10-3.1-3.1-10 10L4 20Z" />
      <path d="m13.8 7.1 3.1 3.1" />
    </svg>
  );
}

export function RecognitionResult({
  item,
  photo = null,
  photoUrl = null,
  readOnly = false,
  isEdited,
  isManualEntry,
  onEditPhoto,
  onNameChange,
  onCategoryChange,
  onGradeChange,
}: RecognitionResultProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const conditionLabel =
    item.condition.grade === null
      ? "判定できない"
      : GRADES.find(({ value }) => value === item.condition.grade)?.label;

  useEffect(() => {
    if (photo) {
      const url = URL.createObjectURL(photo);
      setPreviewUrl(url);
      return () => URL.revokeObjectURL(url);
    }
    setPreviewUrl(photoUrl);
  }, [photo, photoUrl]);

  return (
    <section className="recognition-confirmation" aria-labelledby="result-title">
      <div className="confirm-section-heading">
        <span className="confirm-step-badge">02</span>
        <div>
          <h1 id="result-title">
            {isManualEntry ? "物品情報を入力" : "認識結果を確認"}
          </h1>
          <p>写真から分かる範囲の外観評価です。内容を確認してください。</p>
        </div>
      </div>

      <div className="confirm-photo-row">
        {previewUrl && (
          <div className="confirm-photo-preview">
            <img src={previewUrl} alt="認識に使用した写真" />
            {onEditPhoto && (
              <button
                type="button"
                className="confirm-photo-remove"
                onClick={onEditPhoto}
                aria-label="写真を変更する"
              >
                ×
              </button>
            )}
          </div>
        )}
        {onEditPhoto && (
          <button
            type="button"
            className="confirm-photo-add"
            onClick={onEditPhoto}
          >
            <span className="confirm-photo-add-icon" aria-hidden="true">
              ＋
            </span>
            <strong>写真を追加</strong>
            <small>最大5枚まで</small>
          </button>
        )}
      </div>

      {isEdited && (
        <div className="confirm-edit-notice" role="status">
          情報を編集しました。おすすめ結果には編集内容が反映されない場合があります。
        </div>
      )}

      <div className="confirm-form-card">
        <label className="confirm-field confirm-name-field">
          <span>物品名</span>
          <span className="confirm-input-wrap">
            <input
              value={item.name}
              readOnly={readOnly}
              onChange={(event) => onNameChange(event.target.value)}
              maxLength={100}
              placeholder="例：木製デスク"
            />
            <EditIcon />
          </span>
        </label>
        <div className="confirm-select-grid">
          <label className="confirm-field">
            <span>カテゴリ</span>
            <select
              value={item.category}
              disabled={readOnly}
              onChange={(event) =>
                onCategoryChange(event.target.value as ItemCategory)
              }
            >
              {ITEM_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {CATEGORY_LABELS[category]}
                </option>
              ))}
            </select>
          </label>
          <label className="confirm-field">
            <span>外観の状態</span>
            <select
              value={item.condition.grade ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                onGradeChange(
                  event.target.value === ""
                    ? null
                    : (Number(event.target.value) as 1 | 2 | 3 | 4 | 5),
                )
              }
            >
              <option value="">判定できない</option>
              {GRADES.map(({ value, label }) => (
                <option key={value} value={value}>
                  {value} — {label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div
        className={`confirm-condition-card grade-${item.condition.grade ?? 0}`}
      >
        <div
          className="confirm-condition-ring"
          aria-label={`外観評価：${conditionLabel}`}
        >
          <svg viewBox="0 0 84 84" aria-hidden="true">
            <circle className="confirm-ring-track" cx="42" cy="42" r="36" />
            <circle
              className="confirm-ring-value"
              cx="42"
              cy="42"
              r="36"
              strokeDasharray="226.2"
              strokeDashoffset={
                item.condition.grade === null
                  ? 226.2
                  : 226.2 * (1 - item.condition.grade / 5)
              }
            />
          </svg>
          <span>{item.condition.grade ?? "?"}</span>
          <small>/5</small>
        </div>
        <div className="confirm-condition-copy">
          <strong>{conditionLabel}</strong>
          <p>写真から見た外観の目安です。</p>
        </div>
        <div className="confirm-condition-bars" aria-hidden="true">
          {[1, 2, 3, 4, 5].map((score) => (
            <span
              key={score}
              className={
                item.condition.grade !== null && score <= item.condition.grade
                  ? "is-active"
                  : ""
              }
            />
          ))}
        </div>
      </div>

      <div className="confirm-observation-card">
        <h2>
          <DocumentIcon />
          写真で見えること
        </h2>
        {item.condition.observations.length > 0 ? (
          <ul>
            {item.condition.observations.map((observation, index) => (
              <li key={`${observation}-${index}`}>{observation}</li>
            ))}
          </ul>
        ) : (
          <p>写真から確認できる特徴はありません。</p>
        )}
      </div>

      <p className="confirm-caution">
        <span aria-hidden="true">!</span>
        写真だけでは判断できない点があります。状態を確認してください。
      </p>
    </section>
  );
}
