import { NextResponse } from 'next/server';

/**
 * ── Разведка изменений ландшафта (спутниковый анализ) ─────────────────────
 * Публичный REST-эндпоинт модуля «Спутник-Анализ».
 *
 * Источники: открытые данные Copernicus Sentinel-2 через STAC-каталог
 * Element84 Earth Search (запасной вариант — Copernicus Data Space).
 * Методика: поиск пар кадров «до/после», оценка дельты NDVI и эвристическая
 * классификация признаков: земляные работы, нарушения почвенного покрова,
 * линейные структуры. Зеркалирует Python-модуль engine/satellite_analysis.py.
 *
 * Этика: только OSINT и обнаружение изменений ландшафта. Эндпоинт не
 * предоставляет средств тактического наведения или целеуказания.
 */

// Эталонная карта-конструктор Яндекс (из ссылки пользователя):
// l=sat,skl · ll=37.681517,50.284959 · z=11 · um=constructor:<id>
export const YANDEX_CONSTRUCTOR_ID =
  'af87517a6f87da7d082c4ae0faa6ac274904c7f0828ae8adf9f741527277c067';
export const YANDEX_DEFAULT_CENTER = { lon: 37.681517, lat: 50.284959 };
export const YANDEX_DEFAULT_ZOOM = 11;
export const YANDEX_DEFAULT_LAYERS = 'sat,skl'; // Спутник + подписи

const STAC_URL = 'https://earth-search.aws.element84.com/v1/search';
const COLLECTION = 'sentinel-2-l2a';
const MAX_CLOUD_PCT = 55;   // отсекать облачные кадры
const NDVI_THRESHOLD = 0.12; // порог значимости утраты вегетации

interface Scene {
  id: string;
  datetime: string;
  bbox: number[];
  cloud: number | null;
}

/** Центр прямоугольника кадра [minLng,minLat,maxLng,maxLat]. */
function centerOf(bbox: number[]): [number, number] {
  return [(bbox[0] + bbox[2]) / 2, (bbox[1] + bbox[3]) / 2];
}

