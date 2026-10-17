"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { StationSelector } from "../stations/StationSelector";
import { useStations } from "../../hooks/useStations";

type ResidenceType = "apartment" | "dormitory" | "sharehouse";

interface OnboardingFormProps {
  initialResidenceType: string | null;
  initialStationId: string | null;
  isSettings?: boolean;
}

export function OnboardingForm({
  initialResidenceType,
  initialStationId,
  isSettings = false,
}: OnboardingFormProps) {
  const router = useRouter();
  const [residenceType, setResidenceType] = useState<ResidenceType | "">(
    initialResidenceType === "apartment" ||
      initialResidenceType === "dormitory" ||
      initialResidenceType === "sharehouse"
      ? initialResidenceType
      : "",
  );
  const [stationId, setStationId] = useState<string | null>(initialStationId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stations = useStations(stationId, setStationId);

  async function saveProfile() {
    if (!residenceType || !stationId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          residenceType,
          nearestStationId: stationId,
        }),
      });
      const payload: unknown = await response.json();
      if (!response.ok) {
        const message =
          typeof payload === "object" &&
          payload !== null &&
          "error" in payload &&
          typeof payload.error === "object" &&
          payload.error !== null &&
          "message" in payload.error &&
          typeof payload.error.message === "string"
            ? payload.error.message
            : "プロフィールを保存できませんでした。";
        throw new Error(message);
      }
      router.replace("/items");
      router.refresh();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "プロフィールを保存できませんでした。再度お試しください。",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className={isSettings ? "account-panel" : "account-panel onboarding-panel"}
      aria-labelledby="onboarding-title"
    >
      <h1 id="onboarding-title">
        {isSettings ? "プロフィールを更新" : "暮らしのことを教えてください"}
      </h1>
      <p className="account-lead">
        最寄り駅は近くのサービスを探すために使います。住所は保存しません。
      </p>
      <div className={isSettings ? "account-form" : "account-form onboarding-form"}>
        <label className="account-field">
          <span>お住まい</span>
          <select
            value={residenceType}
            onChange={(event) =>
              setResidenceType(event.currentTarget.value as ResidenceType | "")
            }
          >
            <option value="">選択してください</option>
            <option value="apartment">マンション・アパート</option>
            <option value="dormitory">寮</option>
            <option value="sharehouse">シェアハウス</option>
          </select>
        </label>
        <div className="account-station">
          <h2>最寄り駅</h2>
          <p>検索して、普段利用する駅を選んでください。</p>
          <StationSelector
            stations={stations.stations}
            selectedStationId={stations.selectedStationId}
            loading={stations.loading}
            error={stations.error}
            onSelect={stations.selectStation}
            onRetry={() => void stations.loadStations()}
          />
        </div>
        {error && (
          <p className="account-error" role="alert">
            {error}
          </p>
        )}
        <button
          type="button"
          className="account-primary"
          disabled={!residenceType || !stationId || saving}
          onClick={() => void saveProfile()}
        >
          {saving ? "保存しています…" : isSettings ? "変更を保存" : "設定して持ち物へ"}
          {!saving && <span aria-hidden="true">→</span>}
        </button>
      </div>
    </section>
  );
}
