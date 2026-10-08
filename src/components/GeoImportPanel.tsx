'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { FileUp, Link as LinkIcon, Trash2, X, MapPinned, Download } from 'lucide-react';
import { importFromFile, loadFromUrl, type GeoImportResult } from '@/lib/geo-import';

export interface ImportedLayer {
  id: string;
  title: string;
  geojson: any;
  color?: string;
  opacity?: number;
}

interface Props {
  importedLayers: ImportedLayer[];
  onAddLayer: (layer: ImportedLayer) => void;
  onRemoveLayer: (id: string) => void;
  /** lat/lng bounds of the newest import — the page flies there. */
  onBounds?: (b: { west: number; south: number; east: number; north: number }) => void;
  /** Скрыть кнопку закрытия (когда панель живёт внутри левого меню слоёв). */
  hideClose?: boolean;
}

const COLORS = ['#FF4081', '#00E5FF', '#FFD700', '#76FF03', '#FF6D00', '#B388FF'];

function bboxOf(geojson: any): { west: number; south: number; east: number; north: number } | null {
  let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
  const walk = (coords: any) => {
    if (!Array.isArray(coords)) return;
    if (typeof coords[0] === 'number') {
      if (Number.isFinite(coords[0]) && Number.isFinite(coords[1])) {
        w = Math.min(w, coords[0]); e = Math.max(e, coords[0]);
        s = Math.min(s, coords[1]); n = Math.max(n, coords[1]);
      }
      return;
    }
    coords.forEach(walk);
  };
  for (const f of geojson?.features ?? []) walk(f?.geometry?.coordinates);
  if (!Number.isFinite(w)) return null;
  return { west: w, south: s, east: e, north: n };
}

/** Rough feature-centroid for a single-point imports (fitBounds is a no-op there). */
function firstPoint(geojson: any): { lat: number; lng: number } | null {
  const f = geojson?.features?.[0];
  const c = f?.geometry?.coordinates;
  if (Array.isArray(c) && typeof c[0] === 'number') return { lat: c[1], lng: c[0] };
  return null;
}

