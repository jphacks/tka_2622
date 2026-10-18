import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MovePlanPageClient } from "../src/components/inventory/MovePlanPageClient";
import type { MovePlan } from "../src/server/move-plan";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => createElement("a", { href, ...props }, children),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function renderMovePlanPage(
  items: Array<{
    id: string;
    imageUrl: string | null;
    name: string;
    action: null;
    status: "pending";
  }>,
  options: { plan?: MovePlan | null; isStale?: boolean } = {},
) {
  return renderToStaticMarkup(
    createElement(MovePlanPageClient, {
      movingDate: null,
      selectedItemCount: 0,
      totalItemCount: items.length,
      completedItemCount: 0,
      items,
      plan: options.plan ?? null,
      isStale: options.isStale ?? false,
      generatedAt: null,
      generationAvailable: true,
    }),
  );
}

describe("MovePlanPageClient", () => {
  it("keeps item details visible when its private image is unavailable", () => {
    const html = renderMovePlanPage([
      {
        id: "item-1",
        imageUrl: null,
        name: "ギター",
        action: null,
        status: "pending",
      },
    ]);

    expect(html).toContain("写真なし");
    expect(html).toContain("ギター");
    expect(html).not.toContain('src="null"');
  });

  it("renders the empty inventory state when there are no items", () => {
    expect(renderMovePlanPage([])).toContain("持ち物がまだありません");
  });

  it("hides a saved schedule when the current inventory makes it stale", () => {
    const stalePlan: MovePlan = {
      summary: "古いギターのプラン",
      tasks: [
        {
          itemId: "123e4567-e89b-42d3-a456-426614174000",
          action: "keep",
          taskTitle: "古いギターの梱包",
          taskDescription: "ギターを梱包する手順です。",
          steps: ["ケースに入れる"],
          daysBeforeMove: 7,
          priority: "medium",
          requiresOfficialConfirmation: false,
        },
      ],
    };
    const html = renderMovePlanPage([], {
      plan: stalePlan,
      isStale: true,
    });

    expect(html).toContain("保存済みの整理方法に変更があります");
    expect(html).toContain("AIで整理プランを更新する");
    expect(html).not.toContain("古いギターのプラン");
    expect(html).not.toContain("古いギターの梱包");
    expect(html).not.toContain("これからのスケジュール");
  });
});
