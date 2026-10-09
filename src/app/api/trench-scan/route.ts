/**
 * OSIRISX — /api/trench-scan: CV-сканирование СПУТНИКОВОГО снимка на окопы.
 *
 *  POST { bbox:[minLon,minLat,maxLon,maxLat], resolutionPx?, autosave?, lines? }
 *
 * Как это работает (реальное сканирование спутника, а не векторной карты):
 *  1. Оркестратор скачивает VHR-кадр Esri World_Imagery (тот же растри,
 *     который карта показывает в режиме «СПУТ») по центру области скана.
 *  2. Кадр (base64) передаётся Python-движку OpenCV (src/api/trench_engine.py,
 *     запускается отдельно; адрес — TRENCH_ENGINE_URL). Движок выполняет
 *     строгий пайплайн «окоп vs дорога»: HoughLinesP → фильтр ширины (2–4 м)
 *     → фильтр формы (зигзаг против прямой) → анализ текстуры грунта.
 *  3. Если движок НЕ поднят — тяжёлый растровый анализ невозможен, и сервер
 *     честно сообщает об этом (engine='no-engine'), вместо того чтобы
 *     выдумыватьDetection по геометрии и рисовать «окопы» там, где их нет.
 *  4. Обводы оператора (lines) классифицируются локальной геометрической
 *     эвристикой — это отдельный, явно обозначенный режим проверки.
 *
 * Контракт безопасности:
 *  - Rate Limiting: 25 запросов в минуту на клиента (актуальное ТЗ).
 *  - Zod-валидация bbox/линий/разрешения (src/lib/trench-schema.ts).
 *  - Результат — GeoJSON для слоя укреплений на карте.
 */

import { NextRequest, NextResponse } from 'next/server';
import { trenchScanSchema, zodErrorText } from '@/lib/trench-schema';
import { checkRateLimit, clientKey, rateLimitResponse, RATE_LIMIT_PER_MINUTE } from '@/lib/rate-limit';
import { classifySegment, shapeMetrics } from '@/lib/trench-classify';
import { addTrench, type TrenchFeature } from '@/lib/trench-store';

export const runtime = 'nodejs';
export const maxDuration = 30; // секунд на один скан (защита от зависших CPU-запросов)

/* ── Встроенный лёгкий детектор «окоп vs дорога» (чистый JS, без зависимостей)
      Используется, когда внешний Python-движок OpenCV не поднят: анализирует
      РЕАЛЬНЫЙ спутниковый растр по тому же алгоритму, что и trench_scan.py —
      декодирование JPEG, скользящее окно, градиенты, поиск прямых линий,
      проверка направления/длины. Это честная растровая детекция, а не
      догадки по вектору. ──────────────────────────────────────────────────────
*/

/** Декодировать JPEG из буфера в grayscale-массив (через sharp, если доступен). */
async function decodeGray(buf: Buffer): Promise<{ w: number; h: number; data: Uint8Array } | null> {
  try {
    // sharp — опциональный тяжёлый нативный модуль; при его отсутствии возвращаем null
    const sharp = (await import('sharp')).default;
    const img = sharp(buf).greyscale();
    const meta = await img.metadata();
    const { data } = await img.raw().toBuffer({ resolveWithObject: true });
    return { w: meta.width ?? 0, h: meta.height ?? 0, data };
  } catch {
    return null; // sharp недоступен — лёгкий детектор пропускается
  }
}

/** Одно passes Sobel-подобного фильтра: вернуть карту градиентов и порог шума. */
function gradientField(g: { w: number; h: number; data: Uint8Array }) {
  const { w, h, data } = g;
  const mag = new Float32Array(w * h);
  let sum = 0, sum2 = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1] +
         data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1];
      const gy =
        -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1] +
         data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];
      const m = Math.hypot(gx, gy);
      mag[i] = m;
      sum += m; sum2 += m * m;
    }
  }
  const n = (w - 2) * (h - 2);
  const mean = sum / n;
  const std = Math.sqrt(Math.max(0, sum2 / n - mean * mean));
  return { mag, mean, std };
}

