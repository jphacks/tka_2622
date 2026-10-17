"use client";

import { useState } from "react";
import { ActionSelector } from "../components/recognition/ActionSelector";
import { ImageUploader } from "../components/recognition/ImageUploader";
import { RecognitionResult } from "../components/recognition/RecognitionResult";
import { Pipeline2Flow } from "../components/services/Pipeline2Flow";
import { useRecognition } from "../hooks/useRecognition";

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m14.5 5-7 7 7 7" />
    </svg>
  );
}

function HelpIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.3a2.4 2.4 0 0 1 4.7.7c0 1.8-2.5 2.1-2.5 3.7" />
      <path d="M12 17.2h.01" />
    </svg>
  );
}

type HomeScreen = "recognize" | "confirm" | "result";

const SCREEN_COPY: Record<
  HomeScreen,
  { step: string; title: string; accent: string; lead: string; ariaStep: string }
> = {
  recognize: {
    step: "STEP 01",
    title: "その持ち物、",
    accent: "どうする？",
    lead: "まずは手放したいアイテムの\n写真を登録しましょう",
    ariaStep: "ステップ1 / 3：写真を認識",
  },
  confirm: {
    step: "STEP 02",
    title: "見つけた内容、",
    accent: "合ってる？",
    lead: "AIが読み取った内容を確認して\n必要なら修正してください",
    ariaStep: "ステップ2 / 3：内容を確認",
  },
  result: {
    step: "STEP 03",
    title: "あなたに合う方法、",
    accent: "見つけました。",
    lead: "おすすめを参考に\n最後はあなたが方法を選べます",
    ariaStep: "ステップ3 / 3：結果を確認",
  },
};

