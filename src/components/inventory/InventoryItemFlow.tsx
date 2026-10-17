"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ActionSelector } from "../recognition/ActionSelector";
import { RecognitionResult } from "../recognition/RecognitionResult";
import { RuleResultView } from "../services/RuleResultView";
import {
  AnalyzeResponseSchema,
  type Action,
  type AnalyzeResponse,
  type ItemCategory,
  type RecognizedItem,
} from "../../types/recognition";
import {
  RuleResultSchema,
  type RuleResult,
} from "../../server/rules/schemas";

interface InventoryItem {
  id: string;
  imageUrl: string;
  name: string | null;
  category: ItemCategory | null;
  conditionGrade: RecognizedItem["condition"]["grade"];
  observations: string[];
  recommendedAction: Action | null;
  recommendationReason: string | null;
  selectedAction: Action | null;
  analysisStatus: "pending" | "processing" | "succeeded" | "failed";
  status: "pending" | "in_progress" | "completed";
  updatedAt: string;
}

interface InventoryItemFlowProps {
  initialItem: InventoryItem;
  initialRecognition: AnalyzeResponse | null;
  initialResult: RuleResult | null;
}

function errorMessage(payload: unknown, fallback: string): string {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return fallback;
}

function errorCode(payload: unknown): string | null {
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "code" in payload.error &&
    typeof payload.error.code === "string"
  ) {
    return payload.error.code;
  }
  return null;
}

