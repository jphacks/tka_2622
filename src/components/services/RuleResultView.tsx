"use client";

import { JSONUIProvider, Renderer } from "@json-render/react";
import type { RuleResult } from "../../server/rules/schemas";
import { buildRuleResultSpec } from "../../lib/rule-ui/spec-builder";
import { ruleUiRegistry } from "../../lib/rule-ui/registry";
import { EmptyState, LoadingState, RetryableError } from "../ui";

interface RuleResultViewProps {
  result: RuleResult | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  showRecommendation?: boolean;
  showItemSummary?: boolean;
  showActionCta?: boolean;
  stepsFirst?: boolean;
}

export function RuleResultView({
  result,
  loading,
  error,
  onRetry,
  showRecommendation = true,
  showItemSummary = true,
  showActionCta = true,
  stepsFirst = false,
}: RuleResultViewProps) {
  if (loading) {
    return (
      <LoadingState
        title="整理方法を確認しています"
        description="選択した内容に合わせて案内を準備しています。"
      />
    );
  }

  if (error) {
    return (
      <RetryableError
        message={error}
        retryLabel="もう一度読み込む"
        onRetry={onRetry}
      />
    );
  }

  if (!result) {
    return <EmptyState title="整理方法の案内を準備しています" />;
  }

  const spec = buildRuleResultSpec(result, undefined, {
    showRecommendation,
    showItemSummary,
    showActionCta,
    stepsFirst,
  });
  return (
    <JSONUIProvider registry={ruleUiRegistry}>
      <Renderer spec={spec} registry={ruleUiRegistry} />
    </JSONUIProvider>
  );
}
