/**
 * OSIRISX — /api/trenches: хранилище укреплений (окопов).
 *
 *  GET    — список всех сохранённых укреплений как GeoJSON FeatureCollection
 *           (+ опциональная фильтрация по bbox через lon/lat/zoom не требуется
 *            слою карты, но параметры валидируются на случай будущего).
 *  POST   — сохранить укрепление (ручной обвод «Полилиния» или CV-скан).
 *           Тело проходит строгую Zod-валидацию; пометка type:'trench'
 *           проставляется сервером принудительно.
 *  DELETE — удалить запись по id (?id=...).
 *
 * Безопасность: rate limiting 10 запросов/мин (см. src/lib/rate-limit.ts),
 * валидация каждой координаты и лимиты длины строк (src/lib/trench-schema.ts).
 */

import { NextRequest, NextResponse } from 'next/server';
import { addTrench, deleteTrench, listTrenches, trenchesAsGeoJSON, type TrenchFeature } from '@/lib/trench-store';
import { trenchCreateSchema, trenchDeleteSchema, trenchQuerySchema, zodErrorText } from '@/lib/trench-schema';
import { checkRateLimit, clientKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs'; // файловое хранилище требует Node.js runtime

/** Общая проверка лимита: 10 запросов в минуту на клиента. */
function guard(req: NextRequest): Response | null {
  const res = checkRateLimit(clientKey(req), 10, 60_000);
  return res.ok ? null : rateLimitResponse(res);
}

export async function GET(req: NextRequest) {
  const limited = guard(req);
  if (limited) return limited;

  // Параметры выборки валидируются, даже если пока не влияют на выдачу.
  const q = trenchQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!q.success) {
    return NextResponse.json({ error: 'НЕКОРРЕКТНЫЕ ПАРАМЕТРЫ', detail: zodErrorText(q.error) }, { status: 400 });
  }

  const fc = await trenchesAsGeoJSON();
  const rows = await listTrenches();
  return NextResponse.json({
    geojson: fc,
    count: rows.length,
    // Слой карты использует эти константы, чтобы отличаться от красных линий фронта.
    style: { strokeColor: '#5D4037', strokeWidth: 3, strokeOpacity: 0.9 },
  });
}

export async function POST(req: NextRequest) {
  const limited = guard(req);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'ТЕЛО ЗАПРОСА НЕ ЯВЛЯЕТСЯ JSON' }, { status: 400 });
  }

  const parsed = trenchCreateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ВАЛИДАЦИЯ НЕ ПРОЙДЕНА', detail: zodErrorText(parsed.error) }, { status: 400 });
  }

  /* ── Нормализация геометрии: схема принимает упрощённый формат,
        хранилище требует канонический GeoJSON ─────────────────────── */
  const g = parsed.data.geometry.geometry; // внутренняя геометрия (LineString/Polygon)
  let normGeometry: TrenchFeature['geometry']['geometry'];
  if (g.type === 'LineString') {
    normGeometry = { type: 'LineString', coordinates: g.coordinates };
  } else {
    // Polygon: проверяем вложенность — [lon,lat][] (плоское кольцо) или [[lon,lat]...] (кольца)
    const first = (g.coordinates as any[])[0];
    const rings = Array.isArray(first) && Array.isArray(first[0])
      ? (g.coordinates as [number, number][][])          // уже корректный формат колец
      : [g.coordinates as [number, number][]];            // плоское кольцо → оборачиваем
    normGeometry = { type: 'Polygon', coordinates: rings };
  }

  const feature: TrenchFeature = {
    ...parsed.data,
    // properties необязателен в схеме Zod, но хранилище ждёт объект — нормализуем.
    geometry: {
      type: 'Feature',
      properties: parsed.data.geometry.properties ?? {},
      geometry: normGeometry,
    },
    createdAt: parsed.data.createdAt ?? Date.now(),
    type: 'trench', // серверный инвариант, независимо от тела запроса
  };

  try {
    await addTrench(feature);
  } catch (e: any) {
    const status = e?.status === 409 ? 409 : 500;
    return NextResponse.json({ error: 'СОХРАНЕНИЕ НЕ ВЫПОЛНЕНО', detail: e?.message || String(e) }, { status });
  }

  return NextResponse.json({ ok: true, feature }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const limited = guard(req);
  if (limited) return limited;

  const parsed = trenchDeleteSchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: 'НЕКОРРЕКТНЫЙ id', detail: zodErrorText(parsed.error) }, { status: 400 });
  }

  const removed = await deleteTrench(parsed.data.id);
  if (!removed) {
    return NextResponse.json({ error: 'ЗАПИСЬ НЕ НАЙДЕНА' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, deleted: parsed.data.id });
}