export function InventoryItemFlow({
  initialItem,
  initialRecognition,
  initialResult,
}: InventoryItemFlowProps) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [recognition, setRecognition] = useState(initialRecognition);
  const [result, setResult] = useState<RuleResult | null>(initialResult);
  const [selectedAction, setSelectedAction] = useState<Action | null>(
    initialResult?.selectedAction ?? initialItem.selectedAction,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const autoAnalysisStarted = useRef(false);

  async function runAnalysis() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${item.id}/analyze`, {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (errorCode(payload) === "ANALYSIS_ALREADY_STARTED") {
          setItem((current) => ({ ...current, analysisStatus: "processing" }));
          setError(errorMessage(payload, "別の画面で分析中です。"));
          return;
        }
        throw new Error(errorMessage(payload, "AI分析を完了できませんでした。"));
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("item" in payload)
      ) {
        throw new Error("AI分析の結果を読み取れませんでした。");
      }
      const record = payload.item;
      if (typeof record !== "object" || record === null) {
        throw new Error("AI分析の結果を読み取れませんでした。");
      }
      const parsed = AnalyzeResponseSchema.safeParse({
        item: {
          name: "name" in record ? record.name : undefined,
          category: "category" in record ? record.category : undefined,
          condition: {
            grade: "condition_grade" in record ? record.condition_grade : null,
            observations: "observations" in record ? record.observations : [],
            needsUserConfirmation: true,
          },
        },
        recommendation: {
          action:
            "recommended_action" in record
              ? record.recommended_action
              : undefined,
          reason:
            "recommendation_reason" in record
              ? record.recommendation_reason
              : undefined,
        },
      });
      if (!parsed.success) {
        throw new Error("AI分析の結果を正しく読み取れませんでした。");
      }
      setRecognition(parsed.data);
      setItem((current) => ({
        ...current,
        name: parsed.data.item.name,
        category: parsed.data.item.category,
        conditionGrade: parsed.data.item.condition.grade,
        observations: parsed.data.item.condition.observations,
        recommendedAction: parsed.data.recommendation.action,
        recommendationReason: parsed.data.recommendation.reason,
        analysisStatus: "succeeded",
      }));
      setSelectedAction(null);
      setResult(null);
      router.refresh();
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "AI分析を完了できませんでした。時間をおいて再度お試しください。",
      );
      setItem((current) => ({ ...current, analysisStatus: "failed" }));
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (
      item.analysisStatus === "pending" &&
      !autoAnalysisStarted.current
    ) {
      autoAnalysisStarted.current = true;
      void runAnalysis();
    }
  }, [item.analysisStatus]);

  const recognizedItem: RecognizedItem | null =
    item.name && item.category
      ? {
          name: item.name,
          category: item.category,
          condition: {
            grade: item.conditionGrade,
            observations: item.observations,
            needsUserConfirmation: false,
          },
        }
      : null;
  const hasEdits =
    recognition !== null &&
    recognizedItem !== null &&
    (recognition.item.name !== recognizedItem.name ||
      recognition.item.category !== recognizedItem.category ||
      recognition.item.condition.grade !== recognizedItem.condition.grade ||
      JSON.stringify(recognition.item.condition.observations) !==
        JSON.stringify(recognizedItem.condition.observations));

  async function saveEdits() {
    if (!recognizedItem || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recognizedItem.name,
          category: recognizedItem.category,
          conditionGrade: recognizedItem.condition.grade,
          observations: recognizedItem.condition.observations,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "物品情報を保存できませんでした。"));
      }
      setRecognition((current) =>
        current
          ? {
              ...current,
              item: recognizedItem,
            }
          : current,
      );
      setSaved(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "物品情報を保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function savePlan() {
    if (!selectedAction || busy) return;
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const response = await fetch(`/api/items/${item.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selectedAction }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "整理プランを作成できませんでした。"));
      }
      if (typeof payload !== "object" || payload === null || !("result" in payload)) {
        throw new Error("整理プランの結果を読み取れませんでした。");
      }
      const parsed = RuleResultSchema.safeParse(payload.result);
      if (!parsed.success) {
        throw new Error("整理プランの形式を確認できませんでした。");
      }
      setResult(parsed.data);
      setItem((current) => ({
        ...current,
        selectedAction: parsed.data.selectedAction,
        status: "in_progress",
      }));
      setSaved(true);
      router.refresh();
    } catch (planError) {
      setError(
        planError instanceof Error
          ? planError.message
          : "整理プランを作成できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function updateStatus(status: "in_progress" | "completed") {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "進捗を保存できませんでした。"));
      }
      setItem((current) => ({ ...current, status }));
    } catch (statusError) {
      setError(
        statusError instanceof Error
          ? statusError.message
          : "進捗を保存できませんでした。",
      );
    } finally {
      setBusy(false);
    }
  }

  async function deleteItem() {
    if (busy || !window.confirm("この持ち物と写真を削除しますか？")) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/items/${item.id}`, { method: "DELETE" });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "持ち物を削除できませんでした。"));
      }
      router.replace("/items");
      router.refresh();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "持ち物を削除できませんでした。",
      );
      setBusy(false);
    }
  }

  return (
    <section className="inventory-detail" aria-labelledby="item-detail-title">
      <a href="/items" className="inventory-back-link">← 持ち物一覧</a>
      <div className="inventory-detail-heading">
        <h1 id="item-detail-title">
          {item.name ?? "写真を分析しています"}
        </h1>
        {item.analysisStatus === "succeeded" && (
          <p>内容を確認して、これからの整理方法を選んでください。</p>
        )}
      </div>

      {item.analysisStatus !== "succeeded" && (
        <section className="inventory-analysis-panel" aria-live="polite">
          <img src={item.imageUrl} alt="登録した持ち物" />
          {item.analysisStatus === "processing" || busy ? (
            <>
              <p role="status">写真をAIが分析しています…</p>
              {!busy && (
                <button
                  type="button"
                  className="inventory-secondary"
                  onClick={() => router.refresh()}
                >
                  状態を更新する
                </button>
              )}
            </>
          ) : item.analysisStatus === "failed" ? (
            <>
              <p>分析できませんでした。写真は保存されています。もう一度お試しください。</p>
              <button
                type="button"
                className="account-primary"
                disabled={busy}
                onClick={() => void runAnalysis()}
              >
                AI分析を再試行する <span aria-hidden="true">→</span>
              </button>
            </>
          ) : (
            <p role="status">AI分析を準備しています…</p>
          )}
        </section>
      )}

      {recognizedItem && recognition && (
        <>
          <RecognitionResult
            item={recognizedItem}
            photoUrl={item.imageUrl}
            readOnly={item.selectedAction !== null}
            isEdited={hasEdits}
            isManualEntry={false}
            onNameChange={(name) => {
              setItem((current) => ({ ...current, name }));
              setSaved(false);
            }}
            onCategoryChange={(category: ItemCategory) => {
              setItem((current) => ({ ...current, category }));
              setSaved(false);
            }}
            onGradeChange={(conditionGrade) => {
              setItem((current) => ({ ...current, conditionGrade }));
              setSaved(false);
            }}
          />
          {hasEdits && (
            <button
              type="button"
              className="inventory-secondary"
              disabled={busy}
              onClick={() => void saveEdits()}
            >
              {busy ? "保存しています…" : "変更した内容を保存"}
            </button>
          )}
          {saved && <p className="inventory-saved" role="status">保存しました。</p>}
          <ActionSelector
            recommendation={recognition.recommendation.action}
            reason={recognition.recommendation.reason}
            recommendationStale={hasEdits}
            selectedAction={selectedAction}
            onSelect={(action) => {
              setSelectedAction(action);
              if (result && action !== result.selectedAction) setResult(null);
            }}
          />
          <button
            type="button"
            className="account-primary"
            disabled={!selectedAction || busy || hasEdits}
            onClick={() => void savePlan()}
          >
            {busy
              ? "案内を作成しています…"
              : result
                ? "選んだ方法にプランを更新"
                : "この方法で進める"}
            {!busy && <span aria-hidden="true">→</span>}
          </button>
          {result && (
            <div className="inventory-result">
              <RuleResultView
                result={result}
                loading={false}
                error={null}
                onRetry={() => void savePlan()}
              />
              <div className="inventory-progress-actions">
                <p>
                  現在の状態：
                  {item.status === "completed"
                    ? "完了"
                    : "進行中"}
                </p>
                {item.status === "completed" ? (
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy}
                    onClick={() => void updateStatus("in_progress")}
                  >
                    もう一度進行中にする
                  </button>
                ) : (
                  <button
                    type="button"
                    className="inventory-secondary"
                    disabled={busy}
                    onClick={() => void updateStatus("completed")}
                  >
                    整理を完了にする
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
      {error && <p className="account-error" role="alert">{error}</p>}
      <button
        type="button"
        className="inventory-delete"
        disabled={busy}
        onClick={() => void deleteItem()}
      >
        この持ち物を削除
      </button>
    </section>
  );
}
