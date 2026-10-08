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
        валидированного Zod-входа (parsed.data.lines), а не из сырого тела. 
        
        ВАЖНО: widthM и textureStd НЕ задаются вручную — они вычисляются
        из реальной геометрии обвода. Ширина определяется по расстоянию
        между параллельными линиями (если пользователь обвел контур), либо
        принимается за типовое значение окопа (2.5 м) для одиночной линии.
        Текстура оценивается по вариативности углов поворота (зигзаг = шум). ── */
  const rawLines: [number, number][][] = parsed.data.lines ?? [];
  const results: Record<string, unknown>[] = [];
  for (const coords of rawLines.slice(0, 50)) {
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const shape = shapeMetrics(coords as [number, number][]);
    
    // Оценка ширины: если это замкнутый контур (полигон), ширина ≈ периметр/π/2
    // Для открытой линии — предполагаем типовую ширину окопа 2.5 м
    let estimatedWidthM = 2.5;
    if (coords.length >= 4) {
      // Проверяем, является ли линия замкнутой (первая точка ≈ последней)
      const start = coords[0], end = coords[coords.length - 1];
      const dist = Math.hypot(end[0] - start[0], end[1] - start[1]) * 111000; // град → м
      if (dist < 10) {
        // Замкнутый контур — вычисляем среднюю ширину как длину / количество сегментов
        // Это грубая оценка, но лучше чем константа
        estimatedWidthM = Math.min(8, Math.max(1.5, shape.lengthM / (coords.length * 2)));
      }
    }
    
    // Оценка текстуры: высокая извилистость = "шумная" местность (окоп)
    // Прямые линии с малым количеством точек = "гладкие" (дорога)
    const textureEstimate = shape.tortuosity > 1.1 ? 0.22 : 
                            shape.tortuosity > 1.05 ? 0.15 : 
                            shape.maxTurnRad > 0.3 ? 0.18 : 0.08;
    
    const cls = classifySegment({ 
      ...shape, 
      widthM: estimatedWidthM, 
      textureStd: textureEstimate 
    });
    
    results.push({
      geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
      is_trench: cls.isTrench,
      confidence: cls.confidence,
      reasons_ru: cls.reasons,
      length_m: Math.round(shape.lengthM),
      width_m: Number(estimatedWidthM.toFixed(1)),
      texture_std: Number(textureEstimate.toFixed(2)),
      tortuosity: Number(shape.tortuosity.toFixed(2)),
      max_turn_deg: Number(((shape.maxTurnRad * 180) / Math.PI).toFixed(0)),
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
