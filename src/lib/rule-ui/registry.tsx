import { defineRegistry } from "@json-render/react";
import type { RuleNotice } from "../../server/rules/schemas";
import { formatOsmOpeningHours } from "../osm-opening-hours";
import { ruleUiCatalog } from "./catalog";

const NOTICE_LABELS: Record<RuleNotice["type"], string> = {
  info: "ご案内",
  caution: "ご確認ください",
  needs_verification: "要確認",
};

export const { registry: ruleUiRegistry } = defineRegistry(ruleUiCatalog, {
  components: {
    ResultStack: ({ children }) => (
      <div className="rule-result-stack">{children}</div>
    ),
    RecommendationCard: ({ props }) => (
      <section className="rule-card rule-recommendation">
        <div className="rule-card-eyebrow">整理方法の提案</div>
        <div className="rule-action-summary">
          <strong>{props.actionLabel}</strong>
          <span>選択中：{props.selectedLabel}</span>
        </div>
        <p>{props.reason}</p>
        <small>提案の確度：{props.confidenceLabel}</small>
      </section>
    ),
    ItemSummaryCard: ({ props }) => (
      <section className="rule-card rule-item-summary">
        <div className="rule-card-eyebrow">確認した持ち物</div>
        <strong>{props.name}</strong>
        <span>{props.categoryLabel}</span>
        <span>{props.conditionLabel}</span>
        {props.observations.length > 0 && (
          <ul>
            {props.observations.map((observation, index) => (
              <li key={`${index}-${observation}`}>{observation}</li>
            ))}
          </ul>
        )}
      </section>
    ),
    ActionGuideCard: ({ props }) => (
      <section className="rule-card rule-action-guide">
        <h2>{props.title}</h2>
        <p>{props.introduction}</p>
        <p className="rule-directory-message">{props.directoryMessage}</p>
      </section>
    ),
    ActionCtaCard: ({ props }) => (
      <section className="rule-action-cta-wrap">
        <a className="button button-primary rule-action-cta" href={props.target}>
          {props.label}
          <span aria-hidden="true">→</span>
        </a>
      </section>
    ),
    TransferChannelsCard: ({ props }) => (
      <section
        className="rule-card rule-transfer-channels"
        id="transfer-channels"
      >
        <h3>譲り先を探す候補</h3>
        <ul>
          {props.channels.map((channel) => (
            <li key={channel.title}>
              <strong>{channel.title}</strong>
              <span>{channel.description}</span>
            </li>
          ))}
        </ul>
        <p>募集条件や受入れ可否は各窓口に確認してください。</p>
      </section>
    ),
    DisposalVerificationCard: ({ props }) => (
      <section
        className="rule-card rule-disposal-verification"
        aria-labelledby="disposal-verification-title"
      >
        <h3 id="disposal-verification-title">{props.title}</h3>
        <p>
          お住まいの自治体が分からないため、品目の分別区分や回収方法は判定していません。
        </p>
        <ol>
          {props.items.map((item, index) => (
            <li key={`${index}-${item}`}>{item}</li>
          ))}
        </ol>
      </section>
    ),
    PackingAdviceCard: ({ props }) => (
      <section className="rule-card rule-packing-advice">
        <h3>{props.title}</h3>
        <ul>
          {props.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>
    ),
    ChecklistCard: ({ props }) => (
      <section className="rule-card rule-checklist" id="action-checklist">
        <h3>{props.title}</h3>
        <ol>
          {props.items.map((item, index) => (
            <li key={`${index}-${item}`}>
              <span aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
              <div className="rule-step-copy">{item}</div>
            </li>
          ))}
        </ol>
      </section>
    ),
    StoreList: ({ props }) => props.items.length === 0 ? null : (
      <section className="rule-card rule-store-list" id="store-list">
        <h3>買取対応を確認したお店</h3>
        {props.items.map((store) => (
          <article key={store.id} className="rule-store">
            <strong>{store.name}</strong>
            {store.isMock && <span className="mock-label">モックデータ</span>}
            <span>{store.address}</span>
            <span>駅から約{store.distanceMeters}m</span>
            {store.openingHours.length > 0 ? (
              store.openingHours.map((line) => <span key={line}>{line}</span>)
            ) : (
              <span>営業時間：情報なし（店舗にご確認ください）</span>
            )}
            <p>{store.description}</p>
            {store.externalUrl && (
              <a href={store.externalUrl} target="_blank" rel="noreferrer">
                店舗情報を確認する
              </a>
            )}
          </article>
        ))}
      </section>
    ),
    OsmCandidateList: ({ props }) => (
      <section className="rule-card rule-store-list osm-candidate-list">
        <h3>近くのリユースショップ</h3>
        <p className="osm-candidate-disclaimer">
          OSMの候補情報です。買取サービスや商品カテゴリへの対応は確認されていません。
        </p>
        {props.items.length === 0 ? (
          <p className="osm-candidate-empty">
            この駅の3km以内に表示できるOSM候補はありません。調査範囲は未完了で、店舗がないことを示すものではありません。
          </p>
        ) : (
          props.items.map((candidate) => (
            <article key={candidate.id} className="rule-store osm-candidate">
              <strong>{candidate.name}</strong>
              <span className="osm-candidate-unverified">
                買取サービス未確認
              </span>
              <span>
                カテゴリ：
                {candidate.category ?? "OSMにカテゴリタグなし"}
              </span>
              <span>
                位置：{candidate.latitude.toFixed(5)}、
                {candidate.longitude.toFixed(5)}
              </span>
              <span>駅から約{candidate.distanceMeters}m</span>
              <span>
                営業時間：
                {candidate.openingHours
                  ? formatOsmOpeningHours(candidate.openingHours)
                  : "OSMに営業時間タグなし"}
              </span>
              <a href={candidate.sourceUrl} target="_blank" rel="noreferrer">
                OpenStreetMapの地物情報
              </a>
            </article>
          ))
        )}
        <div className="osm-attribution">
          <span>© OpenStreetMap contributors</span>
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            ODbL 1.0
          </a>
          <a href="/api/open-data/osm-candidates">
            候補・駅距離データをダウンロード
          </a>
        </div>
      </section>
    ),
    NoticeCard: ({ props }) => (
      <section
        className="rule-card rule-notices"
        id="disposal-notices"
        aria-label="確認事項"
      >
        {props.notices.map((notice) => (
          <article
            className={`rule-notice rule-notice-${notice.type}`}
            key={notice.ruleId}
          >
            <strong>{NOTICE_LABELS[notice.type]}</strong>
            <p>{notice.message}</p>
            {notice.sourceUrl && (
              <a href={notice.sourceUrl} target="_blank" rel="noreferrer">
                公式情報を確認する
              </a>
            )}
          </article>
        ))}
      </section>
    ),
    EmptyStateCard: ({ props }) => (
      <section className="rule-card rule-empty-state" role="status">
        <strong>{props.title}</strong>
        <p>{props.message}</p>
      </section>
    ),
  },
  actions: {},
});
