"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Brand } from "../account/Brand";
import { ImageUploader } from "../recognition/ImageUploader";
import { RecognitionResult } from "../recognition/RecognitionResult";
import { ActionSelector } from "../recognition/ActionSelector";
import { RuleResultView } from "../services/RuleResultView";
import { Button } from "../ui";
import { useRuleEvaluation } from "../../hooks/useRuleEvaluation";
import { analyzeImage } from "../../lib/api-client";
import { isRecommendationCurrent } from "../../lib/recognition-workflow";
import { validateImageFile } from "../../lib/image-validation";
import {
  clearGuestData,
  loadGuestItems,
  loadGuestMovingDate,
  loadGuestPhoto,
  saveGuestItem,
  saveGuestItems,
  saveGuestMovingDate,
  type GuestItem,
} from "../../lib/guest-store";
import type { Action, ItemCategory, RecognizedItem } from "../../types/recognition";
import type { RuleInput, RuleResult } from "../../server/rules/schemas";

type GuestView = "list" | "add" | "detail" | "plan";

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

function UserRoundIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 21a8 8 0 0 0-16 0" />
      <circle cx="12" cy="8" r="5" />
    </svg>
  );
}

export function GuestModeApp() {
  const router = useRouter();
  const [view, setView] = useState<GuestView>("list");
  const [items, setItems] = useState<GuestItem[]>([]);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [movingDate, setMovingDate] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistItem = useCallback((updatedItem: GuestItem) => {
    const nextItems = items.map((item) =>
      item.id === updatedItem.id ? updatedItem : item,
    );
    try {
      saveGuestItems(nextItems);
      setItems(nextItems);
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "ゲストデータを保存できませんでした。",
      );
    }
  }, [items]);

  useEffect(() => {
    try {
      setItems(loadGuestItems());
      setMovingDate(loadGuestMovingDate());
      setLoading(false);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "ゲストデータを読み込めませんでした。",
      );
      setLoading(false);
    }
  }, []);

  const itemIds = items.map(({ id }) => id).join(",");
  useEffect(() => {
    let active = true;
    const urls: string[] = [];

    async function loadPhotos() {
      try {
        const entries = await Promise.all(
          itemIds.split(",").filter(Boolean).map(async (id) => {
            const photo = await loadGuestPhoto(id);
            if (!photo) {
              throw new Error("保存した写真が見つかりません。ゲストデータを削除して再度お試しください。");
            }
            return [id, URL.createObjectURL(photo)] as const;
          }),
        );
        if (!active) {
          entries.forEach(([, url]) => URL.revokeObjectURL(url));
          return;
        }
        urls.push(...entries.map(([, url]) => url));
        setPhotoUrls(Object.fromEntries(entries));
      } catch (photoError) {
        if (active) {
          setError(
            photoError instanceof Error
              ? photoError.message
              : "保存した写真を読み込めませんでした。",
          );
        }
      }
    }

    if (items.length > 0) void loadPhotos();
    else setPhotoUrls({});

    return () => {
      active = false;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [itemIds]);

  const selectedItem =
    items.find(({ id }) => id === selectedItemId) ?? null;
  const ruleInput = useMemo<RuleInput | null>(() => {
    if (!selectedItem?.selectedAction || selectedItem.guide) return null;
    const { item } = selectedItem.analysis;
    return {
      selectedAction: selectedItem.selectedAction,
      item: {
        name: item.name,
        category: item.category,
        conditionGrade: item.condition.grade,
        observations: item.condition.observations,
      },
      aiRecommendedAction: selectedItem.analysis.recommendation.action,
      aiRecommendationReason: selectedItem.analysis.recommendation.reason,
    };
  }, [
    selectedItem?.id,
    selectedItem?.selectedAction,
    selectedItem?.guide,
    selectedItem?.analysis.item.name,
    selectedItem?.analysis.item.category,
    selectedItem?.analysis.item.condition.grade,
    selectedItem?.analysis.item.condition.observations,
    selectedItem?.analysis.recommendation.action,
    selectedItem?.analysis.recommendation.reason,
  ]);
  const ruleEvaluation = useRuleEvaluation(ruleInput);

  useEffect(() => {
    if (
      !selectedItem ||
      selectedItem.guide ||
      !ruleEvaluation.result ||
      ruleEvaluation.result.selectedAction !== selectedItem.selectedAction ||
      ruleEvaluation.result.item.name !== selectedItem.analysis.item.name ||
      ruleEvaluation.result.item.category !== selectedItem.analysis.item.category ||
      ruleEvaluation.result.item.conditionGrade !==
        selectedItem.analysis.item.condition.grade
    ) {
      return;
    }
    persistItem({ ...selectedItem, guide: ruleEvaluation.result });
  }, [persistItem, ruleEvaluation.result, selectedItem]);

  async function addItem() {
    if (!file || busy) return;
    const validationError = validateImageFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const analysis = await analyzeImage(file);
      const item: GuestItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        analysis,
        selectedAction: null,
        status: "pending",
        guide: null,
      };
      await saveGuestItem(item, file);
      setItems((current) => [item, ...current]);
      setSelectedItemId(item.id);
      setFile(null);
      setView("detail");
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "写真の分析または保存に失敗しました。もう一度お試しください。",
      );
    } finally {
      setBusy(false);
    }
  }

  function updateRecognizedItem(
    update: (item: RecognizedItem) => RecognizedItem,
  ) {
    if (!selectedItem) return;
    persistItem({
      ...selectedItem,
      analysis: {
        ...selectedItem.analysis,
        item: update(selectedItem.analysis.item),
      },
      guide: null,
    });
  }

  function selectAction(action: Action) {
    if (!selectedItem) return;
    persistItem({ ...selectedItem, selectedAction: action, guide: null });
  }

  function saveMovingDate(value: string) {
    try {
      saveGuestMovingDate(value);
      setMovingDate(value);
      setError(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "引っ越し予定日を保存できませんでした。",
      );
    }
  }

  async function endGuestMode() {
    if (busy || !window.confirm("ゲストデータをすべて削除して終了しますか？")) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await clearGuestData();
      router.replace("/login");
    } catch (clearError) {
      setError(
        clearError instanceof Error
          ? clearError.message
          : "ゲストデータを削除できませんでした。",
      );
      setBusy(false);
    }
  }

  function openItem(id: string) {
    setSelectedItemId(id);
    setError(null);
    setView("detail");
  }

  function openAdd() {
    setFile(null);
    setError(null);
    setView("add");
  }

  const plannedItems = items.filter(
    (
      item,
    ): item is GuestItem & { selectedAction: Action; guide: RuleResult } =>
      item.selectedAction !== null && item.guide !== null,
  );

  return (
    <main className="inventory-stage guest-stage">
      <header className="inventory-header guest-header">
        <a className="account-wordmark" href="/guest" aria-label="ものさき。">
          <Brand />
        </a>
        <span className="guest-state"><UserRoundIcon /> ゲストモード</span>
        <nav aria-label="ゲストメニュー">
          <button type="button" onClick={() => setView("plan")}>整理プラン</button>
          <button
            type="button"
            onClick={() => void endGuestMode()}
            disabled={busy || ruleEvaluation.loading}
          >
            ゲストを終了
          </button>
        </nav>
      </header>

      <p className="guest-local-notice">
        ゲストデータはこのブラウザー内にのみ保存されます。
      </p>

      {error && <p className="account-error" role="alert">{error}</p>}

      {loading ? (
        <p className="guest-loading" role="status">ゲストデータを読み込んでいます…</p>
      ) : view === "add" ? (
        <section className="inventory-form-panel guest-content" aria-labelledby="guest-add-title">
          <button className="inventory-back-link" type="button" onClick={() => setView("list")}>
            ← 持ち物一覧
          </button>
          <h1 id="guest-add-title">写真で持ち物を登録</h1>
          <p className="account-lead">
            写真はAI識別のために送信されます。登録した持ち物と写真はこのブラウザーだけに保存されます。
          </p>
          <ImageUploader file={file} onSelect={setFile} disabled={busy} />
          <Button type="button" disabled={!file || busy} onClick={() => void addItem()}>
            {busy ? "AIで確認しています…" : "写真を分析して登録"}
            {!busy && <span aria-hidden="true">→</span>}
          </Button>
        </section>
      ) : view === "detail" && selectedItem ? (
        <section className="guest-content guest-detail" aria-label="持ち物の詳細">
          <button className="inventory-back-link" type="button" onClick={() => setView("list")}>
            ← 持ち物一覧
          </button>
          <RecognitionResult
            item={selectedItem.analysis.item}
            photoUrl={photoUrls[selectedItem.id] ?? null}
            isEdited={!isRecommendationCurrent(selectedItem.analysis)}
            isManualEntry={false}
            onNameChange={(name) =>
              updateRecognizedItem((item) => ({ ...item, name }))
            }
            onCategoryChange={(category: ItemCategory) =>
              updateRecognizedItem((item) => ({ ...item, category }))
            }
            onGradeChange={(grade) =>
              updateRecognizedItem((item) => ({
                ...item,
                condition: { ...item.condition, grade },
              }))
            }
          />
          <ActionSelector
            recommendation={selectedItem.analysis.recommendation.action}
            reason={selectedItem.analysis.recommendation.reason}
            recommendationStale={!isRecommendationCurrent(selectedItem.analysis)}
            selectedAction={selectedItem.selectedAction}
            onSelect={selectAction}
          />
          {selectedItem.selectedAction && (
            <section className="guest-consult" aria-labelledby="guest-consult-title">
              <h2 id="guest-consult-title">
                {selectedItem.guide
                  ? "整理方法の相談結果"
                  : "選んだ方法について相談"}
              </h2>
              <p>
                AIの写真分析結果をもとに、公開されている整理ルールと案内を確認します。回答はこのブラウザーに保存されます。
              </p>
              <RuleResultView
                result={selectedItem.guide ?? ruleEvaluation.result}
                loading={!selectedItem.guide && ruleEvaluation.loading}
                error={!selectedItem.guide ? ruleEvaluation.error : null}
                onRetry={ruleEvaluation.retry}
                showRecommendation={false}
                showItemSummary={false}
                showActionCta={false}
                stepsFirst
              />
            </section>
          )}
          <div className="guest-item-actions">
            <button
              className="inventory-secondary"
              type="button"
              onClick={() =>
                persistItem({
                  ...selectedItem,
                  status:
                    selectedItem.status === "completed" ? "in_progress" : "completed",
                })
              }
            >
              {selectedItem.status === "completed" ? "未完了に戻す" : "整理完了にする"}
            </button>
            {selectedItem.guide && (
              <button className="text-button" type="button" onClick={() => setView("plan")}>
                整理プランを見る →
              </button>
            )}
          </div>
        </section>
      ) : view === "plan" ? (
        <section className="guest-content guest-plan" aria-labelledby="guest-plan-title">
          <button className="inventory-back-link" type="button" onClick={() => setView("list")}>
            ← 持ち物一覧
          </button>
          <h1 id="guest-plan-title">整理プラン</h1>
          <p className="account-lead">
            相談した内容から作ったチェックリストです。予定日と進み具合はこのブラウザーに保存されます。
          </p>
          <label className="guest-date-field">
            引っ越し予定日
            <input
              type="date"
              value={movingDate}
              onChange={(event) => void saveMovingDate(event.currentTarget.value)}
            />
          </label>
          {plannedItems.length === 0 ? (
            <div className="inventory-empty">
              <h2>整理プランはまだありません</h2>
              <p>持ち物を登録して、整理方法を相談してください。</p>
              <button className="text-button" type="button" onClick={() => setView("list")}>
                持ち物一覧へ
              </button>
            </div>
          ) : (
            <ol className="guest-plan-list">
              {plannedItems.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="guest-plan-item"
                    onClick={() => openItem(item.id)}
                  >
                    <span className={`guest-plan-check${item.status === "completed" ? " is-complete" : ""}`}>
                      {item.status === "completed" ? "✓" : ""}
                    </span>
                    <span>
                      <strong>{item.analysis.item.name}</strong>
                      <small>{ACTION_LABELS[item.selectedAction]}</small>
                      <span>{item.guide?.guidance.steps[0] ?? "相談結果を確認してください。"}</span>
                    </span>
                    <span aria-hidden="true">›</span>
                  </button>
                  {item.guide && (
                    <ul className="guest-plan-steps">
                      {item.guide.guidance.steps.map((step) => <li key={step}>{step}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p className="guest-plan-note">
            ゲストモードではAIによる自動スケジュール生成は行わず、相談結果をもとにしたチェックリストを作成します。
          </p>
        </section>
      ) : (
        <section className="guest-content guest-list" aria-labelledby="guest-list-title">
          <div className="guest-page-heading">
            <div>
              <h1 id="guest-list-title">持ち物一覧</h1>
              <p>撮影して、あとで整理方法を相談できます。</p>
            </div>
            <span>{items.length} 件</span>
          </div>
          {items.length === 0 ? (
            <div className="inventory-empty">
              <h2>まだ持ち物がありません</h2>
              <p>写真を登録して、AI識別を試してみましょう。</p>
            </div>
          ) : (
            <ul className="inventory-card-grid">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className="inventory-card guest-item-card"
                    onClick={() => openItem(item.id)}
                  >
                    <span className="inventory-card-photo">
                      {photoUrls[item.id] && (
                        <img src={photoUrls[item.id]} alt="" loading="lazy" />
                      )}
                    </span>
                    <span className="inventory-card-copy">
                      <strong>{item.analysis.item.name}</strong>
                      <span className="inventory-status inventory-status-pending">
                        <span aria-hidden="true" />
                        {item.status === "completed"
                          ? "完了"
                          : item.selectedAction
                            ? "プランあり"
                            : "未整理"}
                      </span>
                    </span>
                    <span className="inventory-card-arrow" aria-hidden="true">→</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <button className="inventory-photo-cta" type="button" onClick={openAdd}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7.5h3l1.4-2h7.2l1.4 2h3v11H4z" />
              <circle cx="12" cy="13" r="3.2" />
            </svg>
            写真を追加する
          </button>
        </section>
      )}
      <footer className="footer guest-footer">
        <span>ものさき。</span>
        <span>ゲストモード — データはこのブラウザー内に保存</span>
      </footer>
    </main>
  );
}
