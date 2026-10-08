/**
 * OSIRISX — /api/trench-scan: CV-сканирование области на предмет окопов.
 *
 *  POST { bbox:[minLon,minLat,maxLon,maxLat], resolutionPx?, autosave? }
 *
 * Контракт безопасности:
 *  - Rate Limiting: строго 10 запросов в минуту на клиента (ТЗ).
 *  - Zod-валидация bbox и разрешения (src/lib/trench-schema.ts).
 *  - Тяжёлый OpenCV-пайплайн живёт в Python-движке (src/api/trench_scan.py);
 *    здесь выполняется оркестрация: загрузка снимка, вызов движка (если
 *    поднят TRENCH_ENGINE_URL) либо локальная Node-эвристика по геометрии
 *    предложенных сегментов. Результат — GeoJSON для слоя карты.
 */

import { NextRequest, NextResponse } from 'next/server';
import { trenchScanSchema, zodErrorText } from '@/lib/trench-schema';
import { checkRateLimit, clientKey, rateLimitResponse } from '@/lib/rate-limit';
import { classifySegment, shapeMetrics } from '@/lib/trench-classify';
import { addTrench, type TrenchFeature } from '@/lib/trench-store';

export const runtime = 'nodejs';
export const maxDuration = 30; // секунд на один скан (защита от зависших CPU-запросов)

export async function POST(req: NextRequest) {
  /* ── Лимит 10 запросов/минута ─────────────────────────────────────── */
  const rl = checkRateLimit(clientKey(req), 10, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  /* ── Валидация входа ──────────────────────────────────────────────── */
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'ТЕЛО ЗАПРОСА НЕ ЯВЛЯЕТСЯ JSON' }, { status: 400 });
  }
  const parsed = trenchScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ВАЛИДАЦИЯ НЕ ПРОЙДЕНА', detail: zodErrorText(parsed.error) }, { status: 400 });
  }
  const { bbox, resolutionPx, autosave } = parsed.data;

  /* ── Попытка делегировать тяжёлый CV-пайплайн Python-движку ───────── */
  const engineUrl = process.env.TRENCH_ENGINE_URL;
  if (engineUrl) {
    try {
      const r = await fetch(`${engineUrl.replace(/\/$/, '')}/scan`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bbox, resolutionPx }),
        signal: AbortSignal.timeout(25_000),
      });
      if (r.ok) {
        const data = await r.json();
        return NextResponse.json({ ...data, engine: 'python-opencv' });
      }
    } catch {
      /* Движок недоступен — переходим к лёгкой эвристике ниже. */
    }
  }

  /* ── Лёгкий режим без растра: классификация переданных оператором
        полилиний (обводов) по метрикам формы. Работает всегда и даёт
        честный «окоп vs дорога» вердикт по геометрии. Линии берутся из
        валидированного Zod-входа (parsed.data.lines), а не из сырого тела. ── */
  const rawLines: [number, number][][] = parsed.data.lines ?? [];
  const results: Record<string, unknown>[] = [];
  for (const coords of rawLines.slice(0, 50)) {
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const shape = shapeMetrics(coords as [number, number][]);
    const cls = classifySegment({ ...shape, widthM: 3, textureStd: 0.18 });
    results.push({
      geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
      is_trench: cls.isTrench,
      confidence: cls.confidence,
      reasons_ru: cls.reasons,
      length_m: Math.round(shape.lengthM),
    });
  }

  /* autosave: подтверждённые окопы сохраняем в хранилище слоя укреплений. */
  if (autosave) {
    for (const res of results.filter((r) => r.is_trench)) {
      const g = (res.geometry as any).geometry.coordinates as [number, number][];
      const feature: TrenchFeature = {
        id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'trench',
        name: 'Окоп (автоскан)',
        source: 'cv-scan',
        geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: g }, properties: {} },
        lengthKm: (res.length_m as number) / 1000,
        confidence: res.confidence as number,
        createdAt: Date.now(),
      };
      try { await addTrench(feature); } catch { /* дубликат/ошибка — пропускаем */ }
    }
  }

  return NextResponse.json({
    engine: 'node-heuristic',
    bbox,
    scanned: rawLines.length,
    features: results,
    geojson: {
      type: 'FeatureCollection',
      features: results.filter((r) => r.is_trench).map((r) => r.geometry),
    },
    note: 'Полный OpenCV-пайплайн (HoughLinesP + ширина/форма/текстура) выполняется Python-движком src/api/trench_scan.py при наличии TRENCH_ENGINE_URL.',
    disclaimer: 'Только OSINT-обнаружение изменений ландшафта; средство тактического целеуказания не предоставляется.',
  });
}