export default function GeoImportPanel({ importedLayers, onAddLayer, onRemoveLayer, onBounds }: Props) {
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const statusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => { if (statusTimer.current) clearTimeout(statusTimer.current); }, []);

  const flash = (kind: 'ok' | 'err', text: string) => {
    setStatus({ kind, text });
    if (statusTimer.current) clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(null), 6000);
  };

  const take = useCallback((res: GeoImportResult, title?: string) => {
    const id = `geo-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    const color = COLORS[importedLayers.length % COLORS.length];
    onAddLayer({ id, title: title || res.name, geojson: res.geojson, color, opacity: 0.9 });
    const bb = bboxOf(res.geojson);
    if (bb) {
      // a single point collapses to zero area — give the page a center instead
      if (bb.west === bb.east && bb.south === bb.north) {
        const pad = 0.02;
        onBounds?.({ west: bb.west - pad, south: bb.south - pad, east: bb.east + pad, north: bb.north + pad });
      } else {
        onBounds?.(bb);
      }
    }
    flash('ok', `Импортировано объектов: ${res.count}${res.name ? ` (${res.name})` : ''}`);
  }, [importedLayers.length, onAddLayer, onBounds]);

  const handleFiles = useCallback(async (files: FileList | File[]) => {
    const list = Array.from(files).filter(Boolean);
    if (!list.length) return;
    setBusy(true);
    try {
      for (const file of list) {
        const res = await importFromFile(file);
        take(res, file.name.replace(/\.[^.]+$/, ''));
      }
    } catch (e: any) {
      flash('err', e?.message || 'Не удалось прочитать файл.');
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }, [take]);

  const handleLink = useCallback(async () => {
    const value = link.trim();
    if (!value) return;
    setBusy(true);
    try {
      const res = await loadFromUrl(value);
      take(res);
      setLink('');
    } catch (e: any) {
      flash('err', e?.message || 'Ссылка не разобрана.');
    } finally {
      setBusy(false);
    }
  }, [link, take]);

  const exportAll = useCallback(() => {
    if (!importedLayers.length) return;
    const features = importedLayers.flatMap(l => l.geojson?.features ?? []);
    const blob = new Blob([JSON.stringify({ type: 'FeatureCollection', features })], { type: 'application/geo+json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'imported-layers.geojson';
    a.click();
    URL.revokeObjectURL(url);
  }, [importedLayers]);

  return (
    <div
      className={`glass-panel p-3 space-y-2.5 transition-colors ${dragOver ? 'border-[var(--cyan-primary)]/60' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); void handleFiles(e.dataTransfer.files); }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-[10px] font-mono font-bold tracking-widest text-[var(--cyan-primary)]">
          <MapPinned className="w-3.5 h-3.5" /> ИМПОРТ КАРТЫ
        </div>
        {importedLayers.length > 0 && (
          <button onClick={exportAll} title="Сохранить все импортированные слои в GeoJSON" aria-label="Экспорт в GeoJSON"
            className="text-white/40 hover:text-white transition-colors p-1">
            <Download className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      <p className="text-[9px] font-mono text-[var(--text-muted)] leading-relaxed">
        Перетащите сюда файл KML/KMZ, GeoJSON, GPX или ссылку Яндекс Карт — например экспорт карты СВО из Яндекс Карт.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept=".geojson,.json,.kml,.kmz,.gpx,.topojson,application/geo+json,application/vnd.google-earth.kml+xml,application/vnd.google-earth.kmz,application/xml,text/xml"
        multiple
        className="hidden"
        onChange={(e) => { if (e.target.files) void handleFiles(e.target.files); }}
      />
      <button
        type="button"
        disabled={busy}
        onClick={() => fileRef.current?.click()}
        className="w-full flex items-center justify-center gap-2 px-2 py-2 rounded border border-dashed border-white/20 hover:border-[var(--cyan-primary)]/70 hover:bg-[var(--cyan-primary)]/5 text-[10px] font-mono tracking-wider text-white/70 transition-colors disabled:opacity-40"
      >
        <FileUp className="w-3.5 h-3.5" /> {busy ? 'ЗАГРУЗКА…' : 'ВЫБРАТЬ ФАЙЛ'}
      </button>

      <div className="flex gap-1.5">
        <input
          value={link}
          onChange={(e) => setLink(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleLink(); }}
          placeholder="Ссылка Яндекс Карт или файл по URL…"
          className="flex-1 min-w-0 bg-black/40 border border-white/10 rounded px-2 py-1.5 text-[10px] font-mono text-white placeholder:text-white/25 focus:outline-none focus:border-[var(--cyan-primary)]/60"
        />
        <button
          type="button"
          disabled={busy || !link.trim()}
          onClick={() => void handleLink()}
          className="px-2 rounded bg-[var(--cyan-primary)]/15 border border-[var(--cyan-primary)]/40 text-[var(--cyan-primary)] hover:bg-[var(--cyan-primary)]/25 transition-colors disabled:opacity-40"
          title="Импортировать по ссылке"
          aria-label="Импортировать по ссылке"
        >
          <LinkIcon className="w-3.5 h-3.5" />
        </button>
      </div>

      {status && (
        <motion.div
          initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
          className={`text-[9px] font-mono px-2 py-1.5 rounded border ${
            status.kind === 'ok'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {status.text}
        </motion.div>
      )}

      {importedLayers.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-white/5">
          {importedLayers.map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-[10px] font-mono">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: l.color || '#D4AF37' }} />
              <span className="flex-1 truncate text-white/80" title={l.title}>{l.title}</span>
              <span className="text-white/35">{l.geojson?.features?.length ?? 0}</span>
              <button onClick={() => onRemoveLayer(l.id)} className="text-white/40 hover:text-red-400 transition-colors p-0.5"
                title="Удалить слой" aria-label={`Удалить слой ${l.title}`}>
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