export default function HomePage() {
  const recognition = useRecognition();
  const [pipeline2Open, setPipeline2Open] = useState(false);
  const [screen, setScreen] = useState<HomeScreen>("recognize");
  const canAnalyze =
    recognition.file !== null && recognition.status !== "analyzing";
  const screenCopy = SCREEN_COPY[screen];

  if (
    pipeline2Open &&
    recognition.status === "confirmed" &&
    recognition.pipeline2Input
  ) {
    return (
      <Pipeline2Flow
        input={recognition.pipeline2Input}
        onBack={() => setPipeline2Open(false)}
        onEditAction={() => {
          recognition.reviseConfirmation();
          setPipeline2Open(false);
        }}
      />
    );
  }

  function handleBack() {
    if (screen === "result") {
      if (recognition.status === "confirmed") {
        recognition.reviseConfirmation();
      }
      setScreen("confirm");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (screen === "confirm") {
      setScreen("recognize");
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }

    if (recognition.file || recognition.response) {
      recognition.reset();
      return;
    }

    if (window.history.length > 1) {
      window.history.back();
    }
  }

  async function handleAnalyze() {
    const succeeded = await recognition.analyze();
    if (!succeeded) return;

    setScreen("confirm");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleManualEntry() {
    recognition.beginManualEntry();
    setScreen("confirm");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showResult() {
    if (!recognition.item?.name.trim()) return;
    setScreen("result");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function showPhotoPolicy() {
    if (screen !== "recognize") {
      setScreen("recognize");
    }
    window.setTimeout(() => {
      document
        .getElementById("photo-policy")
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 0);
  }

  return (
    <main className="home-stage">
      <div className="home-app">
        <header className="home-header">
          <button
            type="button"
            className="home-nav-button"
            aria-label="前の画面に戻る"
            onClick={handleBack}
          >
            <BackIcon />
          </button>
          <a className="home-wordmark" href="/" aria-label="よりみち ホーム">
            よりみち
          </a>
          <button
            type="button"
            className="home-nav-button"
            aria-label="写真の取り扱いを見る"
            onClick={showPhotoPolicy}
          >
            <HelpIcon />
          </button>
        </header>

        <div className="home-progress" aria-label={screenCopy.ariaStep}>
          <span className={screen === "recognize" ? "is-current" : ""} />
          <span className={screen === "confirm" ? "is-current" : ""} />
          <span className={screen === "result" ? "is-current" : ""} />
        </div>

        <section
          className={`home-intro home-intro-${screen}`}
          aria-labelledby="home-title"
          key={screen}
        >
          <p className="home-step-label">{screenCopy.step}</p>
          <h1 id="home-title">
            {screenCopy.title}
            <br />
            <span>{screenCopy.accent}</span>
          </h1>
          <p className="home-lead">
            {screenCopy.lead.split("\n").map((line, index) => (
              <span key={line}>
                {line}
                {index === 0 && <br />}
              </span>
            ))}
          </p>
        </section>

        <section
          className={`home-workflow home-screen home-screen-${screen}`}
          aria-label={screenCopy.ariaStep}
          key={`workflow-${screen}`}
        >
          {screen === "recognize" && (
            <>
              <ImageUploader
                file={recognition.file}
                onSelect={recognition.selectFile}
                disabled={recognition.status === "analyzing"}
              />

              {recognition.error && (
                <div className="notice notice-error" role="alert">
                  <span aria-hidden="true">!</span>
                  <p>{recognition.error}</p>
                  {recognition.file && recognition.status !== "analyzing" && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={handleAnalyze}
                    >
                      もう一度試す
                    </button>
                  )}
                </div>
              )}

              {recognition.file && recognition.status !== "analyzing" && (
                <button
                  className="home-analyze-button"
                  type="button"
                  onClick={handleAnalyze}
                  disabled={!canAnalyze}
                >
                  <span>
                    {recognition.response
                      ? "もう一度認識する"
                      : recognition.mode === "mock"
                        ? "この写真を認識する"
                        : "この写真をAIで認識する"}
                  </span>
                  <span aria-hidden="true">→</span>
                </button>
              )}

              {recognition.status === "analyzing" && (
                <div className="loading-card" role="status" aria-live="polite">
                  <span className="spinner" />
                  <div>
                    <strong>
                      {recognition.mode === "mock"
                        ? "サンプルを準備しています"
                        : "写真を分析しています"}
                    </strong>
                    <p>そのまま少しお待ちください。</p>
                  </div>
                </div>
              )}

              {recognition.error &&
                recognition.status !== "analyzing" &&
                !recognition.response && (
                  <button
                    type="button"
                    className="manual-entry-button"
                    onClick={handleManualEntry}
                  >
                    分析せずに、物品情報を手入力する
                  </button>
                )}
            </>
          )}

          {screen === "confirm" && recognition.item && recognition.response && (
            <>
              {recognition.mode === "mock" && (
                <div className="mock-banner" role="status">
                  <span>モック</span>
                  固定のサンプル結果です。実際の画像を認識した結果ではありません。
                </div>
              )}
              <RecognitionResult
                item={recognition.item}
                isEdited={recognition.isEdited}
                isManualEntry={recognition.isManualEntry}
                onNameChange={recognition.updateName}
                onCategoryChange={recognition.updateCategory}
                onGradeChange={recognition.updateGrade}
              />
              {recognition.isEdited && recognition.file && (
                <button
                  type="button"
                  className="button button-secondary reanalyze-button"
                  onClick={handleAnalyze}
                >
                  写真から再分析する
                </button>
              )}
              <button
                type="button"
                className="home-analyze-button home-next-button"
                onClick={showResult}
                disabled={!recognition.item.name.trim()}
              >
                <span>この内容で結果を見る</span>
                <span aria-hidden="true">→</span>
              </button>
            </>
          )}

          {screen === "result" && recognition.item && recognition.response && (
            <>
              <div className="home-result-item">
                <div>
                  <span>対象アイテム</span>
                  <strong>{recognition.item.name}</strong>
                </div>
                <button type="button" onClick={() => setScreen("confirm")}>
                  修正する
                </button>
              </div>

              {recognition.status !== "confirmed" && (
                <>
                  <ActionSelector
                    recommendation={
                      recognition.isEdited || recognition.isManualEntry
                        ? null
                        : recognition.response.recommendation.action
                    }
                    reason={recognition.response.recommendation.reason}
                    recommendationStale={recognition.isEdited}
                    selectedAction={recognition.selectedAction}
                    onSelect={recognition.chooseAction}
                  />
                  <div className="confirm-area">
                    <p>おすすめを参考に、あなたが決めた方法を選んでください。</p>
                    <button
                      className="button button-primary confirm-button"
                      type="button"
                      onClick={recognition.confirm}
                      disabled={!recognition.selectedAction}
                    >
                      この方法に決める
                      <span aria-hidden="true">→</span>
                    </button>
                    {!recognition.selectedAction && (
                      <span className="selection-hint">
                        まず、処理方法を選んでください。
                      </span>
                    )}
                  </div>
                </>
              )}

              {recognition.status === "confirmed" &&
                recognition.pipeline2Input && (
                  <section
                    className="confirmed-card"
                    aria-labelledby="confirmed-title"
                  >
                    <div className="confirmed-icon" aria-hidden="true">
                      ✓
                    </div>
                    <div>
                      <span className="eyebrow">決定しました</span>
                      <h2 id="confirmed-title">整理方法が決まりました</h2>
                      <p>選択した方法に応じた案内を確認できます。</p>
                    </div>
                    <div className="confirmed-actions">
                      <button
                        type="button"
                        className="button button-primary"
                        onClick={() => setPipeline2Open(true)}
                      >
                        近くのサービスを探す
                        <span aria-hidden="true">→</span>
                      </button>
                      <button
                        type="button"
                        className="text-button"
                        onClick={recognition.reviseConfirmation}
                      >
                        方法を選び直す
                      </button>
                    </div>
                    {process.env.NODE_ENV === "development" && (
                      <details className="json-preview">
                        <summary>Pipeline2Input を表示</summary>
                        <pre>
                          {JSON.stringify(recognition.pipeline2Input, null, 2)}
                        </pre>
                      </details>
                    )}
                    <button
                      type="button"
                      className="text-button start-over-button"
                      onClick={() => {
                        recognition.reset();
                        setScreen("recognize");
                      }}
                    >
                      別の持ち物を整理する
                    </button>
                  </section>
                )}
            </>
          )}
        </section>

        {screen === "recognize" && (
          <>
            <section className="home-policy" id="photo-policy">
              <span className="home-policy-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24">
                  <path d="M12 3 5.5 5.5v5.2c0 4.2 2.6 7.9 6.5 9.3 3.9-1.4 6.5-5.1 6.5-9.3V5.5L12 3Z" />
                  <path d="m9.4 11.7 1.7 1.7 3.6-3.7" />
                </svg>
              </span>
              <div>
                <strong>写真は安全に取り扱います</strong>
                <p>
                  実 API では分析のため外部AIサービスへ送信しますが、
                  このアプリ内には保存しません。
                </p>
              </div>
            </section>

            <details className="home-mode-settings">
              <summary>デモ設定</summary>
              <div className="home-mode-content">
                <div>
                  <strong>分析モード</strong>
                  <p>
                    {recognition.mode === "mock"
                      ? "固定サンプルを表示します。"
                      : "選択した写真を外部AIサービスへ送信します。"}
                  </p>
                </div>
                <div
                  className="mode-switch"
                  role="group"
                  aria-label="分析モードを選択"
                >
                  <button
                    type="button"
                    className={recognition.mode === "mock" ? "active" : ""}
                    aria-pressed={recognition.mode === "mock"}
                    onClick={() => recognition.setMode("mock")}
                    disabled={recognition.status === "analyzing"}
                  >
                    モック
                  </button>
                  <button
                    type="button"
                    className={recognition.mode === "real" ? "active" : ""}
                    aria-pressed={recognition.mode === "real"}
                    onClick={() => recognition.setMode("real")}
                    disabled={recognition.status === "analyzing"}
                  >
                    実 API
                  </button>
                </div>
              </div>
            </details>
          </>
        )}

        <footer className="home-footer">
          <span>よりみち</span>
          <span>暮らしを、少し軽やかに。</span>
        </footer>
      </div>
    </main>
  );
}
