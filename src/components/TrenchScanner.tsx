/**
 * TrenchScanner — «Картограф укреплений» (Trench Mapper).
 *
 * Полностью рабочий модуль, встроенный в левое меню (группа «ОКОПЫ»):
 *  1) Ручной обвод: кнопка «Рисовать: Полилиния» включает режим рисования
 *     карты; готовые фигуры попадают сюда через проп `shapes` и проверяются
 *     кнопкой «Проверить обводы» — серверный фильтр «окоп vs дорога»
 *     (POST /api/trench-scan с autosave) сохраняет подтверждённые линии.
 *  2) Автоскан: «Сканировать область» запускает CV-пайплайн по видимому
 *     bbox (Python-движок OpenCV при наличии TRENCH_ENGINE_URL, иначе —
 *     локальная геометрия-эвристика).
 *  3) Список сохранённых укреплений: GET /api/trenches, удаление DELETE.
 *
 * Сохранение — GeoJSON с пометкой type:'trench' (см. src/lib/trench-store.ts).
 * UI полностью на русском; тяжёлые запросы ограничены на сервере
 * (rate limit 25/мин) — клиент показывает понятное сообщение о лимите.
 */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { Save, Trash2, ScanLine, MapPin, CheckCircle2, XCircle, RefreshCw, PencilRuler } from 'lucide-react';

/** Одна линия из хранилища укреплений (ответ GET /api/trenches → geojson.features). */
interface TrenchRow {
  id?: string;
  properties?: { name?: string; source?: string; confidence?: number };
  geometry?: { type: string; coordinates: [number, number][] };
}

/** Фигура ручного рисования карты (структура DrawnShape из src/lib/draw.ts). */
export interface DrawnShapeLike {
  id: string;
  name: string;
  kind: string; // 'line' | 'polygon' | 'rectangle' | 'circle'
  geojson: { geometry: { type: string; coordinates: any } };
}

interface TrenchScannerProps {
  /** Центр карты [lat, lon] — используется как область сканирования. */
  center: [number, number];
  zoom: number;
  /** Готовые фигуры ручного рисования карты (обводы оператора). */
  shapes?: DrawnShapeLike[];
  /** Включить режим рисования полилинией на карте (управляет страница). */
  onStartDrawLine?: () => void;
  /** Оповестить родителя об изменении слоя (чтобы карта перезагрузила окопы). */
  onSaved?: () => void;
  /** Показать кандидаты автоскана на карте зелёным пунктиром (нужен подтверждающий слой). */
  onCandidates?: (geojson: unknown) => void;
  /** Подтвердить/отклонить кандидатов пакетом после ответа сканера. */
  onScanDone?: () => void;
}

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; text: string };

/** Вершины фигуры в GeoJSON-порядке [lon, lat]. */
function shapeCoords(s: DrawnShapeLike): [number, number][] {
  const g = s.geojson?.geometry;
  if (!g) return [];
  if (g.type === 'LineString') return g.coordinates as [number, number][];
  if (g.type === 'Polygon') {
    const ring = (g.coordinates as [number, number][][])?.[0] ?? [];
    // Без повторяющейся замыкающей точки: кольцо — это замкнутый контур обвода.
    return ring.length > 1 ? ring.slice(0, -1) : ring;
  }
  return [];
}

/** Приблизительная длина ломаной в метрах (гаверсинг). */
function lengthM(points: [number, number][]): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    const [o1, a1] = points[i - 1]; // GeoJSON-порядок: [lon, lat]
    const [o2, a2] = points[i];
    const h =
      Math.sin(rad(a2 - a1) / 2) ** 2 +
      Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(rad(o2 - o1) / 2) ** 2;
    s += 2 * R * Math.asin(Math.sqrt(h));
  }
  return s;
}

