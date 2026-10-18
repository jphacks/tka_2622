"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type InventoryFilter = "all" | "pending" | "in_progress" | "completed";

interface InventoryItem {
  id: string;
  name: string | null;
  analysisStatus: string;
  status: string;
  selectedAction: string | null;
  imageUrl: string;
}

interface InventoryCollectionProps {
  items: InventoryItem[];
  movePlan: {
    movingDate: string | null;
    totalItemCount: number;
    selectedItemCount: number;
    completedItemCount: number;
    hasPlan: boolean;
    needsUpdate: boolean;
  };
}

const FILTERS: { id: InventoryFilter; label: string }[] = [
  { id: "all", label: "すべて" },
  { id: "pending", label: "未整理" },
  { id: "in_progress", label: "対応中" },
  { id: "completed", label: "完了" },
];

function getItemStatus(item: InventoryItem): {
  label: string;
  kind: "pending" | "in-progress" | "completed" | "attention";
} {
  if (item.analysisStatus === "processing") {
    return { label: "分析中", kind: "in-progress" };
  }
  if (item.analysisStatus === "failed") {
    return { label: "要確認", kind: "attention" };
  }
  if (item.status === "completed") {
    return { label: "完了", kind: "completed" };
  }
  if (item.status === "in_progress") {
    return { label: "対応中", kind: "in-progress" };
  }
  if (item.analysisStatus === "succeeded" && item.selectedAction) {
    return { label: "プランあり", kind: "in-progress" };
  }
  return { label: "未整理", kind: "pending" };
}

export function InventoryCollection({
  items,
  movePlan,
}: InventoryCollectionProps) {
  const [activeFilter, setActiveFilter] = useState<InventoryFilter>("all");
  const counts = useMemo(
    () => ({
      all: items.length,
      pending: items.filter((item) => item.status === "pending").length,
      in_progress: items.filter((item) => item.status === "in_progress").length,
      completed: items.filter((item) => item.status === "completed").length,
    }),
    [items],
  );
  const filteredItems =
    activeFilter === "all"
      ? items
      : items.filter((item) => item.status === activeFilter);

  return (
    <>
      <section className="inventory-collection" aria-labelledby="inventory-title">
        <div className="inventory-collection-heading">
          <h1 id="inventory-title">持ち物一覧</h1>
          <p>撮影して、あとでAIに相談できます</p>
        </div>
        <div className="inventory-filters" role="group" aria-label="持ち物の状態">
          {FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={activeFilter === filter.id}
              onClick={() => setActiveFilter(filter.id)}
            >
              {filter.label} <span>{counts[filter.id]}</span>
            </button>
          ))}
        </div>
        {activeFilter === "all" && (
          <section
            className="move-preparation-card"
            aria-labelledby="move-preparation-title"
          >
            <div className="move-preparation-heading">
              <div>
                <h2 id="move-preparation-title">引っ越し準備</h2>
                <p>整理方法が決まった持ち物</p>
              </div>
              <p className="move-preparation-count">
                <strong>{movePlan.selectedItemCount}</strong>
                <span> / {movePlan.totalItemCount} 件</span>
              </p>
            </div>
            <div
              className="move-preparation-progress"
              role="progressbar"
              aria-label="整理方法が決まった持ち物の割合"
              aria-valuemin={0}
              aria-valuemax={Math.max(1, movePlan.totalItemCount)}
              aria-valuenow={movePlan.selectedItemCount}
            >
              <span
                style={{
                  width:
                    movePlan.totalItemCount === 0
                      ? "0%"
                      : `${Math.min(
                          100,
                          (movePlan.selectedItemCount / movePlan.totalItemCount) *
                            100,
                        )}%`,
                }}
              />
            </div>
            <div className="move-preparation-details">
              <p>
                <span>整理完了</span>
                <strong>{movePlan.completedItemCount} 件</strong>
              </p>
              <p>
                <span>引っ越し予定日</span>
                {movePlan.movingDate ? (
                  <strong>
                    {`${Number(movePlan.movingDate.slice(5, 7))}月${Number(
                      movePlan.movingDate.slice(8, 10),
                    )}日`}
                  </strong>
                ) : (
                  <Link href="/settings">未設定・設定する</Link>
                )}
              </p>
            </div>
            <Link className="move-preparation-link" href="/items/plan">
              {movePlan.needsUpdate
                ? "引っ越しプランを更新する"
                : movePlan.hasPlan
                  ? "引っ越しプランを見る"
                  : "引っ越しプランへ"}
              <span aria-hidden="true">›</span>
            </Link>
          </section>
        )}
        {items.length === 0 ? (
          <div className="inventory-empty inventory-collection-empty">
            <h2>まだ持ち物がありません</h2>
            <p>写真を1枚登録して、引っ越しの準備を始めましょう。</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <p className="inventory-filter-empty" role="status">
            この状態の持ち物はありません。
          </p>
        ) : (
          <ul className="inventory-card-grid">
            {filteredItems.map((item) => {
              const status = getItemStatus(item);
              return (
                <li key={item.id}>
                  <Link
                    href={`/items/${item.id}`}
                    className="inventory-card"
                    aria-label={`${item.name ?? "分析待ちの持ち物"}、${status.label}。詳細を開く`}
                  >
                    <span className="inventory-card-photo">
                      <img
                        src={item.imageUrl}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                    </span>
                    <span className="inventory-card-copy">
                      <strong>{item.name ?? "分析待ちの持ち物"}</strong>
                      <span className={`inventory-status inventory-status-${status.kind}`}>
                        <span aria-hidden="true" />
                        {status.label}
                      </span>
                    </span>
                    <span className="inventory-card-arrow" aria-hidden="true">
                      →
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <Link className="inventory-photo-cta" href="/items/new">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 7.5h3l1.4-2h7.2l1.4 2h3v11H4z" />
          <circle cx="12" cy="13" r="3.2" />
        </svg>
        写真を追加する
      </Link>
    </>
  );
}
