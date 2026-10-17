"use client";

import { useMemo, useState } from "react";
import { MOCK_ANALYSIS } from "../fixtures/mock-analysis";
import { analyzeImage } from "../lib/api-client";
import {
  buildPipeline2Input,
  isItemEdited,
} from "../lib/recognition-workflow";
import { validateImageFile } from "../lib/image-validation";
import {
  AnalyzeResponseSchema,
  type Action,
  type AnalyzeResponse,
  type ItemCategory,
  type Pipeline2Input,
  type RecognizedItem,
} from "../types/recognition";

export type AnalysisMode = "mock" | "real";
export type WorkflowStatus =
  | "idle"
  | "preview"
  | "analyzing"
  | "result"
  | "confirmed";

const MOCK_DELAY_MS = 450;

const MANUAL_ENTRY: AnalyzeResponse = {
  item: {
    name: "不明な物品",
    category: "other",
    condition: {
      grade: null,
      observations: [],
      needsUserConfirmation: true,
    },
  },
  recommendation: {
    action: null,
    reason: "写真から判断できないため、物品情報を入力してください。",
  },
};

export function useRecognition() {
  const [mode, setMode] = useState<AnalysisMode>("mock");
  const [status, setStatus] = useState<WorkflowStatus>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [response, setResponse] = useState<AnalyzeResponse | null>(null);
  const [originalItem, setOriginalItem] = useState<RecognizedItem | null>(null);
  const [item, setItem] = useState<RecognizedItem | null>(null);
  const [selectedAction, setSelectedAction] = useState<Action | null>(null);
  const [pipeline2Input, setPipeline2Input] =
    useState<Pipeline2Input | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isManualEntry, setIsManualEntry] = useState(false);

  const isEdited = useMemo(
    () =>
      originalItem !== null &&
      item !== null &&
      isItemEdited(originalItem, item),
    [item, originalItem],
  );

  function changeMode(nextMode: AnalysisMode) {
    if (nextMode === mode) return;
    setMode(nextMode);
    setResponse(null);
    setOriginalItem(null);
    setItem(null);
    setSelectedAction(null);
    setPipeline2Input(null);
    setError(null);
    setIsManualEntry(false);
    setStatus(file ? "preview" : "idle");
  }

  function selectFile(nextFile: File | null) {
    setError(null);
    setResponse(null);
    setOriginalItem(null);
    setItem(null);
    setSelectedAction(null);
    setPipeline2Input(null);
    setIsManualEntry(false);

    if (!nextFile) {
      setFile(null);
      setStatus("idle");
      return;
    }

    const validationError = validateImageFile(nextFile);
    if (validationError) {
      setFile(null);
      setStatus("idle");
      setError(validationError);
      return;
    }

    setFile(nextFile);
    setStatus("preview");
  }

  async function analyze(): Promise<boolean> {
    if (!file || status === "analyzing") return false;

    setStatus("analyzing");
    setError(null);
    setPipeline2Input(null);
    setSelectedAction(null);
    setIsManualEntry(false);

    try {
      let result: AnalyzeResponse;
      if (mode === "mock") {
        await new Promise((resolve) => setTimeout(resolve, MOCK_DELAY_MS));
        result = AnalyzeResponseSchema.parse(MOCK_ANALYSIS);
      } else {
        result = await analyzeImage(file);
      }
      setResponse(result);
      setOriginalItem(result.item);
      setItem(result.item);
      setStatus("result");
      return true;
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "画像を分析できませんでした。もう一度お試しください。",
      );
      setStatus("preview");
      return false;
    }
  }

  function beginManualEntry() {
    setResponse(MANUAL_ENTRY);
    setOriginalItem(null);
    setItem(MANUAL_ENTRY.item);
    setSelectedAction(null);
    setPipeline2Input(null);
    setIsManualEntry(true);
    setError(null);
    setStatus("result");
  }

  function updateName(name: string) {
    setItem((current) => (current ? { ...current, name } : current));
    setPipeline2Input(null);
    setStatus("result");
  }

  function updateCategory(category: ItemCategory) {
    setItem((current) => (current ? { ...current, category } : current));
    setPipeline2Input(null);
    setStatus("result");
  }

  function updateGrade(grade: RecognizedItem["condition"]["grade"]) {
    setItem((current) =>
      current
        ? {
            ...current,
            condition: { ...current.condition, grade },
          }
        : current,
    );
    setPipeline2Input(null);
    setStatus("result");
  }

  function chooseAction(action: Action) {
    setSelectedAction(action);
    setPipeline2Input(null);
    setStatus("result");
  }

  function confirm() {
    if (!item || !selectedAction) return;
    setPipeline2Input(buildPipeline2Input(item, selectedAction));
    setStatus("confirmed");
  }

  function reviseConfirmation() {
    setPipeline2Input(null);
    setStatus("result");
  }

  function reset() {
    setFile(null);
    setResponse(null);
    setOriginalItem(null);
    setItem(null);
    setSelectedAction(null);
    setPipeline2Input(null);
    setError(null);
    setIsManualEntry(false);
    setStatus("idle");
  }

  return {
    mode,
    setMode: changeMode,
    status,
    file,
    response,
    item,
    selectedAction,
    pipeline2Input,
    error,
    isEdited,
    isManualEntry,
    selectFile,
    analyze,
    beginManualEntry,
    updateName,
    updateCategory,
    updateGrade,
    chooseAction,
    confirm,
    reviseConfirmation,
    reset,
  };
}
