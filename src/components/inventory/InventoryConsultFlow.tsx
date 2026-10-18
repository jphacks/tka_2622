"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { RuleResultView } from "../services/RuleResultView";
import { StationSelector } from "../stations/StationSelector";
import { useStations } from "../../hooks/useStations";
import {
  displayItemCategory,
  isMusicalInstrumentName,
  ruleItemCategory,
} from "../../lib/item-category";
import {
  AnalyzeResponseSchema,
  ConditionGradeSchema,
  ItemCategorySchema,
  type Action,
  type AnalyzeResponse,
  type ConditionGrade,
  type ItemCategory,
  type RecognizedItem,
} from "../../types/recognition";
import { RuleResultSchema, type RuleResult } from "../../server/rules/schemas";
import {
  isItemUnidentified,
  isRecommendationCurrent,
} from "../../lib/recognition-workflow";
import { Button, LoadingState } from "../ui";

type AnalysisStatus = "pending" | "processing" | "succeeded" | "failed";
type ItemStatus = "pending" | "in_progress" | "completed";

interface ConsultItem {
  id: string;
  imageUrl: string;
  name: string | null;
  category: ItemCategory | null;
  conditionGrade: ConditionGrade;
  observations: string[];
  analysisStatus: AnalysisStatus;
  status: ItemStatus;
  selectedAction: Action | null;
}

interface InventoryConsultFlowProps {
  initialItem: ConsultItem;
  initialRecognition: AnalyzeResponse | null;
  initialResult: RuleResult | null;
  nearestStationId: string | null;
}

const ACTIONS: Array<{ value: Action; label: string }> = [
  { value: "sell", label: "売る" },
  { value: "give", label: "譲る" },
  { value: "dispose", label: "処分する" },
  { value: "keep", label: "保管する" },
];

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

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

function itemFromRecognition(
  current: ConsultItem,
  record: Record<string, unknown>,
): ConsultItem {
  const category = ItemCategorySchema.safeParse(record.category);
  const conditionGrade = ConditionGradeSchema.safeParse(record.condition_grade);
  const observations = Array.isArray(record.observations)
    ? record.observations.filter(
        (observation): observation is string =>
          typeof observation === "string",
      )
    : [];
  return {
    ...current,
    name: typeof record.name === "string" ? record.name : current.name,
    category: category.success ? category.data : current.category,
    conditionGrade: conditionGrade.success
      ? conditionGrade.data
      : current.conditionGrade,
    observations,
    analysisStatus: "succeeded",
  };
}

function hasDifferentDetails(
  draft: RecognizedItem,
  current: AnalyzeResponse,
): boolean {
  return (
    draft.name !== current.item.name ||
    draft.category !== current.item.category ||
    draft.condition.grade !== current.item.condition.grade
  );
}

