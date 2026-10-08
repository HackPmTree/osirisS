/**
 * OSIRISX — Хранилище «Trench Store» (укрепления / окопы)
 *
 * Назначение: долговременное хранение геометрии укреплений, сохранённых
 * оператором через модуль «Картограф укреплений» (TrenchMapper).
 *
 * Реализация: файл-хранилище в формате SQLite-совместимого дампа
 * (одна таблица `features`, сериализуется через JSON-Lines со схемой GeoJSON).
 * why: в edge/Next.js runtime нативные драйверы SQLite (better-sqlite3)
 * недоступны без nodejs runtime и сборки нативных бинарников; формат
 * спроектирован так, чтобы миграция на реальную таблицу SQLite/PostgreSQL
 * была прямой (колонки = поля записи TrenchFeature).
 *
 * Каждая запись имеет обязательную пометку type: 'trench' — слой карты
 * фильтрует именно её.
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Тип записи — жёстко зафиксирован для фильтрации слоя укреплений. */
export const TRENCH_FEATURE_TYPE = 'trench' as const;

export interface TrenchFeature {
  id: string;
  /** Всегда 'trench' (см. ТЗ: пометка типа в хранилище). */
  type: typeof TRENCH_FEATURE_TYPE;
  /** GeoJSON Feature (LineString/Polygon) с координатами [lon, lat]. */
  geometry: {
    type: 'Feature';
    properties: Record<string, unknown>;
    geometry:
      | { type: 'LineString'; coordinates: [number, number][] }
      | { type: 'Polygon'; coordinates: [number, number][][] };
  };
  /** Название объекта (по умолчанию «Укрепление N»). */
  name: string;
  /** Источник: ручная полилиния оператора либо результат CV-сканирования. */
  source: 'manual' | 'cv-scan';
  /** Длина линии в км (для LineString), если вычислима. */
  lengthKm?: number;
  /** Коэффициент уверенности CV-фильтра «окоп vs дорога» (0..1), если есть. */
  confidence?: number;
  createdAt: number; // unix ms
}

/** Путь к файлу хранилища (каталог intel/ уже используется проектом). */
const DB_PATH = process.env.TRENCH_DB_PATH
  ? path.resolve(process.env.TRENCH_DB_PATH)
  : path.join(process.cwd(), 'intel', 'trench_store.jsonl');

/** Простейшая блокировка от конкурентной записи в одном процессе. */
let writeChain: Promise<unknown> = Promise.resolve();

async function readAll(): Promise<TrenchFeature[]> {
  try {
    const raw = await fs.readFile(DB_PATH, 'utf-8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line) as TrenchFeature)
      .filter((f) => f && f.type === TRENCH_FEATURE_TYPE);
  } catch {
    return []; // файл ещё не создан — пустая база
  }
}

async function writeAll(rows: TrenchFeature[]): Promise<void> {
  await fs.mkdir(path.dirname(DB_PATH), { recursive: true });
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  // атомарная перезапись: во временный файл + rename
  const tmp = `${DB_PATH}.tmp-${process.pid}`;
  await fs.writeFile(tmp, body, 'utf-8');
  await fs.rename(tmp, DB_PATH);
}

/** Все сохранённые укрепления (отсортированы по дате создания). */
export async function listTrenches(): Promise<TrenchFeature[]> {
  const rows = await readAll();
  return rows.sort((a, b) => a.createdAt - b.createdAt);
}

/** Добавить укрепление; возвращает сохранённую запись. */
export async function addTrench(feature: TrenchFeature): Promise<TrenchFeature> {
  // Строгая инвариантная пометка типа — слой карты полагается именно на неё.
  feature.type = TRENCH_FEATURE_TYPE;
  const task = writeChain.then(async () => {
    const rows = await readAll();
    if (rows.some((r) => r.id === feature.id)) {
      throw Object.assign(new Error('Запись с таким id уже существует'), { status: 409 });
    }
    rows.push(feature);
    await writeAll(rows);
  });
  writeChain = task.catch(() => undefined);
  await task;
  return feature;
}

/** Удалить укрепление по id. Возвращает true, если запись существовала. */
export async function deleteTrench(id: string): Promise<boolean> {
  const task = writeChain.then(async () => {
    const rows = await readAll();
    const next = rows.filter((r) => r.id !== id);
    if (next.length === rows.length) return false;
    await writeAll(next);
    return true;
  });
  writeChain = task.catch(() => undefined);
  return task as Promise<boolean>;
}

/** Собрать все укрепления в один GeoJSON FeatureCollection (для слоя карты). */
export async function trenchesAsGeoJSON(): Promise<GeoJSON.FeatureCollection> {
  const rows = await listTrenches();
  return {
    type: 'FeatureCollection',
    features: rows.map((r) => ({
      ...r.geometry,
      properties: {
        ...(r.geometry.properties || {}),
        id: r.id,
        osiris_type: r.type,
        name: r.name,
        source: r.source,
        length_km: r.lengthKm ?? null,
        confidence: r.confidence ?? null,
        created_at: new Date(r.createdAt).toISOString(),
      },
    })),
  };
}
