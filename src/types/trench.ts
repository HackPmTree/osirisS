/**
 * OSIRIS — Модель данных «окоп» (укрепление).
 *
 * Только отображение: редактирование / аналитика / БД здесь не нужны.
 * Источник геометрии — статический GeoJSON /public/data/trenches.geojson
 * (см. src/lib/trench-static.ts). Каждая Feature содержит properties,
 * соответствующие полям Trench ниже.
 */

/** Тип фортификационного объекта. */
export type TrenchType = 'trench' | 'bunker' | 'foxhole' | 'pillbox';

/** Боевой статус объекта. */
export type TrenchStatus = 'active' | 'abandoned' | 'destroyed' | 'unknown';

/** Укрепление: линия траншеи (LineString) или точечный объект (Point). */
export interface Trench {
  id: string;
  type: TrenchType;
  status: TrenchStatus;
  /** GeoJSON-геометрия: LineString для траншей, Point для блиндажей/ОТ. */
  geometry:
    | { type: 'LineString'; coordinates: [number, number][] }
    | { type: 'Point'; coordinates: [number, number] };
  /** Длина в метрах (для линий). */
  length_m?: number;
  /** Достоверность разведданных 0..1. */
  confidence?: number;
  /** Источник данных (OSINT, спутник, наземная разведка…). */
  source?: string;
  notes?: string;
}

/** Русские подписи типов — для панели, popup и подписей на карте. */
export const TRENCH_TYPE_LABEL_RU: Record<TrenchType, string> = {
  trench: 'Траншея',
  bunker: 'Блиндаж',
  foxhole: 'Окоп (позиция)',
  pillbox: 'ДОТ (огневая точка)',
};

/** Русские подписи статусов. */
export const TRENCH_STATUS_LABEL_RU: Record<TrenchStatus, string> = {
  active: 'Активный',
  abandoned: 'Заброшенный',
  destroyed: 'Уничтоженный',
  unknown: 'Неизвестный',
};

/**
 * Цветовая кодировка статуса (ТЗ):
 *  active — яркий красный; abandoned — серый (пунктир);
 *  destroyed — полупрозрачный красный; unknown — жёлтый.
 */
export const TRENCH_STATUS_COLORS: Record<TrenchStatus, string> = {
  active: '#e63946',
  abandoned: '#888888',
  destroyed: '#ff2d2d',
  unknown: '#ffd166',
};

/** Прозрачность линии по статусу (destroyed — красный с прозрачностью). */
export const TRENCH_STATUS_OPACITY: Record<TrenchStatus, number> = {
  active: 0.95,
  abandoned: 0.8,
  destroyed: 0.5,
  unknown: 0.9,
};

/** Цвет точки по типу объекта (circle-layer). */
export const TRENCH_TYPE_COLORS: Record<TrenchType, string> = {
  trench: '#e63946',
  bunker: '#f4a261',
  foxhole: '#e9c46a',
  pillbox: '#e76f51',
};

/** Все типы/статусы по порядку — для чипов фильтра в панели. */
export const ALL_TRENCH_TYPES: TrenchType[] = ['trench', 'bunker', 'foxhole', 'pillbox'];
export const ALL_TRENCH_STATUSES: TrenchStatus[] = ['active', 'abandoned', 'destroyed', 'unknown'];

/** Узкий тип GeoJSON-объекта, как он лежит в файле. */
interface TrenchGeoJSONFeature {
  type: 'Feature';
  geometry: { type: string; coordinates: any };
  properties?: Partial<Trench> & { id?: string };
}

/**
 * Привести GeoJSON Feature к типизированной модели Trench.
 * Некорректные/неизвестные значения мягко приводятся к дефолтам,
 * чтобы одна битая запись не роняла весь слой.
 */
export function featureToTrench(f: TrenchGeoJSONFeature, index: number): Trench | null {
  const g = f?.geometry;
  if (!g || !Array.isArray(g.coordinates)) return null;
  const isLine = g.type === 'LineString' && g.coordinates.length >= 2;
  const isPoint = g.type === 'Point' && g.coordinates.length >= 2;
  if (!isLine && !isPoint) return null;

  const p = f.properties ?? {};
  const type: TrenchType = (ALL_TRENCH_TYPES as string[]).includes(p.type as string)
    ? (p.type as TrenchType) : 'trench';
  const status: TrenchStatus = (ALL_TRENCH_STATUSES as string[]).includes(p.status as string)
    ? (p.status as TrenchStatus) : 'unknown';

  return {
    id: String(p.id ?? `trench-${index}`),
    type,
    status,
    geometry: {
      type: isLine ? 'LineString' : 'Point',
      coordinates: g.coordinates,
    } as Trench['geometry'],
    length_m: typeof p.length_m === 'number' ? p.length_m : undefined,
    confidence: typeof p.confidence === 'number' ? p.confidence : undefined,
    source: typeof p.source === 'string' ? p.source : undefined,
    notes: typeof p.notes === 'string' ? p.notes : undefined,
  };
}

/**
 * Фильтр ТЗ: по типу и статусу. Возвращает новый GeoJSON FeatureCollection
 * только с прошедшими фильтр объектами — карта перерисовывается setData()
 * на одном источнике, React-компонентов на каждый окоп не создаётся.
 */
export function filterTrenches(
  fc: { type: 'FeatureCollection'; features: TrenchGeoJSONFeature[] },
  types: Set<TrenchType>,
  statuses: Set<TrenchStatus>,
): { type: 'FeatureCollection'; features: TrenchGeoJSONFeature[] } {
  const kept = (fc?.features ?? []).filter((f) => {
    const t = featureToTrench(f, 0);
    if (!t) return false;
    return types.has(t.type) && statuses.has(t.status);
  });
  return { type: 'FeatureCollection', features: kept };
}
