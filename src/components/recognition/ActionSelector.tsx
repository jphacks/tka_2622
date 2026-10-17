"use client";

import type { Action } from "../../types/recognition";

const ACTION_OPTIONS: {
  value: Action;
  label: string;
  description: string;
}[] = [
  {
    value: "keep",
    label: "保管する",
    description: "新居へ持っていき、使い続ける",
  },
  {
    value: "sell",
    label: "売る",
    description: "状態を確認して売却を検討する",
  },
  {
    value: "give",
    label: "譲る",
    description: "必要な人へ無償で譲る",
  },
  {
    value: "dispose",
    label: "処分する",
    description: "自治体のルールを確認して処分する",
  },
];

interface ActionSelectorProps {
  recommendation: Action | null;
  reason: string;
  recommendationStale: boolean;
  selectedAction: Action | null;
  onSelect: (action: Action) => void;
}

export function ActionSelector({
  recommendation,
  reason,
  recommendationStale,
  selectedAction,
  onSelect,
}: ActionSelectorProps) {
  const showRecommendation = recommendation !== null && !recommendationStale;
  const recommendationLabel =
    ACTION_OPTIONS.find(({ value }) => value === recommendation)?.label;

  return (
    <section className="action-card" aria-labelledby="action-title">
      <div className="section-heading">
        <span className="step-number">03</span>
        <div>
          <h2 id="action-title">これからどうする？</h2>
          <p>おすすめに関わらず、あなたが決めた方法を選べます。</p>
        </div>
      </div>

      <div
        className={`recommendation-box${recommendationStale ? " recommendation-stale" : ""}`}
        aria-live="polite"
      >
        <div className="recommendation-topline">
          <span className="sparkle" aria-hidden="true">✳</span>
          <strong>
            {recommendationStale
              ? "おすすめは再分析が必要です"
              : showRecommendation
                ? `AIのおすすめ：${recommendationLabel}`
                : "AIのおすすめ"}
          </strong>
          {showRecommendation && <span className="ai-tag">AI</span>}
        </div>
        <p>
          {recommendationStale
            ? "物品情報を編集したため、現在のおすすめは表示していません。"
            : reason}
        </p>
      </div>

      <div className="action-options">
        {ACTION_OPTIONS.map(({ value, label, description }) => {
          const isRecommended = showRecommendation && recommendation === value;
          const isSelected = selectedAction === value;
          return (
            <button
              className={`action-option${isSelected ? " is-selected" : ""}`}
              type="button"
              key={value}
              aria-pressed={isSelected}
              onClick={() => onSelect(value)}
            >
              <span className="action-radio" aria-hidden="true">
                {isSelected && <span />}
              </span>
              <span className="action-copy">
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
              {isRecommended && <span className="recommended-tag">おすすめ</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
