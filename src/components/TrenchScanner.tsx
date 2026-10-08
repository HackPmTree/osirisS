/**
 * TrenchScanner — «Картограф укреплений» (Trench Mapper).
 *
 * Инструмент ручного обвода окопов полилинией + запуск CV-сканирования
 * области с фильтром «окоп vs дорога». Сохранение отправляется на сервер
 * в формате GeoJSON (POST /api/trenches, пометка type: 'trench').
 *
 * UI полностью на русском; тяжёлые запросы ограничены на сервере
 * (rate limit 10/мин) — клиент показывает понятное сообщение о лимите.
 */

'use client';

import { useCallback, useState } from 'react';
import { Crosshair, Save, Trash2, ScanLine, MapPin, CheckCircle2, XCircle } from 'lucide-react';

export interface TrenchDraft {
  /** Вершины полилинии обвода [lat, lon] — порядок = порядок кликов. */
  points: [number, number][];
}

interface TrenchScannerProps {
  /** Активен ли режим ручного обвода («Полилиния») — управляется картой. */
  drawActive: boolean;
  onToggleDraw: () => void;
  /** Текущий черновик обвода (карта пишет в него при кликах). */
  draft: TrenchDraft;
  onClearDraft: () => void;
  /** Центр карты — используется как bbox для сканирования. */
  center: [number, number];
  zoom: number;
  /** Оповестить родителя об изменении слоя (после сохранения). */
  onSaved?: () => void;
}

type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; text: string };

/** Сформировать GeoJSON Feature из вершин обвода. */
export function draftToGeoJSON(points: [number, number][], name: string) {
  return {
    type: 'Feature' as const,
    geometry: {
      type: 'LineString' as const,
      // GeoJSON использует порядок [долгота, широта]
      coordinates: points.map(([lat, lon]) => [lon, lat]),
    },
    properties: { name, osiris_type: 'trench' },
  };
}

/** Приблизительная длина ломаной в км (гаверсинг). */
function lengthKm(points: [number, number][]): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    const [a1, o1] = points[i - 1];
    const [a2, o2] = points[i];
    const h =
      Math.sin(rad(a2 - a1) / 2) ** 2 +
      Math.cos(rad(a1)) * Math.cos(rad(a2)) * Math.sin(rad(o2 - o1) / 2) ** 2;
    s += 2 * R * Math.asin(Math.sqrt(h));
  }
  return s;
}

