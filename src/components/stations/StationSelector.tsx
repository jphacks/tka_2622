"use client";

import { useMemo, useState } from "react";
import type { Station } from "../../types/station";

interface StationSelectorProps {
  stations: Station[];
  selectedStationId: string | null;
  loading: boolean;
  error: string | null;
  onSelect: (stationId: string) => void;
  onRetry: () => void;
}

export function StationSelector({
  stations,
  selectedStationId,
  loading,
  error,
  onSelect,
  onRetry,
}: StationSelectorProps) {
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState(selectedStationId === null);
  const selectedStation = stations.find(({ id }) => id === selectedStationId);
  const matches = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("ja");
    if (!normalizedQuery) return stations;
    return stations.filter(
      (station) =>
        station.name.toLocaleLowerCase("ja").includes(normalizedQuery) ||
        station.lines.some((line) =>
          line.toLocaleLowerCase("ja").includes(normalizedQuery),
        ),
    );
  }, [query, stations]);

  if (selectedStation && !editing) {
    return (
      <div className="selected-station">
        <div>
          <span className="station-caption">選択中の最寄り駅</span>
          <strong>{selectedStation.name}</strong>
          <small>{selectedStation.lines.join("・")}</small>
        </div>
        <button
          className="text-button"
          type="button"
          onClick={() => setEditing(true)}
        >
          駅を変更
        </button>
      </div>
    );
  }

  return (
    <div className="station-picker">
      <label className="field">
        <span>駅名で検索</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例：高田馬場"
          aria-label="駅名で検索"
        />
      </label>
      {loading && (
        <p className="station-status" role="status">駅の一覧を読み込んでいます。</p>
      )}
      {error && (
        <div className="notice notice-error" role="alert">
          <p>{error}</p>
          <button className="text-button" type="button" onClick={onRetry}>
            再読み込み
          </button>
        </div>
      )}
      {!loading && !error && matches.length === 0 && (
        <p className="station-status" role="status">
          該当する駅がありません。別の駅名で検索してください。
        </p>
      )}
      {!loading && !error && matches.length > 0 && (
        <ul className="station-options" aria-label="駅の検索結果">
          {matches.map((station) => (
            <li key={station.id}>
              <button
                type="button"
                className="station-option"
                aria-pressed={station.id === selectedStationId}
                onClick={() => {
                  onSelect(station.id);
                  setEditing(false);
                }}
              >
                <span>
                  <strong>{station.name}</strong>
                  <small>{station.lines.join("・")}</small>
                </span>
                <span aria-hidden="true">→</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selectedStation && (
        <button
          className="text-button"
          type="button"
          onClick={() => setEditing(false)}
        >
          選択中の駅に戻る
        </button>
      )}
    </div>
  );
}
