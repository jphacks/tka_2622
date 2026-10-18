import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { Button, EmptyState, LoadingState, RetryableError, Spinner } from "../src/components/ui";

describe("shared UI components", () => {
  it("keeps the primary button's existing account styling and native attributes", () => {
    const html = renderToStaticMarkup(
      createElement(
        Button,
        { type: "submit", disabled: true },
        "設定して持ち物へ",
      ),
    );

    expect(html).toContain('class="account-primary"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("disabled");
    expect(html).toContain("設定して持ち物へ");
  });

  it("supports secondary and text variants without changing their CSS contract", () => {
    const secondary = renderToStaticMarkup(
      createElement(Button, { variant: "secondary", className: "extra" }, "保存"),
    );
    const text = renderToStaticMarkup(
      createElement(Button, { variant: "text", type: "button" }, "再試行"),
    );

    expect(secondary).toContain('class="button-secondary extra"');
    expect(text).toContain('class="text-button"');
    expect(text).toContain('type="button"');
  });

  it("renders accessible loading state with the existing visual classes", () => {
    const html = renderToStaticMarkup(
      createElement(LoadingState, {
        title: "読み込み中",
        description: "少しお待ちください。",
      }),
    );

    expect(html).toContain('class="loading-card"');
    expect(html).toContain('role="status"');
    expect(html).toContain('class="spinner" aria-hidden="true"');
    expect(html).toContain("少しお待ちください。");
  });

  it("renders an empty state with an optional description", () => {
    const html = renderToStaticMarkup(
      createElement(EmptyState, {
        title: "結果がありません",
        description: "条件を変えてください。",
      }),
    );

    expect(html).toContain('class="empty-state"');
    expect(html).toContain('role="status"');
    expect(html).toContain("条件を変えてください。");
  });

  it("renders retryable errors as alerts and keeps the retry action", () => {
    const onRetry = vi.fn();
    const html = renderToStaticMarkup(
      createElement(RetryableError, {
        message: "接続に失敗しました。",
        retryLabel: "再試行",
        onRetry,
      }),
    );

    expect(html).toContain('class="notice notice-error"');
    expect(html).toContain('role="alert"');
    expect(html).toContain("接続に失敗しました。");
    expect(html).toContain("再試行");
  });

  it("hides the reusable spinner from assistive technology", () => {
    expect(renderToStaticMarkup(createElement(Spinner))).toContain(
      'class="spinner" aria-hidden="true"',
    );
  });
});
