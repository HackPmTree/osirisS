/**
 * OSIRIS — Статический слой укреплений (окопов).
 *
 * Хранение по ТЗ: файл /public/data/trenches.geojson, без БД и без API.
 * Здесь — подготовка данных для MapLibre: исходный FeatureCollection
 * обогазуется служебными полями (подпись, цвет статуса/типа), чтобы
 * paint-выражения layers были простыми ['get', ...] обращениями.
 */

import {
  featureToTrench,
  TRENCH_STATUS_COLORS,
  TRENCH_TYPE_COLORS,
  TRENCH_TYPE_LABEL_RU,
  type Trench,
} from '@/types/trench';

export interface StaticTrenchFeature {
  type: 'Feature';
  properties: {
    id: string;
    kind: 'fortification';
    trench_type: string;
    status: string;
    /** Подпись на карте: «Траншея · 840 м». */
    label: string;
    color: string;
    point_color: string;
    length_m?: number;
    confidence?: number;
    source?: string;
    notes?: string;
  };
  geometry: { type: string; coordinates: any };
}

export interface StaticTrenchFC {
  type: 'FeatureCollection';
  features: StaticTrenchFeature[];
}

/** Человекочитаемая длина: метры → «840 м» / «1.2 км». */
export function formatLengthM(m?: number): string {
  if (typeof m !== 'number' || !Number.isFinite(m)) return '';
  return m >= 1000 ? `${(m / 1000).toFixed(1).replace('.', ',')} км` : `${Math.round(m)} м`;
}

/** Одна модель Trench → готовая к рендеру GeoJSON Feature. */
export function trenchToRenderFeature(t: Trench): StaticTrenchFeature {
  const ru = TRENCH_TYPE_LABEL_RU[t.type];
  const len = formatLengthM(t.length_m);
  return {
    type: 'Feature',
    properties: {
      id: t.id,
      kind: 'fortification',
      trench_type: t.type,
      status: t.status,
      label: len ? `${ru} · ${len}` : ru,
      color: TRENCH_STATUS_COLORS[t.status],
      point_color: TRENCH_TYPE_COLORS[t.type],
      length_m: t.length_m,
      confidence: t.confidence,
      source: t.source,
      notes: t.notes,
    },
    geometry: t.geometry as unknown as { type: string; coordinates: any },
  };
}

/**
 * Привести загруженный из /data/trenches.geojson объект к размеченному FC.
 * Битые записи отбрасываются молча — слой не должен падать из-за одной строки.
 */
export function prepareStaticTrenches(raw: unknown): StaticTrenchFC {
  const features: StaticTrenchFeature[] = [];
  const src = (raw as any)?.features;
  if (!Array.isArray(src)) return { type: 'FeatureCollection', features };
  src.forEach((f: any, i: number) => {
    const t = featureToTrench(f, i);
    if (t) features.push(trenchToRenderFeature(t));
  });
  return { type: 'FeatureCollection', features };
}