export function InventoryConsultFlow({
  initialItem,
  initialRecognition,
  initialResult,
  nearestStationId,
}: InventoryConsultFlowProps) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [recognition, setRecognition] = useState(initialRecognition);
  const [analysisStatus, setAnalysisStatus] = useState<AnalysisStatus>(
    initialRecognition ? "succeeded" : initialItem.analysisStatus,
  );
  const [analysisError, setAnalysisError] = useState<string | null>(
    isItemUnidentified(initialRecognition)
      ? "AIでは物品を特定できませんでした。情報を訂正してください。"
      : initialItem.analysisStatus === "failed"
        ? "写真を識別できませんでした。再試行するか、物品情報を確認してください。"
      : initialItem.analysisStatus === "succeeded" && !initialRecognition
        ? "保存された分析結果を読み取れませんでした。"
        : null,
  );
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [selectedAction, setSelectedAction] = useState<Action | null>(
    initialResult?.selectedAction ?? initialItem.selectedAction,
  );
  const [result, setResult] = useState<RuleResult | null>(initialResult);
  const [planSaved, setPlanSaved] = useState(initialResult !== null);
  const [stationId, setStationId] = useState(
    initialResult?.stationId ?? nearestStationId,
  );
  const [evaluationLoading, setEvaluationLoading] = useState(false);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingPlan, setSavingPlan] = useState(false);
  const [completing, setCompleting] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [draft, setDraft] = useState<RecognizedItem | null>(null);
  const [correctionError, setCorrectionError] = useState<string | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [showAlternativeActions, setShowAlternativeActions] = useState(false);
  const analysisAttempted = useRef(false);
  const evaluationRequest = useRef(0);
  const initialEvaluationAttempted = useRef(initialResult !== null);

  useEffect(() => {
    if (initialRecognition) {
      setRecognition(initialRecognition);
      setAnalysisStatus("succeeded");
      setAnalysisError(
        isItemUnidentified(initialRecognition)
          ? "AIでは物品を特定できませんでした。情報を訂正してください。"
          : null,
      );
      setItem((current) =>
        itemFromRecognition(current, {
          name: initialRecognition.item.name,
          category: initialRecognition.item.category,
          condition_grade: initialRecognition.item.condition.grade,
          observations: initialRecognition.item.condition.observations,
        }),
      );
      return;
    }
    setAnalysisStatus(initialItem.analysisStatus);
    setAnalysisError(
      initialItem.analysisStatus === "failed"
        ? "写真を識別できませんでした。再試行するか、物品情報を確認してください。"
        : null,
    );
  }, [initialItem.analysisStatus, initialRecognition]);

  const runAnalysis = useCallback(async () => {
    if (analysisLoading) return;
    setAnalysisLoading(true);
    setAnalysisError(null);
    setAnalysisStatus("processing");
    try {
      const response = await fetch(`/api/items/${item.id}/analyze`, {
        method: "POST",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        if (
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "code" in payload.error &&
          payload.error.code === "ANALYSIS_ALREADY_STARTED"
        ) {
          setAnalysisStatus("processing");
          return;
        }
        throw new Error(errorMessage(payload, "AI分析を完了できませんでした。"));
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("item" in payload) ||
        typeof payload.item !== "object" ||
        payload.item === null
      ) {
        throw new Error("AI分析の結果を読み取れませんでした。");
      }
      const record = payload.item as Record<string, unknown>;
      const parsedRecognition = AnalyzeResponseSchema.safeParse(
        record.recognition_result,
      );
      if (!parsedRecognition.success) {
        throw new Error("AI分析の結果を正しく読み取れませんでした。");
      }
      setRecognition(parsedRecognition.data);
      setItem((current) => itemFromRecognition(current, record));
      setAnalysisStatus("succeeded");
      router.refresh();
    } catch (error) {
      setAnalysisStatus("failed");
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "AI分析を完了できませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      setAnalysisLoading(false);
    }
  }, [analysisLoading, item.id, router]);

  useEffect(() => {
    if (
      recognition ||
      analysisStatus === "succeeded" ||
      isItemUnidentified(recognition)
    ) {
      return;
    }
    if (analysisStatus === "pending" && !analysisAttempted.current) {
      analysisAttempted.current = true;
      void runAnalysis();
    }
  }, [analysisStatus, recognition, runAnalysis]);

  useEffect(() => {
    if (analysisStatus !== "processing" || recognition) return;
    const timer = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [analysisStatus, recognition, router]);

  const evaluateAction = useCallback(
    async (action?: Action, requestedStationId = stationId) => {
      if (!recognition || isItemUnidentified(recognition)) return;
      if (action && action === selectedAction && result && !evaluationError) return;

      const requestId = ++evaluationRequest.current;
      if (action) setSelectedAction(action);
      setResult(null);
      if (action) setPlanSaved(false);
      setEvaluationLoading(true);
      setEvaluationError(null);
      setSaveError(null);
      try {
        const response = await fetch("/api/rules/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stationId: requestedStationId ?? undefined,
            item: {
              name: recognition.item.name,
              category: recognition.item.category,
              conditionGrade: recognition.item.condition.grade,
              observations: recognition.item.condition.observations,
            },
            aiRecommendedAction: isRecommendationCurrent(recognition)
              ? recognition.recommendation.action
              : null,
            aiRecommendationReason: isRecommendationCurrent(recognition)
              ? recognition.recommendation.reason
              : undefined,
            ...(action ? { selectedAction: action } : {}),
          }),
        });
        const payload: unknown = await response.json();
        if (!response.ok) {
          throw new Error(
            errorMessage(payload, "整理方法の案内を取得できませんでした。"),
          );
        }
        const parsed = RuleResultSchema.safeParse(payload);
        if (!parsed.success) {
          throw new Error("整理方法の案内を正しく読み取れませんでした。");
        }
        if (requestId === evaluationRequest.current) {
          setResult(parsed.data);
          setSelectedAction(parsed.data.selectedAction);
          setPlanSaved(false);
        }
      } catch (error) {
        if (requestId === evaluationRequest.current) {
          setEvaluationError(
            error instanceof Error
              ? error.message
              : "整理方法の案内を取得できませんでした。",
          );
        }
      } finally {
        if (requestId === evaluationRequest.current) {
          setEvaluationLoading(false);
        }
      }
    },
    [evaluationError, recognition, result, selectedAction, stationId],
  );

  useEffect(() => {
    if (!recognition || initialEvaluationAttempted.current || initialResult) {
      return;
    }
    if (isItemUnidentified(recognition)) return;
    initialEvaluationAttempted.current = true;
    void evaluateAction(selectedAction ?? undefined);
  }, [evaluateAction, initialResult, recognition, selectedAction]);

  const handleStationChange = useCallback(
    (nextStationId: string) => {
      setStationId(nextStationId);
      if (selectedAction === "sell") {
        void evaluateAction("sell", nextStationId);
      }
    },
    [evaluateAction, selectedAction],
  );
  const stations = useStations(stationId, handleStationChange);

  async function savePlan() {
    if (!selectedAction || !result || savingPlan || planSaved) return;
    setSavingPlan(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/items/${item.id}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          selectedAction,
          stationId: selectedAction === "sell" ? stationId ?? undefined : undefined,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "整理プランを保存できませんでした。"));
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("result" in payload) ||
        !("plan" in payload) ||
        typeof payload.plan !== "object" ||
        payload.plan === null ||
        !("selected_action" in payload.plan) ||
        payload.plan.selected_action !== selectedAction
      ) {
        throw new Error("保存した整理プランを読み取れませんでした。");
      }
      const parsed = RuleResultSchema.safeParse(payload.result);
      if (!parsed.success || parsed.data.selectedAction !== selectedAction) {
        throw new Error("保存した整理プランの形式を確認できませんでした。");
      }
      setResult(parsed.data);
      setPlanSaved(true);
      setItem((current) => ({
        ...current,
        selectedAction,
        status: current.status === "completed" ? "completed" : "in_progress",
      }));
      router.replace("/items");
      router.refresh();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "整理プランを保存できませんでした。",
      );
    } finally {
      setSavingPlan(false);
    }
  }

  async function markCompleted() {
    if (completing || item.status === "completed" || !planSaved) return;
    setCompleting(true);
    setSaveError(null);
    try {
      const response = await fetch(`/api/items/${item.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "完了状態を保存できませんでした。"));
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("item" in payload) ||
        typeof payload.item !== "object" ||
        payload.item === null ||
        !("status" in payload.item) ||
        payload.item.status !== "completed"
      ) {
        throw new Error("完了状態を確認できませんでした。");
      }
      setItem((current) => ({ ...current, status: "completed" }));
      router.replace(`/items/${item.id}`);
      router.refresh();
    } catch (error) {
      setSaveError(
        error instanceof Error
          ? error.message
          : "完了状態を保存できませんでした。",
      );
    } finally {
      setCompleting(false);
    }
  }

  function startCorrection() {
    if (!recognition) return;
    setDraft({
      ...recognition.item,
      category: ruleItemCategory(
        recognition.item.category,
        recognition.item.name,
      ),
      condition: { ...recognition.item.condition },
    });
    setCorrectionError(null);
    setShowCorrection(true);
  }

  async function saveCorrection() {
    if (!draft || !recognition || !hasDifferentDetails(draft, recognition)) {
      setShowCorrection(false);
      return;
    }
    setSavingCorrection(true);
    setCorrectionError(null);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name,
          category: draft.category,
          conditionGrade: draft.condition.grade,
          observations: draft.condition.observations,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(errorMessage(payload, "物品情報を保存できませんでした。"));
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("item" in payload) ||
        typeof payload.item !== "object" ||
        payload.item === null
      ) {
        throw new Error("保存した物品情報を読み取れませんでした。");
      }
      const record = payload.item as Record<string, unknown>;
      const parsed = AnalyzeResponseSchema.safeParse(record.recognition_result);
      if (!parsed.success) {
        throw new Error("保存した認識結果を正しく読み取れませんでした。");
      }
      setRecognition(parsed.data);
      setAnalysisError(
        isItemUnidentified(parsed.data)
          ? "AIでは物品を特定できませんでした。情報を訂正してください。"
          : null,
      );
      setItem((current) => itemFromRecognition(current, record));
      setSelectedAction(null);
      setResult(null);
      setPlanSaved(false);
      setDraft(null);
      setShowCorrection(false);
      setShowAlternativeActions(false);
      initialEvaluationAttempted.current = false;
      router.refresh();
    } catch (error) {
      setCorrectionError(
        error instanceof Error
          ? error.message
          : "物品情報を保存できませんでした。",
      );
    } finally {
      setSavingCorrection(false);
    }
  }

  const currentName = isItemUnidentified(recognition)
    ? "識別できませんでした"
    : recognition?.item.name ?? item.name ?? "名前未確認";
  const itemCategoryLabel = isItemUnidentified(recognition)
    ? "未識別"
    : recognition
      ? displayItemCategory(recognition.item.category, recognition.item.name)
      : item.category
        ? displayItemCategory(item.category, item.name ?? currentName)
        : "カテゴリ未確認";
  const canCorrect =
    recognition !== null &&
    item.selectedAction === null &&
    item.status !== "completed";
  const alternatives = ACTIONS.filter(
    ({ value }) => value !== selectedAction,
  );

  return (
    <section className="inventory-consult">
      <Link className="inventory-back-link" href={`/items/${item.id}`}>
        ← 持ち物詳細
      </Link>
      <header className="inventory-consult-heading">
        <h1>{item.status === "completed" ? "整理結果" : planSaved ? "整理プラン" : "AIに相談"}</h1>
      </header>

      <div className="inventory-consult-item">
        <img src={item.imageUrl} alt="" />
        <div>
          <strong>{currentName}</strong>
          <small>{itemCategoryLabel}</small>
        </div>
      </div>

      <section className="inventory-consult-conversation" aria-label="整理方法の相談">
        {planSaved && (
          <p className="inventory-plan-feedback" role="status">
            {item.status === "completed" ? "整理が完了しました。ひとつ、次の暮らしへ。" : "保存済みのプランです。できることから進めましょう。"}
          </p>
        )}
        {analysisLoading && (
          <LoadingState
            title="写真を分析しています"
            description="物品情報を確認しています。少しお待ちください。"
          />
        )}
        {analysisError && (
          <div className="notice notice-error" role="alert">
            <p>{analysisError}</p>
            {analysisStatus === "failed" && (
              <Button
                variant="text"
                type="button"
                onClick={() => {
                  analysisAttempted.current = true;
                  void runAnalysis();
                }}
              >
                AI分析を再試行
              </Button>
            )}
          </div>
        )}
        {analysisStatus === "processing" && !analysisLoading && !analysisError && (
          <p className="inventory-consult-status" role="status">
            別の画面で分析中です。完了すると選択肢が表示されます。
          </p>
        )}

        {recognition && canCorrect && (
          <button
            type="button"
            className="inventory-consult-correction-link"
            onClick={() => {
              if (showCorrection) {
                setShowCorrection(false);
                setDraft(null);
              } else {
                startCorrection();
              }
            }}
          >
            {showCorrection ? "訂正を閉じる" : "情報を訂正"}
          </button>
        )}

        {showCorrection && draft && (
          <section className="inventory-consult-correction" aria-label="物品情報の訂正">
            <h2>物品情報を訂正</h2>
            <label className="field">
              <span>物品名</span>
              <input
                value={draft.name}
                maxLength={100}
                onChange={(event) =>
                  setDraft((current) =>
                    current
                      ? {
                          ...current,
                          name: event.target.value,
                          category: ruleItemCategory(
                            current.category,
                            event.target.value,
                          ),
                        }
                      : current,
                  )
                }
              />
            </label>
            <label className="field">
              <span>カテゴリ</span>
              <select
                value={draft.category}
                onChange={(event) => {
                  const parsed = ItemCategorySchema.safeParse(event.target.value);
                  if (parsed.success) {
                    setDraft((current) =>
                      current ? { ...current, category: parsed.data } : current,
                    );
                  }
                }}
              >
                {Object.entries({
                  furniture: "家具",
                  electronics: "家電・電子機器",
                  books: "本・教材",
                  clothing: "衣類",
                  bicycle: "自転車",
                  household: "日用品",
                  other: isMusicalInstrumentName(draft.name) ? "楽器" : "その他",
                }).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>外観の状態</span>
              <select
                value={draft.condition.grade ?? ""}
                onChange={(event) => {
                  const rawValue = event.target.value;
                  const parsed = ConditionGradeSchema.safeParse(
                    rawValue === "" ? null : Number(rawValue),
                  );
                  if (parsed.success) {
                    setDraft((current) =>
                      current
                        ? {
                            ...current,
                            condition: {
                              ...current.condition,
                              grade: parsed.data,
                            },
                          }
                        : current,
                    );
                  }
                }}
              >
                <option value="">判定できない</option>
                {[5, 4, 3, 2, 1].map((grade) => (
                  <option key={grade} value={grade}>
                    {grade} / 5
                  </option>
                ))}
              </select>
            </label>
            {correctionError && (
              <p className="notice notice-error" role="alert">
                {correctionError}
              </p>
            )}
            <Button
              variant="secondary"
              type="button"
              disabled={savingCorrection || !draft.name.trim()}
              onClick={() => void saveCorrection()}
            >
              {savingCorrection ? "保存中…" : "訂正内容を保存"}
            </Button>
          </section>
        )}

        {recognition && (
          <div className="inventory-consult-response">
            {result && (
              <section
                className="inventory-consult-recommendation"
                aria-labelledby="consult-recommendation-title"
              >
                <span>AIのおすすめ</span>
                <h2 id="consult-recommendation-title">
                  {ACTION_LABELS[result.recommendedAction]}
                </h2>
                <p>{result.recommendationReason}</p>
                {result.recommendationConfidence === "low" && (
                  <small>状態や条件を確認したうえで判断してください。</small>
                )}
                {selectedAction &&
                  selectedAction !== result.recommendedAction && (
                    <strong className="inventory-consult-selected-mode">
                      現在の方法：{ACTION_LABELS[selectedAction]}
                    </strong>
                  )}
              </section>
            )}

            {selectedAction && (
              <div className="inventory-consult-alternatives">
                <button
                  className="inventory-consult-correction-link"
                  type="button"
                  aria-expanded={showAlternativeActions}
                  onClick={() =>
                    setShowAlternativeActions((current) => !current)
                  }
                >
                  {showAlternativeActions
                    ? "ほかの方法を閉じる"
                    : "ほかの方法を検討する"}
                </button>
                {showAlternativeActions && (
                  <div
                    className="inventory-consult-actions"
                    aria-label="別の整理方法を選択"
                  >
                    {alternatives.map(({ value, label }) => (
                      <button
                        key={value}
                        type="button"
                        className="inventory-consult-action"
                        disabled={item.status === "completed"}
                        onClick={() => {
                          setShowAlternativeActions(false);
                          void evaluateAction(value);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {selectedAction === "sell" && (
              <details className="inventory-consult-station" open={!stationId}>
                <summary>買取店を探す駅{stationId && stations.stations.find((station) => station.id === stationId) ? `：${stations.stations.find((station) => station.id === stationId)?.name}` : "を選択"}</summary>
                <StationSelector
                  stations={stations.stations}
                  selectedStationId={stationId}
                  loading={stations.loading}
                  error={stations.error}
                  onSelect={stations.selectStation}
                  onRetry={() => void stations.loadStations()}
                />
              </details>
            )}
            <RuleResultView
              result={result}
              loading={evaluationLoading}
              error={evaluationError}
              onRetry={() => {
                if (selectedAction) void evaluateAction(selectedAction);
              }}
              showRecommendation={false}
              showItemSummary={false}
              showActionCta={false}
              stepsFirst
            />
          </div>
        )}
        {recognition && (
          <div className="inventory-consult-action-dock">
            {saveError && (
              <p className="notice notice-error" role="alert">
                {saveError}
              </p>
            )}
            {planSaved ? (
              <div
                className="inventory-consult-saved-actions"
                data-status={item.status}
              >
                <Link
                  className="inventory-consult-back-button"
                  href="/items"
                >
                  戻る
                </Link>
                {item.status === "completed" ? (
                  <span
                    className="inventory-consult-completed-state"
                    role="status"
                  >
                    完了
                  </span>
                ) : (
                  <button
                    className="inventory-consult-complete"
                    type="button"
                    disabled={completing}
                    onClick={() => void markCompleted()}
                  >
                    {completing ? "更新中…" : "整理を完了する"}
                  </button>
                )}
              </div>
            ) : (
              <button
                className="inventory-consult-save"
                type="button"
                disabled={!result || savingPlan || evaluationLoading}
                onClick={() => void savePlan()}
              >
                {savingPlan ? "保存中…" : "このプランを保存する"}
              </button>
            )}
          </div>
        )}
      </section>
    </section>
  );
}
