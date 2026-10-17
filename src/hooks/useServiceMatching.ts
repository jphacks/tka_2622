"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ServiceMatchResponseSchema,
  type ServiceMatchResponse,
} from "../types/service";
import {
  StationListResponseSchema,
  type Station,
} from "../types/station";
import type { Pipeline2Input } from "../types/recognition";

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
  return "サービスを取得できませんでした。時間をおいて再度お試しください。";
}

export function useServiceMatching(input: Pipeline2Input) {
  const [stations, setStations] = useState<Station[]>([]);
  const [stationsLoading, setStationsLoading] = useState(true);
  const [stationsError, setStationsError] = useState<string | null>(null);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [result, setResult] = useState<ServiceMatchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStations = useCallback(async () => {
    setStationsLoading(true);
    setStationsError(null);
    try {
      const response = await fetch("/api/stations");
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload: unknown = await response.json();
      const parsed = StationListResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("駅の一覧を読み取れませんでした。");
      }
      setStations(parsed.data.stations);
    } catch (loadError) {
      setStationsError(
        loadError instanceof Error
          ? loadError.message
          : "駅の一覧を読み込めませんでした。",
      );
    } finally {
      setStationsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStations();
  }, [loadStations]);

  function selectStation(stationId: string) {
    setSelectedStationId(stationId);
    setResult(null);
    setError(null);
  }

  const search = useCallback(async () => {
    if (!selectedStationId || loading) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/services/match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, stationId: selectedStationId }),
      });
      if (!response.ok) {
        throw new Error(await readError(response));
      }
      const payload: unknown = await response.json();
      const parsed = ServiceMatchResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new Error("サービスの検索結果を読み取れませんでした。");
      }
      setResult(parsed.data);
    } catch (searchError) {
      setResult(null);
      setError(
        searchError instanceof Error
          ? searchError.message
          : "近くのサービスを探せませんでした。",
      );
    } finally {
      setLoading(false);
    }
  }, [input, loading, selectedStationId]);

  return {
    stations,
    stationsLoading,
    stationsError,
    selectedStationId,
    result,
    loading,
    error,
    loadStations,
    selectStation,
    search,
  };
}
