import type { ResaleEstimate } from "../../types/recognition";

const LIKELIHOOD_TITLES: Record<ResaleEstimate["likelihood"], string> = {
  high: "売れる可能性が高い持ち物です",
  medium: "売れる可能性があります",
  low: "売れる可能性は低めです",
};

const LIKELIHOOD_LABELS: Record<ResaleEstimate["likelihood"], string> = {
  high: "高い",
  medium: "あり",
  low: "低め",
};

const yen = new Intl.NumberFormat("ja-JP");

export function formatPriceRange(range: NonNullable<ResaleEstimate["priceRange"]>) {
  return range.min === range.max
    ? `${yen.format(range.min)}円前後`
    : `${yen.format(range.min)}〜${yen.format(range.max)}円`;
}

interface ResaleEstimateCardProps {
  estimate: ResaleEstimate;
  action?: {
    label: string;
    onClick: () => void;
    disabled?: boolean;
  };
}

/** The AI's first answer to "can this be sold?", shown before the action choice. */
export function ResaleEstimateCard({ estimate, action }: ResaleEstimateCardProps) {
  return (
    <section
      className="resale-card"
      data-likelihood={estimate.likelihood}
      aria-labelledby="resale-card-title"
    >
      <div className="resale-card-head">
        <span className="resale-card-badge">
          売れる可能性：{LIKELIHOOD_LABELS[estimate.likelihood]}
        </span>
        <h2 id="resale-card-title">{LIKELIHOOD_TITLES[estimate.likelihood]}</h2>
      </div>

      {estimate.priceRange && (
        <div className="resale-card-price">
          <span>買取額の目安</span>
          <strong>{formatPriceRange(estimate.priceRange)}</strong>
        </div>
      )}

      <p>{estimate.reason}</p>

      {estimate.tips.length > 0 && (
        <div className="resale-card-tips">
          <span>査定の前に確認すること</span>
          <ul>
            {estimate.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </div>
      )}

      <small>
        AIが写真から推定した参考情報です。実際の買取額は店舗や状態・動作の確認結果によって異なり、保証されません。
      </small>

      {action && (
        <button
          type="button"
          className="resale-card-action"
          disabled={action.disabled}
          onClick={action.onClick}
        >
          {action.label}
        </button>
      )}
    </section>
  );
}
