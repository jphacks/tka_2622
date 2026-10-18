"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DisposalAreaListResponseSchema,
  DisposalMunicipalityListResponseSchema,
  type DisposalArea,
  type DisposalMunicipality,
} from "../../types/disposal";
import { Button } from "../ui";

interface DisposalLocationSelectorProps {
  municipalityCode: string | null;
  area: string | null;
  onChange: (municipalityCode: string, area: string | null) => void;
}

async function fetchJson(url: string): Promise<unknown> {
  const response = await fetch(url);
  if (!response.ok) throw new Error();
  return response.json();
}

export function DisposalLocationSelector({
  municipalityCode,
  area,
  onChange,
}: DisposalLocationSelectorProps) {
  const [municipalities, setMunicipalities] = useState<DisposalMunicipality[]>(
    [],
  );
  const [areas, setAreas] = useState<DisposalArea[]>([]);
  const [loadingMunicipalities, setLoadingMunicipalities] = useState(true);
  const [loadingAreas, setLoadingAreas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMunicipalities = useCallback(async () => {
    setLoadingMunicipalities(true);
    setError(null);
    try {
      const parsed = DisposalMunicipalityListResponseSchema.parse(
        await fetchJson("/api/disposal/municipalities"),
      );
      setMunicipalities(parsed.municipalities);
    } catch {
      setError("区市町村の一覧を読み込めませんでした。");
    } finally {
      setLoadingMunicipalities(false);
    }
  }, []);

  useEffect(() => {
    void loadMunicipalities();
  }, [loadMunicipalities]);

  const selected = municipalities.find(({ code }) => code === municipalityCode);

  useEffect(() => {
    if (!selected?.hasSchedule) {
      setAreas([]);
      return;
    }
    let cancelled = false;
    setLoadingAreas(true);
    setError(null);
    fetchJson(`/api/disposal/areas?municipality=${selected.code}`)
      .then((payload) => {
        if (!cancelled) {
          setAreas(DisposalAreaListResponseSchema.parse(payload).areas);
        }
      })
      .catch(() => {
        if (!cancelled) setError("地域の一覧を読み込めませんでした。");
      })
      .finally(() => {
        if (!cancelled) setLoadingAreas(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.code, selected?.hasSchedule]);

  const withSchedule = municipalities.filter(({ hasSchedule }) => hasSchedule);
  const withoutSchedule = municipalities.filter(
    ({ hasSchedule }) => !hasSchedule,
  );

  return (
    <div className="disposal-location">
      <label className="field">
        <span>区市町村（東京都）</span>
        <select
          value={municipalityCode ?? ""}
          disabled={loadingMunicipalities}
          onChange={(event) => {
            if (event.target.value) onChange(event.target.value, null);
          }}
        >
          <option value="" disabled>
            {loadingMunicipalities ? "読み込んでいます…" : "選択してください"}
          </option>
          <optgroup label="収集曜日を表示できる区市町村">
            {withSchedule.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </optgroup>
          <optgroup label="公式サイトで確認する区市町村">
            {withoutSchedule.map(({ code, name }) => (
              <option key={code} value={code}>
                {name}
              </option>
            ))}
          </optgroup>
        </select>
      </label>

      {selected?.hasSchedule && (
        <label className="field">
          <span>地域（町丁目）</span>
          <select
            value={area ?? ""}
            disabled={loadingAreas || areas.length === 0}
            onChange={(event) => {
              if (event.target.value) {
                onChange(selected.code, event.target.value);
              }
            }}
          >
            <option value="" disabled>
              {loadingAreas ? "読み込んでいます…" : "選択してください"}
            </option>
            {areas.map(({ name, note }) => (
              <option key={name} value={name}>
                {note ? `${name}（${note}）` : name}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <div className="notice notice-error" role="alert">
          <p>{error}</p>
          <Button
            variant="text"
            type="button"
            onClick={() => void loadMunicipalities()}
          >
            再読み込み
          </Button>
        </div>
      )}
    </div>
  );
}