export default function TrenchScanner({
  center, zoom, shapes = [], onStartDrawLine, onSaved, onCandidates,
}: TrenchScannerProps) {
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [rows, setRows] = useState<TrenchRow[]>([]);
  /* Кандидаты последнего автоскана (нужны для подтверждения оператором). */
  const [candidates, setCandidates] = useState<any[]>([]);

  /* ── Загрузка сохранённых укреплений для списка ───────────────────── */
  const refresh = useCallback(async () => {
    try {
      const r = await fetch('/api/trenches', { cache: 'no-store' });
      const j = await r.json().catch(() => ({}));
      if (r.ok && Array.isArray(j?.geojson?.features)) setRows(j.geojson.features);
    } catch {
      /* Сервер недоступен — список просто остаётся прежним. */
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  /** Линии/полигоны оператора, пригодные для проверки фильтром. */
  const lineShapes = shapes
    .map((s) => ({ s, coords: shapeCoords(s) }))
    .filter(({ coords }) => coords.length >= 2);

  /* ── Проверка обводов: геометрия-фильтр «окоп vs дорога» + autosave ── */
  const checkDrawings = useCallback(async () => {
    if (lineShapes.length === 0) {
      setStatus({ kind: 'error', text: 'Нет обводов. Нажмите «Рисовать: Полилиния», обведите линию на карте и завершите Enter.' });
      return;
    }
    setStatus({ kind: 'busy', text: 'Проверка обводов (фильтр «окоп vs дорога»)…' });
    const half = Math.min(0.25, 3 / Math.max(1, zoom));
    const [lat, lon] = center;
    try {
      const r = await fetch('/api/trench-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          bbox: [lon - half, lat - half, lon + half, lat + half],
          lines: lineShapes.map(({ coords }) => coords),
          autosave: true,
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) {
        setStatus({ kind: 'error', text: j?.detail || 'Лимит: 25 запросов в минуту.' });
        return;
      }
      if (!r.ok) {
        setStatus({ kind: 'error', text: j?.detail || j?.error || `Ошибка проверки (${r.status}).` });
        return;
      }
      const feats: TrenchRow[] = j?.geojson?.features ?? [];
      const allResults: any[] = j?.features ?? [];
      const rejected = allResults.filter((r: any) => !r.is_trench).length;
      
      // Формируем развёрнутый отчёт с причинами отклонения
      let report = `Подтверждено окопов: ${feats.length}.`;
      if (rejected > 0) {
        const rejectedReasons = allResults
          .filter((r: any) => !r.is_trench)
          .map((r: any) => r.reasons_ru?.[0] || 'неизвестная причина')
          .slice(0, 3)
          .join('; ');
        report += `\nОтбраковано (${rejected}): ${rejectedReasons}${rejected > 3 ? '…' : ''}`;
      }
      report += '\nСохранено в слой укреплений.';
      
      setScanResult(report);
      setStatus({ kind: 'ok', text: feats.length > 0 ? 'Готово — окопы добавлены на карту.' : 'Проверка завершена. Ни один обвод не похож на окоп.' });
      await refresh();
      onSaved?.();
    } catch {
      setStatus({ kind: 'error', text: 'Сервер недоступен. Попробуйте позже.' });
    }
  }, [center, zoom, lineShapes, onSaved, refresh]);

  /* ── Автоскан видимой области (OpenCV-движок или встроенный растровый) ── */
  const scan = useCallback(async () => {
    setStatus({ kind: 'busy', text: 'Сканирование спутникового снимка…' });
    const half = Math.min(0.25, 3 / Math.max(1, zoom));
    const [lat, lon] = center;
    const bbox = [lon - half, lat - half, lon + half, lat + half];
    try {
      const r = await fetch('/api/trench-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        /* autosave=false: автоскан НИЧЕГО не пишет в слой — только находит
           кандидатов. В хранилище попадают лишь линии, подтверждённые
           оператором кнопкой «Подтвердить». Это исключает ложные окопы. */
        body: JSON.stringify({ bbox, autosave: false }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) {
        setStatus({ kind: 'error', text: j?.detail || 'Лимит: 25 запросов в минуту.' });
        return;
      }
      if (!r.ok) {
        setStatus({ kind: 'error', text: j?.detail || j?.error || `Ошибка сканирования (${r.status}).` });
        return;
      }
      /* Кандидаты для зелёного пунктира на карте (нужен подтверждающий слой). */
      const cands: any[] = j?.candidates_geojson?.features ?? [];
      setCandidates(cands);
      onCandidates?.(j?.candidates_geojson ?? { type: 'FeatureCollection', features: [] });
      const n = Array.isArray(j?.geojson?.features) ? j.geojson.features.length : 0;
      const scannedCount = j?.scanned_segments ?? j?.scanned ?? 0;

      let autoReport = `Проанализировано структур: ${scannedCount}. Подтверждённых окопов: ${n}. Кандидатов на проверку: ${cands.length}.`;
      if (j?.engine === 'python-opencv') {
        autoReport += '\nДвижок: OpenCV (CLAHE → Canny → ширина/зигзаг/текстура/тень вала).';
      } else if (j?.engine === 'js-raster-lite') {
        autoReport += '\nДвижок: встроенный растровый детектор по снимку Esri World_Imagery.';
      } else {
        autoReport += '\n⚠️ Спутниковый кадр недоступен — автоскан не выполнялся.';
      }
      if (cands.length > 0) {
        autoReport += '\nКандидаты показаны ЗЕЛЁНЫМ ПУНКТИРОМ. Проверьте их визуально и нажмите «Подтвердить», чтобы сохранить как окопы.';
      }

      setScanResult(autoReport);
      setStatus({
        kind: 'ok',
        text: cands.length > 0 || n > 0
          ? 'Сканирование завершено — проверьте кандидатов на карте.'
          : 'Сканирование завершено. Окопов не обнаружено.',
      });
      await refresh();
      onSaved?.();
    } catch {
      setStatus({ kind: 'error', text: 'Сервер недоступен. Попробуйте позже.' });
    }
  }, [center, zoom, onSaved, onCandidates, refresh]);

  /* ── Подтверждение кандидата: зелёный пунктир → сохранённый окоп ──── */
  const confirmCandidate = useCallback(async (feature: any) => {
    const coords: [number, number][] = feature?.geometry?.coordinates ?? [];
    if (coords.length < 2) return;
    try {
      const r = await fetch('/api/trenches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
          type: 'trench',
          name: 'Окоп (AI, подтверждён)',
          source: 'ai_detected',
          geometry: { type: 'LineString', coordinates: coords },
          confidence: feature?.properties?.confidence ?? undefined,
        }),
      });
      if (!r.ok) {
        setStatus({ kind: 'error', text: 'Не удалось сохранить подтверждённый окоп.' });
        return;
      }
      const nextCands = candidates.filter((c) => c !== feature);
      setCandidates(nextCands);
      onCandidates?.({ type: 'FeatureCollection', features: nextCands });
      setStatus({ kind: 'ok', text: 'Окоп подтверждён и сохранён в слой укреплений.' });
      await refresh();
      onSaved?.();
    } catch {
      setStatus({ kind: 'error', text: 'Сервер недоступен.' });
    }
  }, [candidates, onCandidates, onSaved, refresh]);

  /* ── Отклонить всех кандидатов (скрыть пунктир без сохранения) ─────── */
  const rejectAll = useCallback(() => {
    setCandidates([]);
    onCandidates?.({ type: 'FeatureCollection', features: [] });
    setStatus({ kind: 'idle', text: 'Все кандидаты отклонены (не сохранены).' });
  }, [onCandidates]);

  /* ── Удаление записи ──────────────────────────────────────────────── */
  const remove = useCallback(async (id?: string) => {
    if (!id) return;
    try {
      const r = await fetch(`/api/trenches?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (r.ok) {
        setRows((prev) => prev.filter((row) => row.id !== id));
        setStatus({ kind: 'ok', text: 'Запись удалена из слоя укреплений.' });
        onSaved?.();
      } else {
        setStatus({ kind: 'error', text: 'Не удалось удалить запись.' });
      }
    } catch {
      setStatus({ kind: 'error', text: 'Сервер недоступен.' });
    }
  }, [onSaved]);

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[var(--text-primary)]">
          <MapPin className="w-3.5 h-3.5" style={{ color: '#8D6E63' }} />
          КАРТОГРАФ УКРЕПЛЕНИЙ
        </div>
        <button
          onClick={() => void refresh()}
          title="Обновить список укреплений"
          className="rounded p-1 text-[var(--text-muted)] hover:text-[var(--text-primary)]"
        >
          <RefreshCw className="w-3 h-3" />
        </button>
      </div>

      {/* Инструкция: два шага ручного обвода */}
      <div className="rounded bg-[var(--bg-tertiary)] p-2 text-[9px] leading-relaxed text-[var(--text-secondary)]">
        <span className="font-semibold text-[var(--text-primary)]">1.</span> Нажмите «Рисовать: Полилиния»,
        кликните точки вдоль окопа на карте, завершите Enter.
        {' '}<span className="font-semibold text-[var(--text-primary)]">2.</span> «Проверить обводы» — фильтр
        «окоп vs дорога» сохранит подтверждённые линии в слой.
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={() => {
            if (onStartDrawLine) {
              onStartDrawLine();
              setStatus({ kind: 'idle', text: 'Режим полилинии включён — кликайте точки обвода на карте.' });
            } else {
              setStatus({ kind: 'error', text: 'Инструмент рисования недоступен в этом режиме.' });
            }
          }}
          className="flex-1 flex items-center justify-center gap-2 rounded bg-[#8D6E63] px-2 py-1.5 text-[10px] font-semibold text-white"
        >
          <PencilRuler className="w-3 h-3" /> Рисовать: Полилиния
        </button>
        <button
          onClick={checkDrawings}
          disabled={status.kind === 'busy' || lineShapes.length === 0}
          className="flex-1 flex items-center justify-center gap-1 rounded bg-[#2E7D32] px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
          title="Проверить готовые обводы фильтром «окоп vs дорога» и сохранить подтверждённые"
        >
          <Save className="w-3 h-3" /> Проверить обводы ({lineShapes.length})
        </button>
      </div>

      <button
        onClick={scan}
        disabled={status.kind === 'busy'}
        className="w-full flex items-center justify-center gap-1 rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-[10px] font-bold text-[var(--text-primary)] disabled:opacity-40"
        title="CV-сканирование видимой области (лимит 25 зап./мин)"
      >
        <ScanLine className="w-3 h-3" /> Сканировать область
      </button>

      {/* Список сохранённых укреплений */}
      <div className="max-h-36 overflow-y-auto rounded border border-[var(--border)] divide-y divide-[var(--border)]">
        {rows.length === 0 && (
          <div className="p-2 text-[9px] text-[var(--text-muted)]">
            Сохранённых укреплений нет. Обведите линию и нажмите «Проверить обводы».
          </div>
        )}
        {rows.map((row, i) => {
          const len = row.geometry?.coordinates ? lengthM(row.geometry.coordinates) : 0;
          const conf = row.properties?.confidence;
          return (
            <div key={row.id ?? i} className="flex items-center gap-2 px-2 py-1.5">
              <span className="w-4 h-0.5 shrink-0 rounded" style={{ background: '#5D4037' }} aria-hidden />
              <span className="flex-1 truncate text-[9px] text-[var(--text-secondary)]">
                {row.properties?.name ?? 'Укрепление'}
                {len > 0 && <span className="text-[var(--text-muted)]"> · {Math.round(len)} м</span>}
                {typeof conf === 'number' && <span className="text-[var(--text-muted)]"> · {(conf * 100).toFixed(0)}%</span>}
              </span>
              <button
                onClick={() => void remove(row.id)}
                title="Удалить из слоя укреплений"
                className="shrink-0 rounded p-1 text-[var(--text-muted)] hover:text-[#FF3D57]"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          );
        })}
      </div>

      {status.text && (
        <div className="flex items-start gap-1.5 text-[9px] leading-snug">
          {status.kind === 'ok' && <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-[#00E676]" />}
          {status.kind === 'error' && <XCircle className="w-3 h-3 mt-0.5 shrink-0 text-[#FF3D57]" />}
          <span className={status.kind === 'error' ? 'text-[#FF3D57]' : 'text-[var(--text-secondary)]'}>
            {status.text}
          </span>
        </div>
      )}

      {scanResult && (
        <div className="rounded bg-[var(--bg-tertiary)] p-2 text-[9px] text-[var(--text-secondary)] leading-relaxed">
          {scanResult}
          <br />
          <span className="text-[var(--text-muted)]">
            Строгий фильтр: ширина 2–4 м, зигзагообразная форма, взрыхлённая текстура.
            Широкие прямые линии (дороги, ЛЭП) отбраковываются.
          </span>
        </div>
      )}
    </div>
  );
}
