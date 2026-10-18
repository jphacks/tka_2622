"use client";

import type { Pipeline2Input } from "../../types/recognition";
import type { Action } from "../../types/recognition";
import type { RuleResult } from "../../server/rules/schemas";
import { RuleResultView } from "./RuleResultView";
import { StationSelector } from "../stations/StationSelector";
import { useStations } from "../../hooks/useStations";
import { Button } from "../ui";

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

interface Pipeline2FlowProps {
  input: Pipeline2Input;
  selectedStationId: string | null;
  ruleResult: RuleResult | null;
  ruleLoading: boolean;
  ruleError: string | null;
  onStationChange: (stationId: string) => void;
  onRetryRules: () => void;
  onEditAction: () => void;
}

export function Pipeline2Flow({
  input,
  selectedStationId,
  ruleResult,
  ruleLoading,
  ruleError,
  onStationChange,
  onRetryRules,
  onEditAction,
}: Pipeline2FlowProps) {
  const stations = useStations(selectedStationId, onStationChange);

  return (
    <main className="app-shell pipeline2-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ものさき。 ホーム">
          <span className="brand-mark" aria-hidden="true">y</span>
          <span>ものさき。</span>
        </a>
        <span className="topbar-note">引っ越し前の、持ち物整理。</span>
      </header>
      <section className="pipeline2-hero">
        <span className="eyebrow">PIPELINE 2 · サービス案内</span>
        <h1>次の一歩を、<br /><span>見つけよう。</span></h1>
        <p>確認した持ち物とあなたが選んだ方法をもとに、案内します。</p>
      </section>
      <div className="pipeline2-content">
        <div className="pipeline2-nav">
          <Button variant="text" type="button" onClick={onEditAction}>
            ← 方法を選び直す
          </Button>
        </div>
        <section className="pipeline2-item-card" aria-label="確認済みの持ち物">
          <span>確認済みの持ち物</span>
          <strong>{input.item.name}</strong>
          <span>あなたの選択：{ACTION_LABELS[input.selectedAction]}</span>
        </section>
        {input.selectedAction === "sell" && (
          <section
            className="station-card"
            id="station-selector"
            aria-labelledby="station-title"
          >
            <div className="section-heading">
              <span className="step-number">01</span>
              <div>
                <h2 id="station-title">最寄り駅を選ぶ</h2>
                <p>駅名で検索して、1つ選択してください。</p>
              </div>
            </div>
            <StationSelector
              stations={stations.stations}
              selectedStationId={stations.selectedStationId}
              loading={stations.loading}
              error={stations.error}
              onSelect={stations.selectStation}
              onRetry={() => void stations.loadStations()}
            />
            <p className="station-rule-hint">
              {selectedStationId
                ? "選択した駅に合わせて案内を更新します。"
                : "駅を選ぶと、近くの確認済み買取店とOSM候補を確認できます。"}
            </p>
          </section>
        )}
        <RuleResultView
          result={ruleResult}
          loading={ruleLoading}
          error={ruleError}
          onRetry={onRetryRules}
        />
      </div>
      <footer className="footer">
        <span>ものさき。</span>
        <span>暮らしを、少し軽やかに。</span>
      </footer>
    </main>
  );
}
