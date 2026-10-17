import type { Action, Pipeline2Input } from "../../types/recognition";
import { ACTION_GUIDES } from "../../lib/action-guides";

const CATEGORY_LABELS = {
  furniture: "家具",
  electronics: "家電・電子機器",
  books: "本・教材",
  clothing: "衣類",
  bicycle: "自転車",
  household: "日用品",
  other: "その他",
} as const;

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

interface ActionGuideProps {
  action: Action;
  item: Pipeline2Input["item"];
}

export function ActionGuide({ action, item }: ActionGuideProps) {
  const guide = ACTION_GUIDES[action];
  const gradeText =
    item.conditionGrade === null
      ? "写真からの外観評価：判定できません"
      : `写真からの外観評価：${item.conditionGrade}/5`;

  return (
    <section className="action-guide-card" aria-labelledby="action-guide-title">
      <div className="section-heading">
        <span className="step-number">01</span>
        <div>
          <span className="guide-action-label">{ACTION_LABELS[action]}</span>
          <h2 id="action-guide-title">{guide.title}</h2>
          <p>{guide.introduction}</p>
        </div>
      </div>
      {(action === "sell" || action === "give") && (
        <div className="item-condition-note">
          <strong>{item.name}</strong>
          <span>カテゴリ：{CATEGORY_LABELS[item.category]}</span>
          <span>{gradeText}</span>
          {item.observations.length > 0 && (
            <ul>
              {item.observations.map((observation, index) => (
                <li key={`${observation}-${index}`}>{observation}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      <ol className="guide-steps">
        {guide.steps.map((step) => <li key={step}>{step}</li>)}
      </ol>
      <p className="directory-notice">{guide.directoryMessage}</p>
    </section>
  );
}
