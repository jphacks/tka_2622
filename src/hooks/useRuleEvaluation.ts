"use client";

import { useCallback, useEffect, useState } from "react";
import {
  RuleInputSchema,
  RuleResultSchema,
  type RuleInput,
  type RuleResult,
} from "../server/rules/schemas";

interface EvaluationState {
  result: RuleResult | null;
  loading: boolean;
  error: string | null;
}

export function useRuleEvaluation(input: RuleInput | null) {
  const [state, setState] = useState<EvaluationState>({
    result: null,
    loading: false,
    error: null,
  });
  const [retryCount, setRetryCount] = useState(0);

  const retry = useCallback(() => setRetryCount((current) => current + 1), []);

  useEffect(() => {
    if (!input) {
      setState({ result: null, loading: false, error: null });
      return;
    }

    const parsedInput = RuleInputSchema.safeParse(input);
    if (!parsedInput.success) {
      setState({
        result: null,
        loading: false,
        error: "物品情報を確認できませんでした。内容を見直してください。",
      });
      return;
    }

    const controller = new AbortController();
    setState((current) => ({
      result: current.result,
      loading: true,
      error: null,
    }));

    async function evaluate() {
      try {
        const response = await fetch("/api/rules/evaluate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsedInput.data),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => null);
          const message =
            typeof payload === "object" &&
            payload !== null &&
            "error" in payload &&
            typeof payload.error === "object" &&
            payload.error !== null &&
            "message" in payload.error &&
            typeof payload.error.message === "string"
              ? payload.error.message
              : "整理方法の案内を取得できませんでした。";
          throw new Error(message);
        }

        const payload: unknown = await response.json();
        const parsedResult = RuleResultSchema.safeParse(payload);
        if (!parsedResult.success) {
          throw new Error("案内の形式を確認できませんでした。再度お試しください。");
        }
        setState({
          result: parsedResult.data,
          loading: false,
          error: null,
        });
      } catch (evaluationError) {
        if (controller.signal.aborted) return;
        setState({
          result: null,
          loading: false,
          error:
            evaluationError instanceof Error
              ? evaluationError.message
              : "整理方法の案内を取得できませんでした。",
        });
      }
    }

    void evaluate();
    return () => controller.abort();
  }, [input, retryCount]);

  return { ...state, retry };
}
