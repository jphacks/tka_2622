"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { moveDateForTask } from "../../lib/move-plan-date";
import type { MovePlan } from "../../server/move-plan";

type ItemStatus = "pending" | "in_progress" | "completed";

interface MovePlanItemCard {
  id: string;
  imageUrl: string | null;
  name: string;
  action: MovePlan["tasks"][number]["action"] | null;
  status: ItemStatus;
}

interface MovePlanPageClientProps {
  movingDate: string | null;
  selectedItemCount: number;
  totalItemCount: number;
  completedItemCount: number;
  items: MovePlanItemCard[];
  plan: MovePlan | null;
  isStale: boolean;
  generatedAt: string | null;
  generationAvailable: boolean;
}

const ACTION_LABELS: Record<MovePlan["tasks"][number]["action"], string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

const STATUS_LABELS: Record<ItemStatus, string> = {
  pending: "未整理",
  in_progress: "対応中",
  completed: "完了",
};

interface ApiErrorResponse {
  error?: { message?: string };
}

function formatMoveDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function formatTaskDate(movingDate: string | null, daysBeforeMove: number) {
  const dateValue = moveDateForTask(movingDate, daysBeforeMove);
  if (!dateValue) return `引っ越し${daysBeforeMove}日前`;
  const [year, month, day] = dateValue.split("-").map(Number);
  return `${year}年${month}月${day}日`;
}

function priorityLabel(priority: "high" | "medium" | "low") {
  if (priority === "high") return "優先度：高";
  if (priority === "low") return "優先度：低";
  return "優先度：中";
}

