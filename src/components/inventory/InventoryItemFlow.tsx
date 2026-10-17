"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { displayItemCategory } from "../../lib/item-category";
import { isItemUnidentified } from "../../lib/recognition-workflow";
import {
  ITEM_CATEGORIES,
  AnalyzeResponseSchema,
  type Action,
  type AnalyzeResponse,
  type ItemCategory,
} from "../../types/recognition";
import type { RuleResult } from "../../server/rules/schemas";

interface InventoryItem {
  id: string;
  imageUrl: string;
  name: string | null;
  category: ItemCategory | null;
  conditionGrade: number | null;
  status: "pending" | "in_progress" | "completed";
  analysisStatus: "pending" | "processing" | "succeeded" | "failed";
  capturedAt: string;
}

interface InventoryItemFlowProps {
  initialItem: InventoryItem;
  initialRecognition: AnalyzeResponse | null;
  initialSelectedAction: Action | null;
  initialResult: RuleResult | null;
}

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

function itemStatus(status: InventoryItem["status"]) {
  if (status === "completed") {
    return { label: "完了", className: "inventory-status-completed" };
  }
  if (status === "in_progress") {
    return { label: "対応中", className: "inventory-status-in-progress" };
  }
  return { label: "未整理", className: "inventory-status-pending" };
}

function isRecommendationOutdated(
  item: InventoryItem,
  recognition: AnalyzeResponse,
): boolean {
  const basis = recognition.recommendationBasis ?? recognition.item;
  return (
    item.name !== basis.name ||
    item.category !== basis.category ||
    item.conditionGrade !== basis.condition.grade
  );
}

function formatCapturedAt(value: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

function apiErrorMessage(payload: unknown, fallback: string): string {
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

function ItemFactIcon({ type }: { type: "category" | "condition" | "date" }) {
  if (type === "category") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8M8 13h5" />
      </svg>
    );
  }
  if (type === "condition") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M5 19v-5M10 19V9M15 19V5M20 19v-8" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M8 4v4M16 4v4M4 10h16" />
    </svg>
  );
}

