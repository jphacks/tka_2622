"use client";

import { displayItemCategory } from "../../lib/item-category";
import {
  ActionSchema,
  ItemCategorySchema,
  type Action,
} from "../../types/recognition";
import { Spinner } from "../ui";

const ACTION_LABELS: Record<Action, string> = {
  keep: "保管する",
  sell: "売る",
  give: "譲る",
  dispose: "処分する",
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function texts(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim() !== "")
    : [];
}

interface PreviewRow {
  label: string;
  value: string | string[];
}

function LivePreview({
  status,
  rows,
  footer,
}: {
  status: string;
  rows: PreviewRow[];
  footer?: string;
}) {
  return (
    <section className="ai-live" aria-busy="true">
      <div className="ai-live-status">
        <Spinner />
        <strong role="status" aria-live="polite">
          {status}
        </strong>
      </div>
      {rows.length > 0 && (
        <dl className="ai-live-fields">
          {rows.map((row) => (
            <div key={row.label}>
              <dt>{row.label}</dt>
              {Array.isArray(row.value) ? (
                <dd>
                  <ul>
                    {row.value.map((entry, index) => (
                      <li key={`${index}-${entry}`}>{entry}</li>
                    ))}
                  </ul>
                </dd>
              ) : (
                <dd>{row.value}</dd>
              )}
            </div>
          ))}
        </dl>
      )}
      {footer && <p className="ai-live-note">{footer}</p>}
    </section>
  );
}

/** Shows the photo analysis while Qwen is still writing it. */
export function RecognitionLivePreview({ partial }: { partial: unknown }) {
  const root = record(partial);
  const item = record(root?.item);
  const condition = record(item?.condition);
  const recommendation = record(root?.recommendation);

  const name = text(item?.name);
  const category = ItemCategorySchema.safeParse(item?.category);
  const grade = condition?.grade;
  const observations = texts(condition?.observations);
  const action = ActionSchema.safeParse(recommendation?.action);
  const reason = text(recommendation?.reason);

  const rows: PreviewRow[] = [];
  if (name) rows.push({ label: "物品名", value: name });
  if (category.success) {
    rows.push({
      label: "カテゴリ",
      value: displayItemCategory(category.data, name ?? ""),
    });
  }
  if (typeof grade === "number") {
    rows.push({ label: "外観の状態", value: `${grade}/5` });
  }
  if (observations.length > 0) {
    rows.push({ label: "写真から見えたこと", value: observations });
  }
  if (action.success) {
    rows.push({ label: "おすすめ", value: ACTION_LABELS[action.data] });
  }
  if (reason) rows.push({ label: "理由", value: reason });

  const status = reason || action.success
    ? "整理方法を考えています…"
    : observations.length > 0 || typeof grade === "number"
      ? "状態を確認しています…"
      : name
        ? "物品を識別しています…"
        : "写真を読み込んでいます…";

  return (
    <LivePreview
      status={status}
      rows={rows}
      footer={
        rows.length > 0
          ? "AIが書いている途中の内容です。完了後に確認してから使えます。"
          : undefined
      }
    />
  );
}

/** Shows the move plan while Qwen is still writing it. */
export function MovePlanLivePreview({ partial }: { partial: unknown }) {
  const root = record(partial);
  const summary = text(root?.summary);
  const tasks = Array.isArray(root?.tasks)
    ? root.tasks.flatMap((task) => {
        const title = text(record(task)?.taskTitle);
        return title ? [title] : [];
      })
    : [];

  const rows: PreviewRow[] = [];
  if (summary) rows.push({ label: "概要", value: summary });
  if (tasks.length > 0) {
    rows.push({ label: `作成中のタスク（${tasks.length}件）`, value: tasks });
  }

  return (
    <LivePreview
      status={
        tasks.length > 0
          ? `タスクを書き出しています（${tasks.length}件目）…`
          : summary
            ? "タスクを組み立てています…"
            : "持ち物ごとの整理方法を読み込んでいます…"
      }
      rows={rows}
      footer={
        rows.length > 0
          ? "AIが書いている途中の内容です。完了後に内容を検証してから表示します。"
          : undefined
      }
    />
  );
}