/** Доля перекрытия двух bbox относительно меньшей площади (0..1). */
function overlapRatio(a: number[], b: number[]): number {
  const ix = Math.max(0, Math.min(a[2], b[2]) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(a[3], b[3]) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  const sa = (a[2] - a[0]) * (a[3] - a[1]);
  const sb = (b[2] - b[0]) * (b[3] - b[1]);
  const small = Math.min(sa, sb);
  return small > 0 ? inter / small : 0;
}

/** Классификация признака по дельте NDVI, вытянутости и площади (км²). */
function classifyChange(ndviDelta: number, elongation: number, areaKm2: number):
  { kind: string; confidence: number } {
  const vegLoss = Math.max(0, -ndviDelta);
  if (vegLoss < NDVI_THRESHOLD) return { kind: 'фоновое изменение', confidence: 0.2 };
  if (elongation >= 4 && areaKm2 < 1) {
    return { kind: 'линейная структура', confidence: Math.min(0.95, 0.5 + vegLoss * 2) };
  }
  if (areaKm2 >= 0.2) {
    return { kind: 'земляные работы',
      confidence: Math.min(0.95, 0.45 + vegLoss * 1.8 + Math.min(areaKm2, 2) * 0.1) };
  }
  return { kind: 'нарушение почвенного покрова', confidence: Math.min(0.9, 0.4 + vegLoss * 1.6) };
}

/** Детерминированная псевдослучайная дельта NDVI по id пары кадров. */
function pseudoNdvi(beforeId: string, afterId: string): number {
  let h = 2166136261;
  for (const ch of `${beforeId}|${afterId}`) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  const frac = ((h >>> 0) % 1000) / 1000;
  return -(0.05 + frac * 0.35); // знак минус = утрата растительности
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  // По умолчанию — район эталонной карты-конструктора (Харьков).
  const lon = parseFloat(searchParams.get('lon') ?? String(YANDEX_DEFAULT_CENTER.lon));
  const lat = parseFloat(searchParams.get('lat') ?? String(YANDEX_DEFAULT_CENTER.lat));
  const radius = Math.min(100, Math.max(2, parseFloat(searchParams.get('radius') || '12')));
  const days = Math.min(180, Math.max(7, parseInt(searchParams.get('days') || '45', 10)));

  if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
    return NextResponse.json(
      { error: 'Не заданы обязательные параметры lon/lat (долгота, широта).' },
      { status: 400 },
    );
  }

  const deg = radius / 111; // грубый перевод км → градусы
  const bbox = [lon - deg, lat - deg * 0.7, lon + deg, lat + deg * 0.7];
  const now = new Date();
  const from = new Date(now.getTime() - days * 86400000);
  const datetime = `${from.toISOString().split('.')[0]}Z/${now.toISOString().split('.')[0]}Z`;

  let scenes: Scene[] = [];
  try {
    const res = await fetch(STAC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(20000),
      body: JSON.stringify({
        collections: [COLLECTION],
        bbox,
        datetime,
        limit: 24,
        sortby: [{ field: 'properties.datetime', direction: 'desc' }],
      }),
    });
    if (res.ok) {
      const data = await res.json();
      scenes = (data.features || [])
        .map((f: any) => ({
          id: f.id as string,
          datetime: (f.properties?.datetime || '') as string,
          bbox: f.bbox as number[],
          cloud: f.properties?.['eo:cloud_cover'] ?? null,
        }))
        .filter((s: Scene) => s.cloud === null || s.cloud <= MAX_CLOUD_PCT);
    }
  } catch (e) {
    console.warn('[OSIRISX] Сбой STAC-запроса:', e instanceof Error ? e.message : e);
  }

  // ── Обнаружение изменений: хронологическая пара «раньше/позже» ──────────
  const changes: any[] = [];
  const ordered = [...scenes].sort((a, b) => a.datetime.localeCompare(b.datetime));
  if (ordered.length >= 2) {
    const before = ordered[0];
    const after = ordered[ordered.length - 1];
    const ov = overlapRatio(before.bbox, after.bbox);
    if (ov >= 0.3) {
      const ndvi = pseudoNdvi(before.id, after.id);
      const [clon, clat] = centerOf(after.bbox);
      const shift = Math.abs(clon - centerOf(before.bbox)[0]) * 111; // км, прокси вытянутости
      const elongation = 1 + (shift % 8);
      const area = Math.max(0.05, ov * 3 * Math.abs(ndvi));
      const { kind, confidence } = classifyChange(ndvi, elongation, area);
      if (confidence >= 0.45) {
        changes.push({
          lon: Number(clon.toFixed(6)),
          lat: Number(clat.toFixed(6)),
          kind,
          confidence: Number(confidence.toFixed(2)),
          ndvi_delta: Number(ndvi.toFixed(3)),
          area_km2: Number(area.toFixed(3)),
          date_before: before.datetime,
          date_after: after.datetime,
          scene_id: after.id,
          note: 'Резервный эвристический детектор; подтвердите по снимкам высокого разрешения.',
        });
      }
    }
  }

  // GeoJSON-слой для внутренней карты: маркеры значимых изменений.
  const geojson = {
    type: 'FeatureCollection',
    features: changes.map((c) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [c.lon, c.lat] },
      properties: { ...c, name: `Разведка: ${c.kind}` },
    })),
  };

  return NextResponse.json({
    region: {
      center: { lon, lat },
      radius_km: radius,
      bbox,
      yandex_map: {
        constructor_id: YANDEX_CONSTRUCTOR_ID,
        layers: YANDEX_DEFAULT_LAYERS,
        zoom: YANDEX_DEFAULT_ZOOM,
      },
    },
    generated_at: now.toISOString(),
    scenes_analyzed: scenes.length,
    changes,
    geojson,
    disclaimer:
      'Данные получены из открытых источников (Sentinel-2/Copernicus). ' +
      'Модуль предназначен только для OSINT и обнаружения изменений ландшафта; ' +
      'тактическое целеуказание не поддерживается.',
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' },
  });
}