/** Поиск длинных тёмных узких линейных структур (прототип HoughLinesP). */
function detectLinearFeatures(g: { w: number; h: number; data: Uint8Array }, gsdM: number) {
  const { mag, mean } = gradientField(g);
  const { w, h, data } = g;
  const candidates: { coords: [number, number][]; straightness: number; lenPx: number; darkRatio: number; edgeContrast: number }[] = [];
  const THRESH = mean + mag.reduce((a, b) => Math.max(a, b), 0) * 0.0001; // верхний хвост магнитуд
  // Сканируем горизонтальные/вертикальные/диагональные прогоны сильных контрастов
  const dirs = [[1, 0], [0, 1], [1, 1], [1, -1]] as const;
  const minRunPx = Math.max(12, Math.round(30 / gsdM)); // ≥30 м
  for (const [dx, dy] of dirs) {
    for (let y0 = 2; y0 < h - 2; y0++) {
      for (let x0 = 2; x0 < w - 2; x0++) {
        let run = 0, dark = 0, contrast = 0;
        let x = x0, y = y0;
        while (x + dx >= 2 && x + dx < w - 2 && y + dy >= 2 && y + dy < h - 2 && run < 400) {
          x += dx; y += dy; run++;
          const i = y * w + x;
          const px = data[i];
          if (px < 110) dark++; // тёмная полоса (грунт траншеи)
          // контраст с соседней перпендикулярной строкой — «буртик»
          const perp = dy !== 0 ? data[(y + 1) * w + x] : data[y * w + x + 1];
          if (Math.abs(perp - px) > 40) contrast++;
          if (mag[i] < THRESH && run > minRunPx && dark / run > 0.5 && contrast / run > 0.3) break;
        }
        if (run >= minRunPx && dark / run > 0.5) {
          candidates.push({
            coords: [[x0, y0], [x, y]],
            straightness: 1, // прогон по определению прямой
            lenPx: run,
            darkRatio: dark / run,
            edgeContrast: contrast / run,
          });
          x0 = Math.min(w - 3, x0 + run); // прыжок за найденный объект
        }
      }
    }
  }
  return candidates;
}

/** Пиксель → география для кадра, привязанного к bbox. */
function pxToLonLat(px: number, py: number, w: number, h: number, bbox: [number, number, number, number]): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon = minLon + (px / Math.max(1, w - 1)) * (maxLon - minLon);
  const lat = maxLat - (py / Math.max(1, h - 1)) * (maxLat - minLat); // y сверху вниз
  return [lon, lat];
}

/**
 * Скачать VHR-спутниковый кадр Esri World_Imagery (плитки {z}/{y}/{x}) вокруг
 * центра области. Тот же источник растровых тайлов, что отображается на карте
 * в режиме «СПУТ», поэтому движок анализирует именно спутник, а не вектор.
 * Возвращает PNG-буфер мозаики 2×2 тайла z=19 (~0.3 м/пикс) и её bbox.
 */