export default function TrenchScanner({
  drawActive, onToggleDraw, draft, onClearDraft, center, zoom, onSaved,
}: TrenchScannerProps) {
  const [name, setName] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' });
  const [scanResult, setScanResult] = useState<string | null>(null);

  /* ── Сохранение обвода: GeoJSON → POST /api/trenches ─────────────── */
  const save = useCallback(async () => {
    if (draft.points.length < 2) {
      setStatus({ kind: 'error', text: 'Обведите окоп полилинией (минимум 2 точки).' });
      return;
    }
    setStatus({ kind: 'busy', text: 'Сохранение…' });
    const id = `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    const feature = {
      id,
      type: 'trench' as const,
      name: name.trim() || `Укрепление ${new Date().toLocaleTimeString('ru-RU')}`,
      source: 'manual' as const,
      geometry: draftToGeoJSON(draft.points, name.trim() || 'Окоп (ручной обвод)'),
      lengthKm: Number(lengthKm(draft.points).toFixed(3)),
      createdAt: Date.now(),
    };
    try {
      const r = await fetch('/api/trenches', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(feature),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setStatus({ kind: 'error', text: j?.detail || j?.error || `Ошибка сохранения (${r.status}).` });
        return;
      }
      setStatus({ kind: 'ok', text: 'Сохранено в слой укреплений.' });
      onClearDraft();
      setName('');
      onSaved?.();
    } catch {
      setStatus({ kind: 'error', text: 'Сервер недоступен. Попробуйте позже.' });
    }
  }, [draft.points, name, onClearDraft, onSaved]);

  /* ── CV-сканирование области вокруг центра карты ──────────────────── */
  const scan = useCallback(async () => {
    setStatus({ kind: 'busy', text: 'Сканирование (фильтр «окоп vs дорога»)…' });
    // bbox ~ сторона квадрата, подогнанная под зум (0.5° максимум — лимит схемы)
    const half = Math.min(0.25, 3 / Math.max(1, zoom));
    const [lat, lon] = center;
    const bbox = [lon - half, lat - half, lon + half, lat + half];
    try {
      const r = await fetch('/api/trench-scan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bbox, autosave: false }),
      });
      const j = await r.json().catch(() => ({}));
      if (r.status === 429) {
        setStatus({ kind: 'error', text: j?.detail || 'Лимит: 10 запросов в минуту.' });
        return;
      }
      if (!r.ok) {
        setStatus({ kind: 'error', text: j?.detail || j?.error || `Ошибка сканирования (${r.status}).` });
        return;
      }
      const n = Array.isArray(j?.geojson?.features) ? j.geojson.features.length : 0;
      setScanResult(`Подтверждено кандидатов-окопов: ${n}. Отбраковано (дороги/ЛЭП): ${j?.scanned != null ? Math.max(0, j.scanned - n) : '—'}.`);
      setStatus({ kind: 'ok', text: 'Сканирование завершено.' });
      onSaved?.();
    } catch {
      setStatus({ kind: 'error', text: 'Сервер недоступен. Попробуйте позже.' });
    }
  }, [center, zoom, onSaved]);

  const len = draft.points.length >= 2 ? lengthKm(draft.points) : 0;

  return (
    <div className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] p-3 space-y-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold tracking-wider text-[var(--text-primary)]">
        <MapPin className="w-3.5 h-3.5" style={{ color: '#8D6E63' }} />
        КАРТОГРАФ УКРЕПЛЕНИЙ
      </div>

      {/* Инструмент «Полилиния» для ручного обвода */}
      <button
        onClick={onToggleDraw}
        className={`w-full flex items-center justify-center gap-2 rounded px-2 py-1.5 text-[10px] font-semibold transition-colors ${
          drawActive
            ? 'bg-[#8D6E63] text-white'
            : 'bg-[var(--bg-tertiary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
        }`}
      >
        <Crosshair className="w-3 h-3" />
        {drawActive ? 'Обвод активен — кликайте по карте' : 'Рисовать: Полилиния обвода'}
      </button>

      <input
        value={name}
        onChange={(e) => setName(e.target.value.slice(0, 120))}
        placeholder="Название (необязательно)"
        className="w-full rounded bg-[var(--bg-tertiary)] px-2 py-1 text-[10px] text-[var(--text-primary)] outline-none border border-transparent focus:border-[var(--border)]"
      />

      <div className="flex items-center justify-between text-[9px] text-[var(--text-muted)]">
        <span>Точек: {draft.points.length}</span>
        <span>{len > 0 ? `Длина: ${(len * 1000).toFixed(0)} м` : '—'}</span>
      </div>

      <div className="flex gap-1.5">
        <button
          onClick={save}
          disabled={draft.points.length < 2 || status.kind === 'busy'}
          className="flex-1 flex items-center justify-center gap-1 rounded bg-[#2E7D32] px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-40"
        >
          <Save className="w-3 h-3" /> Сохранить
        </button>
        <button
          onClick={scan}
          disabled={status.kind === 'busy'}
          className="flex-1 flex items-center justify-center gap-1 rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-[10px] font-bold text-[var(--text-primary)] disabled:opacity-40"
          title="CV-сканирование видимой области (OpenCV-фильтр «окоп vs дорога», лимит 10 зап./мин)"
        >
          <ScanLine className="w-3 h-3" /> Сканировать
        </button>
        <button
          onClick={() => { onClearDraft(); setScanResult(null); }}
          className="rounded bg-[var(--bg-tertiary)] px-2 py-1.5 text-[var(--text-muted)] hover:text-[#FF3D57]"
          title="Очистить обвод"
        >
          <Trash2 className="w-3 h-3" />
        </button>
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
