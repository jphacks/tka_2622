"use client";

import { useCallback, useEffect, useState } from "react";
import {
  StationListResponseSchema,
  type Station,
} from "../types/station";

async function readError(response: Response): Promise<string> {
  const payload: unknown = await response.json().catch(() => null);
  if (
    typeof payload === "object" &&
    payload !== null &&
    "error" in payload &&
    typeof payload.error === "object" &&
    payload.error !== null &&
    "message" in payload.error &&
    typeof payload.error.message === "string"
  ) {
    return payload.error.message;
  }
  return "駅の一覧を取得できませんでした。";
}

export function useStations(
  selectedStationId: string | null,
  onSelectStation: (stationId: string) => void,
) {
  const [stations, setStations] = useState<Station[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadStations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/stations");
      if (!response.ok) throw new Error(await readError(response));
      const payload: unknown = await response.json();
      const parsed = StationListResponseSchema.safeParse(payload);
      if (!parsed.success) throw new Error("駅の一覧を読み取れませんでした。");
      setStations(parsed.data.stations);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "駅の一覧を読み込めませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStations();
  }, [loadStations]);

  return {
    stations,
    loading,
    error,
    selectedStationId,
    selectStation: onSelectStation,
    loadStations,
  };
}