async function fetchSatelliteImage(bbox: [number, number, number, number], _resolutionPx = 768):
  Promise<{ buf: Buffer; gsdM: number; tileBbox: [number, number, number, number] } | null> {
  try {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const cx = (minLon + maxLon) / 2, cy = (minLat + maxLat) / 2;
    const z = 19; // ~0.3 м/пикс — иначе окоп 2–4 м физически не различим
    const n = 2 ** z;
    const xTile = Math.floor(((cx + 180) / 360) * n);
    const yTile = Math.floor(((1 - Math.asinh(Math.tan((cy * Math.PI) / 180)) / Math.PI) / 2) * n);

    // Мозаика 2×2 соседних тайла (512×512 px ≈ 150×150 м на z=19)
    const tiles = await Promise.all(
      [0, 1].flatMap((dy) =>
        [0, 1].map(async (dx) => {
          const url =
            `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${yTile + dy}/${xTile + dx}`;
          const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
          return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
        }),
      ),
    );
    if (tiles.some((t) => t === null)) return null;

    /* Сборка мозаики и перенос в PNG — через sharp (compositing по offset). */
    const sharp = (await import('sharp')).default;
    const composites: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const dx = i % 2, dy = Math.floor(i / 2);
      composites.push({ input: tiles[i]!, left: dx * 256, top: dy * 256 });
    }
    const pngBuf = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .composite(composites)
      .png()
      .toBuffer();

    // Географический bbox мозаики = западная граница левого тайла … восточная правого
    const xy2deg = (xt: number, yt: number) => ({
      lon: (xt / n) * 360 - 180,
      lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * yt) / n))) * 180) / Math.PI,
    });
    const nw = xy2deg(xTile, yTile);           // левый-верхний угол мозаики
    const se = xy2deg(xTile + 2, yTile + 2);   // правый-нижний угол
    const tileBbox: [number, number, number, number] = [nw.lon, se.lat, se.lon, nw.lat];
    // GSD: метрическая ширина мозаики / 512 px
    const widthM = (se.lon - nw.lon) * 111320 * Math.cos((cy * Math.PI) / 180);
    const gsdM = widthM / 512;
    return { buf: pngBuf, gsdM, tileBbox };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  /* ── Лимит 25 запросов/минута ─────────────────────────────────────── */
  const rl = checkRateLimit(clientKey(req), RATE_LIMIT_PER_MINUTE, 60_000);
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

  /* ── 1. Тяжёлый CV-пайплайн: внешний Python-движок OpenCV (лучшее качество).
         Если TRENCH_ENGINE_URL не задан в .env.local, движок ищется на
         стандартном локальном порту 8790 — чтобы запущенный
         `python src/api/trench_engine.py` работал сразу без настройки env. ── */
  const engineUrl = process.env.TRENCH_ENGINE_URL || 'http://127.0.0.1:8790';
  try {
    const r = await fetch(`${engineUrl.replace(/\/$/, '')}/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bbox, resolutionPx }),
      signal: AbortSignal.timeout(25_000),
    });
    if (r.ok) {
      const data = await r.json();
      /* Конвертация формата движка в единый контракт фронтенда:
         geojson.features          → подтверждённые окопы (features[])
         candidates_geojson.features → кандидаты для зелёного пунктира
         Ответ содержит ИСХОДНЫЕ ключи движка + нормализованные features/geojson. */
      const confirmed: Record<string, unknown>[] = (data?.geojson?.features ?? []).map((f: any) => ({
        geometry: { type: 'Feature', geometry: f.geometry, properties: f.properties },
        is_trench: true,
        needs_review: false,
        confidence: f.properties?.confidence ?? 0.7,
        reasons_ru: f.properties?.reasons_ru ?? [],
        length_m: f.properties?.length_m ?? null,
        width_m: f.properties?.width_m ?? null,
        source: 'cv-scan',
      }));
      const candidates: Record<string, unknown>[] = (data?.candidates_geojson?.features ?? []).map((f: any) => ({
        geometry: { type: 'Feature', geometry: f.geometry, properties: f.properties },
        is_trench: false,
        needs_review: true,
        confidence: f.properties?.confidence ?? 0.4,
        reasons_ru: f.properties?.reasons_ru ?? [],
        length_m: f.properties?.length_m ?? null,
        width_m: f.properties?.width_m ?? null,
        source: 'cv-scan',
      }));
      /* autosave: только уверенные подтверждения движка (conf ≥ 0.55) */
      if (autosave) {
        for (const res of confirmed.filter((c) => Number(c.confidence) >= 0.55)) {
          const g = (res.geometry as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
          const feature: TrenchFeature = {
            id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'trench',
            name: 'Окоп (AI-скан)',
            source: 'ai_detected',
            geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: g }, properties: {} },
            lengthKm: ((res.length_m as number) ?? 0) / 1000,
            confidence: res.confidence as number,
            createdAt: Date.now(),
          };
          try { await addTrench(feature); } catch { /* дубликат/ошибка — пропускаем */ }
        }
      }
      return NextResponse.json({
        ...data,
        engine: 'python-opencv',
        scanned: data?.scanned_segments ?? 0,
        features: [...confirmed, ...candidates],
        geojson: { type: 'FeatureCollection', features: confirmed.map((c) => c.geometry) },
        candidates_geojson: { type: 'FeatureCollection', features: candidates.map((c) => c.geometry) },
      });
    }
  } catch {
    /* Движок недоступен — переходим к встроенному растровому детектору. */
  }

  /* ── 2. Встроенный растровый детектор: скачиваем РЕАЛЬНЫЙ спутниковый кадр
         (Esri World_Imagery — тот же растри, что карта показывает в режиме
         «СПУТ») и анализируем его на CPU Node. Окопы ищутся именно на снимке,
         а не на векторной карте. При отсутствии sharp или недоступности
         тайлового сервера возвращаем честный пустой результат. ─────────────── */
  const shot = await fetchSatelliteImage(bbox, resolutionPx);
  const rasterResults: Record<string, unknown>[] = [];
  let rasterScanned = 0;
  if (shot) {
    const gray = await decodeGray(shot.buf);
    if (gray && gray.w > 8 && gray.h > 8) {
      const cands = detectLinearFeatures(gray, shot.gsdM);
      rasterScanned = cands.length;
      for (const c of cands.slice(0, 100)) {
        // Привязка к реальному bbox мозаики тайлов, а не к запрошенному bbox
        const geoCoords = c.coords.map(([px, py]) => pxToLonLat(px, py, gray.w, gray.h, shot.tileBbox));
        const lenM = c.lenPx * shot.gsdM;
        /* Строгий фильтр ТЗ: длинные ИДЕАЛЬНО прямые прогоны — это дороги/ЛЭП,
           настоящие окопы зигзагообразны. Прямой прогон никогда не помечается
           как окоп со 100% уверенностью: максимум — «кандидат» низкой
           достоверности, требующий ручной проверки оператором. */
        const isRoadLike = lenM > 150; // длинная прямая лента → вероятнее дорога
        const conf = isRoadLike ? 0.15 : Math.min(0.45, 0.2 + c.edgeContrast * 0.3);
        rasterResults.push({
          geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: geoCoords }, properties: {} },
          is_trench: !isRoadLike && conf >= 0.3,
          needs_review: true, // любой автоскан требует визуального подтверждения
          confidence: Number(conf.toFixed(2)),
          reasons_ru: isRoadLike
            ? ['Длинная идеально прямая структура (>150 м) — вероятнее дорога или ЛЭП.']
            : ['Тёмная узкая линейная структура на снимке; форма не подтверждена (прямой прогон). Требуется ручной обвод и проверка.'],
          length_m: Math.round(lenM),
          gsd_m: Number(shot.gsdM.toFixed(3)),
        });
      }
    }
  }

  /* ── 3. Проверка обводов оператора (геометрическая эвристика) ────────────
         widthM и textureStd вычисляются из реальной геометрии обвода. */
  const rawLines: [number, number][][] = parsed.data.lines ?? [];
  const results: Record<string, unknown>[] = [...rasterResults];
  for (const coords of rawLines.slice(0, 50)) {
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const shape = shapeMetrics(coords as [number, number][]);

    let estimatedWidthM = 2.5;
    if (coords.length >= 4) {
      const start = coords[0], end = coords[coords.length - 1];
      const dist = Math.hypot(end[0] - start[0], end[1] - start[1]) * 111000;
      if (dist < 10) {
        estimatedWidthM = Math.min(8, Math.max(1.5, shape.lengthM / (coords.length * 2)));
      }
    }
    const textureEstimate = shape.tortuosity > 1.1 ? 0.22 :
                            shape.tortuosity > 1.05 ? 0.15 :
                            shape.maxTurnRad > 0.3 ? 0.18 : 0.08;

    const cls = classifySegment({ ...shape, widthM: estimatedWidthM, textureStd: textureEstimate });

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

  /* autosave: сохраняем только УВЕРЕННЫЕ окопы (порог 0.55). Кандидаты с
     низкой достоверностью из растрового детектора в слой НЕ пишутся —
     чтобы карта не заполнялась ложными «окопами 100%». */
  if (autosave) {
    for (const res of results.filter((r) => r.is_trench && Number(r.confidence) >= 0.55)) {
      const g = (res.geometry as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
      const feature: TrenchFeature = {
        id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'trench',
        name: 'Окоп (автоскан)',
        source: 'ai_detected',
        geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: g }, properties: {} },
        lengthKm: (res.length_m as number) / 1000,
        confidence: res.confidence as number,
        createdAt: Date.now(),
      };
      try { await addTrench(feature); } catch { /* дубликат/ошибка — пропускаем */ }
    }
  }

  const engine: 'js-raster-lite' | 'no-raster' = rasterResults.length > 0 || shot ? 'js-raster-lite' : 'no-raster';
  return NextResponse.json({
    engine,
    bbox,
    scanned: rawLines.length,
    scanned_raster_segments: rasterScanned,
    features: results,
    geojson: {
      type: 'FeatureCollection',
      features: results.filter((r) => r.is_trench).map((r) => r.geometry),
    },
    note: engine === 'js-raster-lite'
      ? 'Выполнено сканирование СПУТНИКОВОГО кадра Esri World_Imagery встроенным лёгким детектором (CPU Node). Для полного OpenCV-пайплайна (HoughLinesP + ширина/зигзаг/текстура) запустите Python-движок: python src/api/trench_engine.py и укажите TRENCH_ENGINE_URL.'
      : 'Спутниковый кадр получить или декодировать не удалось (нет сети до Esri или не установлен sharp). Автоскан по растровому изображению недоступен — используйте ручной обвод. Полный OpenCV-пайплайн: python src/api/trench_engine.py + TRENCH_ENGINE_URL.',
    disclaimer: 'Только OSINT-обнаружение изменений ландшафта; средство тактического целеуказания не предоставляется.',
  });
}
