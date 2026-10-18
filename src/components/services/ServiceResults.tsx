import type { Action } from "../../types/recognition";
import type { ServiceMatchResponse } from "../../types/service";
import { EmptyState, LoadingState, RetryableError } from "../ui";
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
      <LoadingState
        title="近くのサービスを探しています"
        description="駅周辺のデモデータを確認しています。"
      />
    );
  }

  if (error) {
    return (
      <RetryableError message={error} retryLabel="もう一度探す" onRetry={onRetry} />
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
        <EmptyState
          title="該当するサービスはまだありません"
          description={
            result.selectedAction === "sell"
              ? "この駅のデモ店舗データはありません。別の駅を選択してください。"
              : "この方法に対応するサービス一覧はまだ準備中です。"
          }
        />
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
