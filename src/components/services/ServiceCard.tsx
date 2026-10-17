import type { ServiceBusiness } from "../../types/service";

const SERVICE_LABELS = {
  keep: "引っ越し・保管",
  sell: "買取",
  give: "譲渡支援",
  dispose: "処分・回収",
} as const;

interface ServiceCardProps {
  business: ServiceBusiness;
  rank: number;
}

export function ServiceCard({ business, rank }: ServiceCardProps) {
  return (
    <article className="service-card">
      <div className="service-card-heading">
        <span className="service-rank">{String(rank).padStart(2, "0")}</span>
        <div>
          <h3>{business.name}</h3>
          {business.isMock && <span className="mock-label">架空のデモ店舗</span>}
        </div>
      </div>
      <dl className="service-details">
        <div>
          <dt>所在地</dt>
          <dd>{business.address}</dd>
        </div>
        <div>
          <dt>駅から</dt>
          <dd>約{business.distanceMeters}m</dd>
        </div>
        <div>
          <dt>サービス</dt>
          <dd>
            {business.supportedActions
              .map((action) => SERVICE_LABELS[action])
              .join("・")}
          </dd>
        </div>
      </dl>
      <p>{business.description}</p>
      {business.externalUrl && (
        <a href={business.externalUrl} target="_blank" rel="noreferrer">
          店舗情報を確認する
        </a>
      )}
    </article>
  );
}
