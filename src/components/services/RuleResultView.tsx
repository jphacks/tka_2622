"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import type { RuleResult } from "../../server/rules/schemas";
import { buildRuleResultSpec } from "../../lib/rule-ui/spec-builder";
import { ruleUiRegistry } from "../../lib/rule-ui/registry";

interface RuleResultViewProps {
  result: RuleResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}

export function RuleResultView({
  result,
  loading,
  error,
  onRetry,
}: RuleResultViewProps) {
  if (loading) {
    return (
      <div className="loading-card" role="status" aria-live="polite">
        <span className="spinner" />
        <div>
          <strong>整理方法を確認しています</strong>
          <p>選択した内容に合わせて案内を準備しています。</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="notice notice-error" role="alert">
        <span aria-hidden="true">!</span>
        <p>{error}</p>
        <button className="text-button" type="button" onClick={onRetry}>
          もう一度読み込む
        </button>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="empty-state" role="status">
        <strong>整理方法の案内を準備しています</strong>
      </div>
    );
  }

  const spec = buildRuleResultSpec(result);
  return (
    <JSONUIProvider registry={ruleUiRegistry}>
      <Renderer spec={spec} registry={ruleUiRegistry} />
    </JSONUIProvider>
  );
}
