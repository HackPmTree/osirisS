/**
 * OSIRIS — Состояние слоя «Окопы» (статический GeoJSON).
 *
 * В проекте нет Zustand/Redux: слои живут в useState страницы (page.tsx),
 * поэтому здесь — локальный хук с той же ролью, что store: видимость
 * слоя, активные фильтры типа/статуса и загрузка данных из файла.
 * Фильтры применяются на клиенте setData() — карта остаётся единственным
 * рендерером объектов (ТЗ: никаких React-компонентов на каждый окоп).
 */

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { prepareStaticTrenches, type StaticTrenchFC } from '@/lib/trench-static';
import {
  ALL_TRENCH_STATUSES,
  ALL_TRENCH_TYPES,
  type TrenchStatus,
  type TrenchType,
} from '@/types/trench';

/** Путь к статическому файлу данных (public/data/trenches.geojson). */
export const TRENCH_DATA_URL = '/data/trenches.geojson';

export interface UseTrenchesResult {
  /** Все данные из файла (после нормализации). */
  data: StaticTrenchFC | null;
  loading: boolean;
  /** Ошибка загрузки/разбора — панель покажет понятное сообщение. */
  error: string | null;
  /** Всего объектов в файле. */
  total: number;
  /** Объектов после фильтра. */
  visibleCount: number;
  typesOn: Set<TrenchType>;
  statusesOn: Set<TrenchStatus>;
  toggleType: (t: TrenchType) => void;
  toggleStatus: (s: TrenchStatus) => void;
  resetFilters: () => void;
  /** FeatureCollection только с объектами, прошедшими фильтр, — кладется в источник карты. */
  filtered: StaticTrenchFC;
}

/** Хук-«стор» слоя окопов: загрузка + фильтры. */
export function useTrenches(): UseTrenchesResult {
  const [raw, setRaw] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [typesOn, setTypesOn] = useState<Set<TrenchType>>(() => new Set(ALL_TRENCH_TYPES));
  const [statusesOn, setStatusesOn] = useState<Set<TrenchStatus>>(() => new Set(ALL_TRENCH_STATUSES));

  /* Загрузка статического файла один раз на сессию панели. */
  useEffect(() => {
    let cancelled = false;
    fetch(TRENCH_DATA_URL)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((j) => { if (!cancelled) { setRaw(j); setError(null); } })
      .catch(() => { if (!cancelled) setError('Не удалось загрузить /data/trenches.geojson'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const data = useMemo(() => prepareStaticTrenches(raw), [raw]);

  const filtered = useMemo(
    () => ({
      type: 'FeatureCollection' as const,
      features: data.features.filter(
        (f) => typesOn.has(f.properties.trench_type as TrenchType)
          && statusesOn.has(f.properties.status as TrenchStatus),
      ),
    }),
    [data, typesOn, statusesOn],
  );

  const toggleType = useCallback((t: TrenchType) => {
    setTypesOn((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t); else next.add(t);
      return next;
    });
  }, []);

  const toggleStatus = useCallback((s: TrenchStatus) => {
    setStatusesOn((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  }, []);

  const resetFilters = useCallback(() => {
    setTypesOn(new Set(ALL_TRENCH_TYPES));
    setStatusesOn(new Set(ALL_TRENCH_STATUSES));
  }, []);

  return {
    data,
    loading,
    error,
    total: data.features.length,
    visibleCount: filtered.features.length,
    typesOn,
    statusesOn,
    toggleType,
    toggleStatus,
    resetFilters,
    filtered,
  };
}
