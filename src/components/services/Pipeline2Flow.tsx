"use client";

import type { Pipeline2Input } from "../../types/recognition";
import { ActionGuide } from "./ActionGuide";
import { ServiceResults } from "./ServiceResults";
import { StationSelector } from "../stations/StationSelector";
import { useServiceMatching } from "../../hooks/useServiceMatching";

const ACTION_LABELS = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
} as const;

interface Pipeline2FlowProps {
  input: Pipeline2Input;
  onBack: () => void;
  onEditAction: () => void;
}

export function Pipeline2Flow({
  input,
  onBack,
  onEditAction,
}: Pipeline2FlowProps) {
  const matching = useServiceMatching(input);

  return (
    <main className="app-shell pipeline2-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="よりみち ホーム">
          <span className="brand-mark" aria-hidden="true">y</span>
          <span>よりみち</span>
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
          <button className="text-button" type="button" onClick={onBack}>
            ← 確認画面に戻る
          </button>
          <button className="text-button" type="button" onClick={onEditAction}>
            Actionを変更する
          </button>
        </div>
        <section className="pipeline2-item-card" aria-label="確認済みの持ち物">
          <span>確認済みの持ち物</span>
          <strong>{input.item.name}</strong>
          <span>あなたの選択：{ACTION_LABELS[input.selectedAction]}</span>
        </section>
        <section className="station-card" aria-labelledby="station-title">
          <div className="section-heading">
            <span className="step-number">01</span>
            <div>
              <h2 id="station-title">最寄り駅を選ぶ</h2>
              <p>駅名で検索して、1つ選択してください。駅一覧はデモ用です。</p>
            </div>
          </div>
          <StationSelector
            stations={matching.stations}
            selectedStationId={matching.selectedStationId}
            loading={matching.stationsLoading}
            error={matching.stationsError}
            onSelect={matching.selectStation}
            onRetry={() => void matching.loadStations()}
          />
          <button
            className="button button-primary match-button"
            type="button"
            onClick={() => void matching.search()}
            disabled={!matching.selectedStationId || matching.loading}
          >
            近くのサービスを探す
            <span aria-hidden="true">→</span>
          </button>
        </section>
        <ActionGuide action={input.selectedAction} item={input.item} />
        <ServiceResults
          result={matching.result}
          loading={matching.loading}
          error={matching.error}
          onRetry={() => void matching.search()}
        />
      </div>
      <footer className="footer">
        <span>よりみち</span>
        <span>暮らしを、少し軽やかに。</span>
      </footer>
    </main>
  );
}