export function MovePlanPageClient({
  movingDate,
  selectedItemCount,
  totalItemCount,
  completedItemCount,
  items,
  plan: initialPlan,
  isStale: initialIsStale,
  generatedAt: initialGeneratedAt,
  generationAvailable,
}: MovePlanPageClientProps) {
  const router = useRouter();
  const [plan, setPlan] = useState(initialPlan);
  const [isStale, setIsStale] = useState(initialIsStale);
  const [generatedAt, setGeneratedAt] = useState(initialGeneratedAt);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    setPlan(initialPlan);
    setIsStale(initialIsStale);
    setGeneratedAt(initialGeneratedAt);
  }, [initialPlan, initialIsStale, initialGeneratedAt]);

  async function generatePlan() {
    if (isGenerating || selectedItemCount === 0 || !generationAvailable) return;
    setIsGenerating(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/items/plan", { method: "POST" });
      const body = (await response.json()) as {
        plan?: MovePlan;
        generatedAt?: string | null;
        error?: ApiErrorResponse["error"];
      };
      if (!response.ok || !body.plan) {
        throw new Error(
          body.error?.message ??
            "整理プランを作成できませんでした。もう一度お試しください。",
        );
      }
      setPlan(body.plan);
      setGeneratedAt(body.generatedAt ?? null);
      setIsStale(false);
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error
          ? error.message
          : "整理プランを作成できませんでした。もう一度お試しください。",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  const hasPlan = plan !== null;
  const shouldGenerate = !hasPlan || isStale;
  const timelineGroups = plan
    ? [...new Set(plan.tasks.map((task) => task.daysBeforeMove))]
        .sort((left, right) => right - left)
        .map((daysBeforeMove) => ({
          daysBeforeMove,
          tasks: plan.tasks.filter(
            (task) => task.daysBeforeMove === daysBeforeMove,
          ),
        }))
    : [];

  return (
    <section className="move-plan-page" aria-labelledby="move-plan-title">
      <Link className="move-plan-back" href="/items">
        ← 持ち物一覧
      </Link>
      <header className="move-plan-heading">
        <h1 id="move-plan-title">引っ越し整理プラン</h1>
      </header>

      <section className="move-plan-overview" aria-label="準備状況">
        <dl>
          <div>
            <dt>引っ越し予定日</dt>
            <dd>
              {movingDate ? formatMoveDate(movingDate) : "未設定"}
              {!movingDate && (
                <>
                  {" "}
                  <Link href="/settings">設定する</Link>
                </>
              )}
            </dd>
          </div>
          <div>
            <dt>整理方法が決まった持ち物</dt>
            <dd>
              {selectedItemCount} / {totalItemCount} 件
            </dd>
          </div>
          <div>
            <dt>整理が完了した持ち物</dt>
            <dd>
              {completedItemCount} / {totalItemCount} 件
            </dd>
          </div>
        </dl>
      </section>

      {shouldGenerate && (
        <section className="move-plan-generation" aria-live="polite">
          {isGenerating ? (
            <div className="move-plan-loading" role="status">
              <span className="move-plan-spinner" aria-hidden="true" />
              <strong>引っ越し整理プランを作成しています…</strong>
              <p>
                持ち物ごとの整理方法をまとめ、引っ越しまでの予定を考えています。
              </p>
            </div>
          ) : (
            <>
              <button
                className="move-plan-generate-button"
                type="button"
                onClick={generatePlan}
                disabled={selectedItemCount === 0 || !generationAvailable}
                aria-describedby={
                  generationAvailable ? undefined : "move-plan-migration-required"
                }
              >
                {hasPlan
                  ? "AIで整理プランを更新する"
                  : "AIで整理プランを生成する"}
              </button>
              {!generationAvailable && (
                <p
                  id="move-plan-migration-required"
                  className="move-plan-note"
                  role="status"
                >
                  現在プランを作成できません。管理者にお問い合わせください。
                </p>
              )}
            </>
          )}
          {errorMessage && (
            <p className="move-plan-error" role="alert">
              {errorMessage}
            </p>
          )}
        </section>
      )}


      <details className="move-plan-source" open={!hasPlan}>
        <summary className="move-plan-section-heading">
          <h2 id="move-plan-source-title">持ち物と整理方法</h2>
          <span>{selectedItemCount} 件が対象</span>
        </summary>
        {items.length === 0 ? (
          <p className="move-plan-empty">
            持ち物がまだありません。写真を登録すると、整理プランに含められます。
          </p>
        ) : (
          <ul className="move-plan-item-list">
            {items.map((item) => (
              <li key={item.id} className="move-plan-item">
                <span className="move-plan-item-photo">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" />
                  ) : (
                    <span className="move-plan-item-photo-placeholder">
                      写真なし
                    </span>
                  )}
                </span>
                <div className="move-plan-item-copy">
                  <strong>{item.name}</strong>
                  <span>
                    {item.action
                      ? ACTION_LABELS[item.action]
                      : "整理方法は未決定"}
                    {" ・ "}
                    {STATUS_LABELS[item.status]}
                  </span>
                </div>
                {item.action && (
                  <Link
                    href={`/items/${item.id}/consult`}
                    className="move-plan-item-link"
                    aria-label={`${item.name}の整理プランを見る`}
                  >
                    →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
        {totalItemCount > selectedItemCount && (
          <p className="move-plan-note">
            整理方法が未決定の持ち物は、プラン生成の対象に含まれません。
          </p>
        )}
        {selectedItemCount > 0 && !hasPlan && (
          <p className="move-plan-note" role="status">
            現在決まっている{selectedItemCount}件をもとにプランを作成できます。
          </p>
        )}
        {hasPlan && isStale && (
          <p className="move-plan-note" role="status">
            保存済みの整理方法に変更があります。プランを更新してください。
          </p>
        )}
      </details>

      {hasPlan && !isStale && (
        <section className="move-plan-timeline" aria-labelledby="timeline-title">
          <div className="move-plan-section-heading">
            <div>
              <h2 id="timeline-title">これからのスケジュール</h2>
            </div>
          </div>
          <p className="move-plan-summary">{plan.summary}</p>
          {generatedAt && (
            <p className="move-plan-generated-at">
              作成日：{formatMoveDate(generatedAt.slice(0, 10))}
            </p>
          )}
          <ol className="move-plan-timeline-groups">
            {timelineGroups.map((group) => (
              <li key={group.daysBeforeMove} className="move-plan-timeline-group">
                <h3>
                  {movingDate
                    ? formatTaskDate(movingDate, group.daysBeforeMove)
                    : `引っ越し${group.daysBeforeMove}日前`}
                  <span>
                    {movingDate
                      ? `引っ越し${group.daysBeforeMove}日前の目安`
                      : "の目安"}
                  </span>
                </h3>
                <ul>
                  {group.tasks.map((task, index) => {
                    const item = items.find(({ id }) => id === task.itemId);
                    return (
                      <li
                        key={`${task.itemId}-${task.taskTitle}-${index}`}
                        className="move-plan-task"
                        data-action={task.action}
                      >
                        <div className="move-plan-task-heading">
                          <strong>{task.taskTitle}</strong>
                          <span data-priority={task.priority}>{priorityLabel(task.priority)}</span>
                        </div>
                        <p>{task.taskDescription}</p>
                        <ol>
                          {task.steps.map((step) => (
                            <li key={step}>{step}</li>
                          ))}
                        </ol>
                        {task.requiresOfficialConfirmation && (
                          <p className="move-plan-official-note">
                            公式情報の確認が必要です。自治体などの最新情報をご確認ください。
                          </p>
                        )}
                        {item && (
                          <Link
                            href={`/items/${item.id}/consult`}
                            className="move-plan-task-link"
                          >
                            {item.name}の整理プランを見る →
                          </Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ol>
        </section>
      )}

      {!shouldGenerate && hasPlan && isStale === false && errorMessage && (
        <p className="move-plan-error" role="alert">
          {errorMessage}
        </p>
      )}
    </section>
  );
}
