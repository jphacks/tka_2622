import type { Action } from "../../types/recognition";
import type { ServiceMatchResponse } from "../../types/service";
import { ServiceCard } from "./ServiceCard";

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

interface ServiceResultsProps {
  result: ServiceMatchResponse | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function ServiceResults({
  result,
  loading,
  error,
  onRetry,
}: ServiceResultsProps) {
  if (loading) {
    return (
      <div className="loading-card" role="status" aria-live="polite">
        <span className="spinner" />
        <div>
          <strong>近くのサービスを探しています</strong>
          <p>駅周辺のデモデータを確認しています。</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        <p>{error}</p>
        <button className="text-button" type="button" onClick={onRetry}>
          もう一度探す
        </button>
      </div>
    );
  }

  if (!result) return null;

  return (
    <section className="service-results" aria-labelledby="service-results-title">
      <div className="mock-banner" role="status">
        <span>モックデータ</span>
        架空のデモ店舗です。実在性・営業状況を示す情報ではありません。
      </div>
      <div className="section-heading">
        <span className="step-number">02</span>
        <div>
          <h2 id="service-results-title">
            {ACTION_LABELS[result.selectedAction]}サービス
          </h2>
          <p>駅からの距離が近い順に表示しています。</p>
        </div>
      </div>
      {result.results.length === 0 ? (
        <div className="empty-state" role="status">
          <strong>該当するサービスはまだありません</strong>
          <p>
            {result.selectedAction === "sell"
              ? "この駅のデモ店舗データはありません。別の駅を選択してください。"
              : "この方法に対応するサービス一覧はまだ準備中です。"}
          </p>
        </div>
      ) : (
        <div className="service-list">
          {result.results.map((business, index) => (
            <ServiceCard
              key={business.id}
              business={business}
              rank={index + 1}
            />
          ))}
        </div>
      )}
    </section>
  );
}
