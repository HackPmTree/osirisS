/**
 * OSIRISX — Схемы Zod-валидации модуля «Картограф укреплений».
 *
 * Все входные данные API-эндпоинтов проходят строгую проверку:
 *  - геометрия — только GeoJSON LineString/Polygon с корректным диапазоном
 *    координат (широта ±90, долгота ±180) и разумным числом вершин;
 *  - радиус/зум — в допустимых пределах;
 *  - строки — ограничение длины (защита от перегрузки хранилища).
 */

import { z } from 'zod';

/** Координата [lon, lat] в географическом диапазоне. */
export const lngLat = z
  .tuple([
    z.number().min(-180).max(180),   // долгота
    z.number().min(-90).max(90),     // широта
  ])
  .refine(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat), {
    message: 'Координаты должны быть конечными числами',
  });

/** GeoJSON Feature с геометрией LineString или Polygon. */
export const trenchGeometry = z.object({
  type: z.literal('Feature'),
  geometry: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('LineString'),
      // Полилиния обвода: минимум 2 точки, максимум 2000 (защита от дампа)
      coordinates: z.array(lngLat).min(2).max(2000),
    }),
    z.object({
      type: z.literal('Polygon'),
      // GeoJSON Polygon — массив колец; принимаем и плоский массив точек (упрощение клиента),
      // нормализация в [[ring]] выполняется на этапе сохранения (см. /api/trenches POST)
      coordinates: z.union([
        z.array(lngLat).min(4).max(2000),           // плоское кольцо [lon,lat][]
        z.array(z.array(lngLat)).min(1).max(10),    // корректный формат колец [[lon,lat]...]
      ]),
    }),
  ]),
  properties: z.record(z.string(), z.any()).optional(),
});

/** POST /api/trenches — сохранение укрепления. */
export const trenchCreateSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{6,64}$/, 'id: 6–64 символа [A-Za-z0-9_-]'),
  type: z.literal('trench'),
  name: z.string().min(1).max(120),
  /* Устаревшее значение 'manual' нормализуется в 'manual_drawn',
     чтобы схема полностью соответствовала типу TrenchFeature в хранилище. */
  source: z.preprocess(
    (v) => (v === 'manual' ? 'manual_drawn' : v),
    z.enum(['ai_detected', 'manual_drawn', 'cv-scan']).default('manual_drawn'),
  ),
  geometry: trenchGeometry,
  lengthKm: z.number().nonnegative().max(10000).optional(),
  confidence: z.number().min(0).max(1).optional(),
  createdAt: z.number().int().positive().optional(),
});

/** GET /api/trenches?lon=&lat=&zoom= — параметры выборки. */
export const trenchQuerySchema = z.object({
  lon: z.coerce.number().min(-180).max(180).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  zoom: z.coerce.number().int().min(1).max(21).optional(),
});

/** DELETE /api/trenches?id=... */
export const trenchDeleteSchema = z.object({
  id: z.string().regex(/^[a-zA-Z0-9_-]{6,64}$/),
});

/**
 * POST /api/trench-scan — запуск CV-сканирования снимка.
 * bbox: [minLon, minLat, maxLon, maxLat]; площадь ограничена (~0.5°×0.5° макс.),
 * чтобы один запрос не парализовал CPU сервера.
 */
export const trenchScanSchema = z.object({
  bbox: z
    .tuple([
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
      z.number().min(-180).max(180),
      z.number().min(-90).max(90),
    ])
    .refine(([x1, y1, x2, y2]) => x2 > x1 && y2 > y1, {
      message: 'bbox: правый-верхний угол должен быть больше левого-нижнего',
    })
    .refine(([x1, y1, x2, y2]) => x2 - x1 <= 0.5 && y2 - y1 <= 0.5, {
      message: 'Слишком большая область сканирования (макс. ~0.5°×0.5°)',
    }),
  /** Разрешение растра для анализа, пикселей на кадр запроса. */
  resolutionPx: z.number().int().min(256).max(2048).default(768),
  /** Сохранять ли найденные линии в хранилище сразу. */
  autosave: z.boolean().default(false),
  /**
   * Полилинии, переданные оператором (обводы) — классифицируются локальной
   * эвристикой «окоп vs дорога», когда Python-движок OpenCV не поднят.
   * Каждая линия: массив точек [lon, lat]; до 50 линий, ≤500 вершин.
   */
  lines: z.array(z.array(lngLat).min(2).max(500)).max(50).optional(),
});

/** Ошибки Zod → плоский русскоязычный текст для HTTP-ответа. */
export function zodErrorText(err: z.ZodError): string {
  return err.issues
    .map((i) => `${i.path.join('.') || '(тело)'}: ${i.message}`)
    .join('; ');
}
