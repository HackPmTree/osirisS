/**
 * OSIRIS — Состояние слоя «Окопы» (укрепления).
 *
 * В проекте нет Zustand/Redux: слои живут в useState страницы (page.tsx),
 * поэтому здесь — локальный хук с той же ролью, что store: видимость
 * слоя, активные фильтры типа/статуса и загрузка данных.
 *
 * Источники (оба реальные, честная маркировка origin):
 *  • /data/trenches.geojson — демонстрационный файл (ДЕМО);
 *  • GET /api/trenches — хранилище сканера: окопы, реально обнаруженные
 *    CV-сканированием или сохранённые оператором вручную (СКАНЕР).
 * Данные сканера перечитываются по сигналу `scannerVersion` (растёт после
 * сохранения/удаления в модуле «Картограф укреплений»).
 * Фильтры применяются на клиенте — карта остаётся единственным
 * рендерером объектов (никаких React-компонентов на каждый окоп).
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
  /** Все данные из обоих источников (после нормализации). */
  data: StaticTrenchFC | null;
  loading: boolean;
  /** Ошибка загрузки/разбора — панель покажет понятное сообщение. */
  error: string | null;
  /** Всего объектов в обоих источниках. */
  total: number;
  /** Из них — демо-файл и хранилище сканера (для честных счётчиков панели). */
  demoCount: number;
  scannedCount: number;
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

/** Хук-«стор» слоя окопов: загрузка обоих источников + фильтры. */
export function useTrenches(scannerVersion = 0): UseTrenchesResult {
  const [raw, setRaw] = useState<unknown>(null);
  /* GeoJSON из хранилища сканера (/api/trenches) — обновляется по scannerVersion. */
  const [scannedRaw, setScannedRaw] = useState<unknown>(null);
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

  /* Загрузка сохранённых (просканированных) укреплений из хранилища сканера.
     Ошибка не фатальна: сервер может быть недоступен — слой тогда показывает
     только демо-данные, а сканер сообщает о проблеме сам. */
  useEffect(() => {
    let cancelled = false;
    fetch('/api/trenches', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => { if (!cancelled && j?.geojson) setScannedRaw(j.geojson); })
      .catch(() => { /* хранилище недоступно — работаем без него */ });
    return () => { cancelled = true; };
  }, [scannerVersion]);

  const data = useMemo(() => {
    const demo = prepareStaticTrenches(raw, 'demo-file');
    const scanned = prepareStaticTrenches(scannedRaw, 'scanned');
    return { type: 'FeatureCollection' as const, features: [...demo.features, ...scanned.features] };
  }, [raw, scannedRaw]);

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
    demoCount: data.features.filter((f) => f.properties.origin !== 'scanned').length,
    scannedCount: data.features.filter((f) => f.properties.origin === 'scanned').length,
    visibleCount: filtered.features.length,
    typesOn,
    statusesOn,
    toggleType,
    toggleStatus,
    resetFilters,
    filtered,
  };
}