export function InventoryItemFlow({
  initialItem,
  initialRecognition,
  initialSelectedAction,
  initialResult,
}: InventoryItemFlowProps) {
  const router = useRouter();
  const [item, setItem] = useState(initialItem);
  const [recognition, setRecognition] = useState(initialRecognition);
  const [analysisStatus, setAnalysisStatus] = useState(initialItem.analysisStatus);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [showManualCorrection, setShowManualCorrection] = useState(false);
  const [manualName, setManualName] = useState(initialItem.name ?? "");
  const [manualCategory, setManualCategory] = useState<ItemCategory | "">(
    initialItem.category ?? "",
  );
  const [savingManualCorrection, setSavingManualCorrection] = useState(false);
  const [manualCorrectionError, setManualCorrectionError] = useState<string | null>(
    null,
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const analysisAttempted = useRef(false);
  const analysisRequestInFlight = useRef(false);
  const status = itemStatus(item.status);
  const recommendation = recognition?.recommendation;
  const recognitionUnidentified = isItemUnidentified(recognition);
  const canManuallyCorrect =
    recognitionUnidentified ||
    (analysisStatus === "failed" && recognition === null);
  const recommendationIsCurrent =
    recognition !== null &&
    !recognitionUnidentified &&
    recommendation?.action !== null &&
    recommendation !== undefined &&
    !isRecommendationOutdated(item, recognition);

  useEffect(() => {
    setItem(initialItem);
    setRecognition(initialRecognition);
    setAnalysisStatus(initialRecognition ? "succeeded" : initialItem.analysisStatus);
    setManualName(initialItem.name ?? "");
    setManualCategory(initialItem.category ?? "");
    if (initialRecognition) setAnalysisError(null);
  }, [initialItem, initialRecognition]);

  const runAnalysis = useCallback(async () => {
    if (analysisRequestInFlight.current) return;
    analysisRequestInFlight.current = true;
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
          response.status === 409 &&
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
        throw new Error(
          apiErrorMessage(payload, "写真を識別できませんでした。もう一度お試しください。"),
        );
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("item" in payload) ||
        typeof payload.item !== "object" ||
        payload.item === null
      ) {
        throw new Error("保存された識別結果を読み取れませんでした。");
      }
      const record = payload.item as Record<string, unknown>;
      const parsed = AnalyzeResponseSchema.safeParse(record.recognition_result);
      if (!parsed.success) {
        throw new Error("識別結果の形式を確認できませんでした。");
      }
      setRecognition(parsed.data);
      setItem((current) => ({
        ...current,
        name: parsed.data.item.name,
        category: parsed.data.item.category,
        conditionGrade: parsed.data.item.condition.grade,
        analysisStatus: "succeeded",
      }));
      setAnalysisStatus("succeeded");
      router.refresh();
    } catch (error) {
      setAnalysisStatus("failed");
      setAnalysisError(
        error instanceof Error
          ? error.message
          : "写真を識別できませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      analysisRequestInFlight.current = false;
      setAnalysisLoading(false);
    }
  }, [item.id, router]);

  useEffect(() => {
    if (initialItem.analysisStatus !== "pending" || analysisAttempted.current) return;
    analysisAttempted.current = true;
    void runAnalysis();
  }, [initialItem.analysisStatus, runAnalysis]);

  useEffect(() => {
    if (analysisStatus !== "processing" || analysisLoading) return;
    const timer = window.setInterval(() => router.refresh(), 2000);
    return () => window.clearInterval(timer);
  }, [analysisLoading, analysisStatus, router]);

  async function saveManualCorrection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!manualName.trim() || !manualCategory || savingManualCorrection) return;
    setSavingManualCorrection(true);
    setManualCorrectionError(null);
    try {
      const response = await fetch(`/api/items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: manualName.trim(),
          category: manualCategory,
          conditionGrade: null,
          observations: [],
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          apiErrorMessage(payload, "物品情報を保存できませんでした。"),
        );
      }
      setItem((current) => ({
        ...current,
        name: manualName.trim(),
        category: manualCategory,
        conditionGrade: null,
      }));
      setShowManualCorrection(false);
      router.refresh();
    } catch (error) {
      setManualCorrectionError(
        error instanceof Error ? error.message : "物品情報を保存できませんでした。",
      );
    } finally {
      setSavingManualCorrection(false);
    }
  }

  async function deleteItem() {
    if (deleting) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const response = await fetch(`/api/items/${initialItem.id}`, {
        method: "DELETE",
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        throw new Error(
          typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
            ? payload.error.message
            : "持ち物を削除できませんでした。時間をおいて再度お試しください。",
        );
      }
      if (
        typeof payload !== "object" ||
        payload === null ||
        !("deleted" in payload) ||
        payload.deleted !== true
      ) {
        throw new Error("削除結果を確認できませんでした。");
      }
      router.replace("/items");
      router.refresh();
    } catch (error) {
      setDeleteError(
        error instanceof Error
          ? error.message
          : "持ち物を削除できませんでした。時間をおいて再度お試しください。",
      );
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="inventory-detail">
      <a className="inventory-back-link" href="/items">
        ← 持ち物一覧
      </a>

      <article className="inventory-item-summary">
        <img src={item.imageUrl} alt={item.name ?? "登録した持ち物"} />
        <div className="inventory-item-summary-copy">
          <div className="inventory-item-summary-title">
            <h1>
              {recognitionUnidentified
                ? "識別できませんでした"
                : item.name ??
                  (analysisStatus === "failed"
                    ? "識別できませんでした"
                    : "AI識別中…")}
            </h1>
            <span className={`inventory-status ${status.className}`}>
              {status.label}
            </span>
          </div>
          <dl className="inventory-item-facts">
            <div>
              <dt>
                <ItemFactIcon type="category" />
                カテゴリ
              </dt>
              <dd>
                {item.category && !recognitionUnidentified
                  ? displayItemCategory(
                      item.category,
                      item.name ?? "",
                    )
                  : analysisStatus === "failed" || recognitionUnidentified
                    ? "未識別"
                    : "識別中"}
              </dd>
            </div>
            <div>
              <dt>
                <ItemFactIcon type="condition" />
                状態の目安
              </dt>
              <dd>
                {item.conditionGrade === null || recognitionUnidentified
                  ? analysisStatus === "failed" || recognitionUnidentified
                    ? "未判定"
                    : "識別中"
                  : `${item.conditionGrade} / 5`}
              </dd>
            </div>
            <div>
              <dt>
                <ItemFactIcon type="date" />
                撮影日
              </dt>
              <dd>{formatCapturedAt(item.capturedAt)}</dd>
            </div>
          </dl>
          {(analysisStatus !== "succeeded" ||
            analysisLoading ||
            recognitionUnidentified) && (
            <div
              className={`inventory-analysis-state${analysisStatus === "failed" ? " is-error" : ""}`}
              role={analysisStatus === "failed" ? "alert" : "status"}
              aria-live="polite"
            >
              <strong>
                {analysisLoading || analysisStatus === "processing"
                  ? "AI識別中…"
                  : analysisStatus === "failed"
                    ? "識別できませんでした"
                    : recognitionUnidentified
                      ? "AIでは物品を特定できませんでした"
                      : "まだAI識別していません"}
              </strong>
              <p>
                写真は保存されています。
                {analysisStatus === "failed"
                  ? "識別を再試行するか、物品名とカテゴリを入力してください。"
                  : recognitionUnidentified
                    ? "物品名とカテゴリを確認して入力してください。"
                    : ""}
              </p>
              {analysisError && <p>{analysisError}</p>}
              {canManuallyCorrect && (
                <div className="inventory-analysis-actions">
                  {analysisStatus === "failed" && (
                    <button
                      className="inventory-secondary"
                      type="button"
                      disabled={analysisLoading}
                      onClick={() => {
                        analysisAttempted.current = true;
                        void runAnalysis();
                      }}
                    >
                      {analysisLoading ? "識別中…" : "もう一度認識する"}
                    </button>
                  )}
                  {(analysisStatus === "failed" || recognitionUnidentified) && (
                    <button
                      className="inventory-analysis-edit-link"
                      type="button"
                      onClick={() => {
                        setManualCorrectionError(null);
                        setManualName(item.name ?? "");
                        setManualCategory(item.category ?? "");
                        setShowManualCorrection((shown) => !shown);
                      }}
                    >
                      {showManualCorrection ? "入力を閉じる" : "物品名・カテゴリを入力"}
                    </button>
                  )}
                </div>
              )}
              {showManualCorrection &&
                canManuallyCorrect && (
                <form
                  className="inventory-manual-correction"
                  onSubmit={saveManualCorrection}
                >
                  <label>
                    <span>物品名</span>
                    <input
                      autoComplete="off"
                      maxLength={100}
                      required
                      value={manualName}
                      onChange={(event) => setManualName(event.target.value)}
                    />
                  </label>
                  <label>
                    <span>カテゴリ</span>
                    <select
                      required
                      value={manualCategory}
                      onChange={(event) =>
                        setManualCategory(
                          ITEM_CATEGORIES.find(
                            (category) => category === event.target.value,
                          ) ?? "",
                        )
                      }
                    >
                      <option value="">選択してください</option>
                      {ITEM_CATEGORIES.map((category) => (
                        <option key={category} value={category}>
                          {displayItemCategory(category, manualName)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {manualCorrectionError && (
                    <p role="alert">{manualCorrectionError}</p>
                  )}
                  <button
                    className="inventory-secondary"
                    type="submit"
                    disabled={
                      savingManualCorrection || !manualName.trim() || !manualCategory
                    }
                  >
                    {savingManualCorrection ? "保存中…" : "物品情報を保存"}
                  </button>
                </form>
              )}
            </div>
          )}
          {analysisStatus === "succeeded" &&
            recognition &&
            !recognitionUnidentified &&
            recommendationIsCurrent &&
            recommendation && (
            <aside className="inventory-ai-recommendation">
              <span className="inventory-ai-recommendation-label">
                AIのおすすめ
              </span>
              <span className="inventory-ai-recommendation-icon" aria-hidden="true">
                ✦
              </span>
              <div>
                <strong>
                  {recommendation.action && ACTION_LABELS[recommendation.action]}
                </strong>
                <p>{recommendation.reason}</p>
              </div>
            </aside>
          )}
          {initialResult && initialSelectedAction && (
            <div className="inventory-saved-plan-summary">
              <span>保存済みの整理プラン</span>
              <strong>{ACTION_LABELS[initialSelectedAction]}</strong>
              <p>{initialResult.guidance.title}</p>
            </div>
          )}
        </div>
      </article>

      <section className="inventory-delete-area" aria-label="持ち物の削除">
        {!confirmDelete ? (
          <button
            className="inventory-delete-trigger"
            type="button"
            onClick={() => {
              setDeleteError(null);
              setConfirmDelete(true);
            }}
          >
            この持ち物を削除する
          </button>
        ) : (
          <div
            className="inventory-delete-confirmation"
            role="group"
            aria-labelledby="inventory-delete-title"
            aria-describedby="inventory-delete-description"
          >
            <h2 id="inventory-delete-title">この持ち物を削除しますか？</h2>
            <p id="inventory-delete-description">
              写真と保存済みの整理プランも削除されます。この操作は取り消せません。
            </p>
            {deleteError && (
              <p className="inventory-delete-error" role="alert">
                {deleteError}
              </p>
            )}
            <div className="inventory-delete-confirm-actions">
              <button
                className="inventory-delete-cancel"
                type="button"
                disabled={deleting}
                onClick={() => setConfirmDelete(false)}
              >
                キャンセル
              </button>
              <button
                className="inventory-delete-confirm"
                type="button"
                disabled={deleting}
                onClick={() => void deleteItem()}
              >
                {deleting ? "削除中…" : "削除する"}
              </button>
            </div>
          </div>
        )}
      </section>

      <div className="inventory-detail-cta-dock">
        <button
          className="inventory-detail-primary"
          type="button"
          onClick={() => router.push(`/items/${item.id}/consult`)}
        >
          {item.status === "completed" ? (
            <>整理結果を見る →</>
          ) : item.status === "in_progress" ? (
            <>整理プランを見る →</>
          ) : (
            <>
              <span aria-hidden="true">✦</span>
              AIに相談する
            </>
          )}
        </button>
      </div>
    </section>
  );
}
