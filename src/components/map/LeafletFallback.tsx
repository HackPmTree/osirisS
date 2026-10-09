'use client';

/**
 * LeafletFallback — режим совместимости без WebGL.
 *
 * Когда MapLibre не смог создать WebGL-контекст (Linux + Mesa llvmpipe,
 * WSL2, старые GPU), OsirisMap переключается на этот компонент: Leaflet
 * рисует через Canvas/SVG/DOM и GPU не требует.
 *
 * Принципы (ТЗ «Leaflet fallback»):
 *  - НЕ переписываем слои — читаем те же props, что получает OsirisMap,
 *    и конвертируем их в Leaflet-слои императивно (один L.LayerGroup на
 *    слой, НЕ React-компонент на каждый объект);
 *  - стили совпадают с MapLibre: цвета статусов берутся из свойств
 *    GeoJSON ('color', 'point_color'), те же размеры;
 *  - клик → popup с теми же полями, hover → подсветка (setStyle);
 *  - недоступные без WebGL слои (спутник custom-layer, живые облака,
 *    OI-глобус, террейн, CCTV/Live-News видео-превью) здесь не
 *    рендерятся — список UNSUPPORTED_LAYERS, баннер предупреждает;
 *  - тайлы: тёмная подложка CARTO Dark (как базовый стиль MapLibre в
 *    OSIRIS) через существующий прокси /api/proxy-tiles;
 *  - рендер точек/линий — L.canvas(), быстрее SVG на тысячах объектов.
 *
 * Используется чистый Leaflet (без react-leaflet): проект на React 19,
 * а прямые вызовы L.* держатся того же imperative-паттерна, что уже
 * применён в OsirisMap (addSource/addLayer вне React-дерева).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { TRENCH_TYPE_LABEL_RU, TRENCH_STATUS_LABEL_RU, type TrenchStatus, type TrenchType } from '@/types/trench';

/* ─────────────────────────── типы пропсов ─────────────────────────── */

interface FcLike {
  type?: string;
  features?: GeoJSON.Feature[];
}

export interface LeafletFallbackProps {
  data: any;
  activeLayers: Record<string, boolean>;
  /** Отфильтрованный FeatureCollection окопов (демо + сканы). */
  staticTrenches?: unknown | null;
  drawnPolygons?: Array<{ id: string; name: string; geojson: GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.LineString>; color: string }>;
  route?: {
    geometry: { type: 'LineString'; coordinates: [number, number][] };
    from: { lat: number; lng: number };
    to: { lat: number; lng: number };
    alternates?: Array<{ type: 'LineString'; coordinates: [number, number][] }>;
    activeSegment?: [number, number][] | null;
  } | null;
  userLocation?: { lat: number; lng: number; accuracy?: number; heading?: number | null } | null;
  flyToLocation?: { lat: number; lng: number; zoom?: number; duration?: number; ts: number; bounds?: { west: number; south: number; east: number; north: number } } | null;
  onEntityClick?: (entity: any) => void;
  onMouseCoords?: (coords: { lat: number; lng: number }) => void;
  onRightClick?: (coords: { lat: number; lng: number }) => void;
  onViewStateChange?: (vs: { zoom: number; latitude: number }) => void;
  onMapCenter?: (coords: { lat: number; lng: number; bounds?: { west: number; south: number; east: number; north: number } }) => void;
  /** Как и у MapLibre-версии: fires once, when the fallback drew its first frame. */
  onReady?: () => void;
}

/** Слои, которые технически невозможны без WebGL — их нет в fallback. */
export const UNSUPPORTED_LAYERS = [
  'satellites',        // custom WebGL-слой с pick()
  'live_clouds',       // GPU-текстуры
  'oi_globe',          // Deck.gl-оверлей
  'terrain_elevation', // 3D-рельеф
  'day_night',         // terminator-полигон завязан на globe-стиль
] as const;

/* ─────────────────────────── helpers ─────────────────────────── */

const esc = (s: unknown): string => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Тёмная подложка CARTO — тот же источник, что у MapLibre-стиля OSIRIS,
 *  через внутренний прокси (CARTO лимитирует прямые запросы). */
const darkTiles = (url: string) =>
  L.tileLayer(`/api/proxy-tiles?url=${encodeURIComponent(url)}`, {
    maxZoom: 18,
    attribution: '© OpenStreetMap © CARTO',
  });

const POPUP_CLASS = 'osiris-leaflet-popup';

/** Общий стиль попапа — тёмная карточка как в MapLibre-версии. */
function popupHtml(title: string, titleColor: string, rows: Array<[string, string | number | undefined]>, footer?: string, notes?: string): string {
  return `<div style="font-family:'JetBrains Mono',monospace;font-size:11px;color:#E8E6E0;min-width:180px;">
    <div style="font-size:12px;letter-spacing:0.08em;color:${titleColor};margin-bottom:6px;">▮ ${esc(title)}</div>
    <table style="width:100%;border-collapse:collapse;line-height:1.7;">
      ${rows.map(([k, v]) => `<tr><td style="color:rgba(255,255,255,0.4);padding-right:8px;">${esc(k)}</td><td>${esc(v == null || v === '' ? '—' : v)}</td></tr>`).join('')}
    </table>
    ${notes ? `<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.55);">${esc(notes)}</div>` : ''}
    ${footer ? `<div style="margin-top:6px;font-size:8.5px;letter-spacing:0.18em;color:rgba(255,255,255,0.3);">${esc(footer)}</div>` : ''}
  </div>`;
}

function makePopup(content: string, latlng: L.LatLngExpression): L.Popup {
  return L.popup({ className: POPUP_CLASS, maxWidth: 360, autoPan: true }).setContent(content).setLatLng(latlng);
}

/* ─────────────────────── определение движка ─────────────────────── */

/** Быстрая проверка доступности WebGL (тот же критерий, что валит MapLibre).
 *  Экспортируется на случай явного выбора движка извне. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

/* ─────────────────────────── компонент ─────────────────────────── */

type GroupName = 'earthquakes' | 'fires' | 'gdelt' | 'maritime' | 'flights' | 'cctv' | 'news' | 'route' | 'drawn' | 'trenches' | 'user';

interface PointSpec {
  coord: (d: any) => [number, number] | null; // [lat,lng]
  radius: (d: any) => number;
  color: (d: any) => string;
  title: (d: any) => string;
  rows: (d: any) => Array<[string, string | number | undefined]>;
  /** Если задан — клик шлёт entity в панель (как cctv/news в MapLibre), вместо popup. */
  entity?: (d: any) => any;
}

export default function LeafletFallback(props: LeafletFallbackProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapObjRef = useRef<L.Map | null>(null);
  /* Один L.LayerGroup на слой: данные обновляются через clearLayers +
     addLayer, React-элементов на объект нет (ТЗ §производительность). */
  const groupsRef = useRef<Partial<Record<GroupName, L.LayerGroup>>>({});
  const canvasRef = useRef<L.Canvas | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;

  /* ── init ── */
  useEffect(() => {
    if (!containerRef.current || mapObjRef.current) return;
    const facingLng = Math.max(-180, Math.min(180, -new Date().getTimezoneOffset() / 4));
    const map = L.map(containerRef.current, {
      center: [20, facingLng],
      zoom: 2,
      minZoom: 1,
      maxZoom: 18,
      worldCopyJump: true,
      zoomControl: false,
      attributionControl: true,
    });
    mapObjRef.current = map;
    canvasRef.current = L.canvas({ padding: 0.4 });

    darkTiles('https://basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png').addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    /* Именованные группы — порядок добавления = z-порядок. */
    const order: GroupName[] = ['earthquakes', 'fires', 'gdelt', 'maritime', 'flights', 'cctv', 'news', 'route', 'drawn', 'trenches', 'user'];
    for (const n of order) groupsRef.current[n] = L.layerGroup().addTo(map);

    /* События карты — те же колбэки, что у MapLibre-версии. */
    map.on('mousemove', (e) => {
      propsRef.current.onMouseCoords?.({ lat: e.latlng.lat, lng: e.latlng.lng });
    });
    // Правый клик в Leaflet по умолчанию открывает меню браузера;
    // перехватываем его ради search-by-location, как в MapLibre.
    const el = map.getContainer();
    const onCtx = (ev: MouseEvent) => {
      ev.preventDefault();
      const p = map.mouseEventToLatLng(ev);
      propsRef.current.onRightClick?.({ lat: p.lat, lng: p.lng });
    };
    el.addEventListener('contextmenu', onCtx);

    const report = () => {
      const c = map.getCenter();
      const b = map.getBounds();
      propsRef.current.onViewStateChange?.({ zoom: map.getZoom(), latitude: c.lat });
      propsRef.current.onMapCenter?.({
        lat: c.lat, lng: c.lng,
        bounds: { west: b.getWest(), south: b.getSouth(), east: b.getEast(), north: b.getNorth() },
      });
    };
    map.on('moveend zoomend', report);
    report();

    // Контейнер дашборда меняет размер после снятия splash-экрана.
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(el);

    propsRef.current.onReady?.();

    return () => {
      ro.disconnect();
      el.removeEventListener('contextmenu', onCtx);
      map.remove();
      mapObjRef.current = null;
      groupsRef.current = {};
      canvasRef.current = null;
    };
  }, []);

  /* ── fly-to (locate из фидов, поиск) ── */
  const flyTs = props.flyToLocation?.ts;
  useEffect(() => {
    const map = mapObjRef.current;
    const f = propsRef.current.flyToLocation;
    if (!map || !f) return;
    if (f.bounds) {
      map.fitBounds([[f.bounds.south, f.bounds.west], [f.bounds.north, f.bounds.east]], { padding: [40, 40] });
    } else {
      map.flyTo([f.lat, f.lng], f.zoom ?? 12, { duration: (f.duration ?? 2000) / 1000 });
    }
  }, [flyTs]);

  /* ── билдер слоя точек (circleMarker на canvas-рендерере) ── */
  const pointLayer = useCallback((name: GroupName, items: any[] | undefined | null, opts: PointSpec) => {
    const map = mapObjRef.current;
    const group = groupsRef.current[name];
    const canvas = canvasRef.current;
    if (!map || !group || !canvas) return;
    group.clearLayers();
    for (const d of items || []) {
      const pair = opts.coord(d);
      if (!pair || Number.isNaN(pair[0]) || Number.isNaN(pair[1])) continue;
      const r = opts.radius(d);
      const c = opts.color(d);
      const m = L.circleMarker(pair, { renderer: canvas, radius: r, color: c, weight: 1.5, fillColor: c, fillOpacity: 0.85, opacity: 0.9 });
      m.on('mouseover', () => { m.setStyle({ radius: r + 3, fillOpacity: 1, weight: 2.5 }); map.getContainer().style.cursor = 'pointer'; });
      m.on('mouseout', () => { m.setStyle({ radius: r, fillOpacity: 0.85, weight: 1.5 }); map.getContainer().style.cursor = ''; });
      m.on('click', (e) => {
        L.DomEvent.stopPropagation(e as any);
        if (opts.entity) { propsRef.current.onEntityClick?.(opts.entity(d)); return; }
        makePopup(popupHtml(opts.title(d), c, opts.rows(d)), (e.target as L.CircleMarker).getLatLng()).openOn(map);
      });
      group.addLayer(m);
    }
  }, []);

  /* ── перерисовка при изменении данных/фильтров слоёв ── */
  const dataRef = props.data;
  const alRef = props.activeLayers;
  const trenchRef = props.staticTrenches;
  const drawnRef = props.drawnPolygons;
  const routeRef = props.route;
  const userRef = props.userLocation;
  useEffect(() => {
    const map = mapObjRef.current;
    const canvas = canvasRef.current;
    if (!map || !canvas) return;
    const al = propsRef.current.activeLayers;
    const d = propsRef.current.data;

    /* ── ОКОПЫ (главный слой ТЗ): линии по статусу + точки по типу ── */
    const tg = groupsRef.current.trenches!;
    tg.clearLayers();
    const fc = (propsRef.current.staticTrenches ?? null) as FcLike | null;
    const feats = al.trench_static && fc?.features ? fc.features : [];
    const trenchPopup = (p: any, latlng: L.LatLngExpression) => {
      const typeRu = TRENCH_TYPE_LABEL_RU[p?.trench_type as TrenchType] ?? 'Укрепление';
      const statusRu = TRENCH_STATUS_LABEL_RU[p?.status as TrenchStatus] ?? '—';
      const lenM = typeof p?.length_m === 'number' ? `${Math.round(p.length_m)} м` : undefined;
      const conf = typeof p?.confidence === 'number' ? `${Math.round(p.confidence * 100)}%` : undefined;
      /* Честно показываем происхождение: демо-файл vs реальный скан. */
      const originRu = p?.origin === 'scanned'
        ? 'Обнаружено сканером / сохранено оператором'
        : 'Демо-разметка (файл trenches.geojson)';
      return makePopup(popupHtml(
        typeRu, p?.color || '#e63946',
        [['Статус', statusRu], ['Длина', lenM], ['Достоверность', conf], ['Источник', p?.source], ['Происхождение', originRu]],
        p?.id, p?.notes,
      ), latlng);
    };
    for (const f of feats) {
      const p = (f.properties ?? {}) as any;
      const geom = f.geometry as any;
      if (!geom) continue;
      const color: string = p.color || '#e63946';
      if (geom.type === 'LineString') {
        const latlngs = geom.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]);
        const abandoned = p.status === 'abandoned';
        const baseOpacity = p.status === 'destroyed' ? 0.55 : 0.95;
        const line = L.polyline(latlngs, { renderer: canvas, color, weight: 2.5, opacity: baseOpacity, dashArray: abandoned ? [6, 6] : undefined, lineCap: 'round' });
        line.on('mouseover', () => { line.setStyle({ weight: 5, opacity: 1 }); map.getContainer().style.cursor = 'pointer'; });
        line.on('mouseout', () => { line.setStyle({ weight: 2.5, opacity: baseOpacity }); map.getContainer().style.cursor = ''; });
        line.on('click', (e) => {
          L.DomEvent.stopPropagation(e as any);
          const mid = latlngs[Math.floor(latlngs.length / 2)];
          trenchPopup(p, mid).openOn(map);
        });
        tg.addLayer(line);
        /* Подпись «тип · длина» — аналог symbol-layer MapLibre. */
        if (typeof p.label === 'string' && p.label) {
          const mid = latlngs[Math.floor(latlngs.length / 2)];
          tg.addLayer(L.marker(mid, {
            icon: L.divIcon({ className: 'osiris-trench-label', html: esc(p.label), iconSize: [140, 14], iconAnchor: [70, 7] }),
            interactive: false,
          }));
        }
      } else if (geom.type === 'Point') {
        const ll: [number, number] = [geom.coordinates[1], geom.coordinates[0]];
        const ptColor: string = p.point_color || color;
        const cm = L.circleMarker(ll, { renderer: canvas, radius: 5, color: ptColor, weight: 1.5, fillColor: ptColor, fillOpacity: 0.9 });
        cm.on('mouseover', () => { cm.setStyle({ radius: 8, fillOpacity: 1 }); map.getContainer().style.cursor = 'pointer'; });
        cm.on('mouseout', () => { cm.setStyle({ radius: 5, fillOpacity: 0.9 }); map.getContainer().style.cursor = ''; });
        cm.on('click', (e) => {
          L.DomEvent.stopPropagation(e as any);
          trenchPopup(p, cm.getLatLng()).openOn(map);
        });
        tg.addLayer(cm);
      }
    }

    /* ── САМОЛЁТЫ (commercial/private/jets/military) — та же палитра ── */
    const flightColor = (f: any): string =>
      f.__kind === 'military' ? '#D32F2F' : f.__kind === 'private' ? '#26A69A' : f.__kind === 'jets' ? '#B388FF' : '#00E5FF';
    const flightList = [
      ...(al.flights ? (d.commercial_flights ?? []).filter((_: any, i: number) => i % 10 === 0).map((f: any) => ({ ...f, __kind: 'commercial' })) : []),
      ...(al.private ? (d.private_flights ?? []).filter((_: any, i: number) => i % 2 === 0).map((f: any) => ({ ...f, __kind: 'private' })) : []),
      ...(al.jets ? (d.private_jets ?? []).map((f: any) => ({ ...f, __kind: 'jets' })) : []),
      ...(al.military ? (d.military_flights ?? []).map((f: any) => ({ ...f, __kind: 'military' })) : []),
    ];
    pointLayer('flights', flightList, {
      coord: (f) => [f.lat, f.lng],
      radius: () => 4,
      color: flightColor,
      title: (f) => f.callsign || 'Борт',
      rows: (f) => [['Модель', f.model], ['Высота', f.alt != null ? `${f.alt} м` : undefined], ['Скорость', f.speed_knots != null ? `${f.speed_knots} уз` : undefined], ['Регистрация', f.registration], ['icao24', f.icao24]],
    });

    /* ── МОРСКИЕ (порты / проливы / суда) ── */
    const maritimeList = al.maritime
      ? [
          ...(d.maritime_ports ?? []).map((p: any) => ({ ...p, __t: 'порт' })),
          ...(d.maritime_chokepoints ?? []).map((c: any) => ({ ...c, __t: 'пролив' })),
          ...(d.maritime_ships ?? []).map((s: any) => ({ ...s, __t: 'судно' })),
        ]
      : [];
    pointLayer('maritime', maritimeList, {
      coord: (x) => [x.lat, x.lng],
      radius: (x) => (x.__t === 'судно' ? 3 : x.volume ? Math.min(8, 3 + Math.log10(Number(x.volume) || 1)) : 5),
      color: (x) => (x.__t === 'судно' ? '#4FC3F7' : x.__t === 'пролив' ? '#ffd166' : '#D4AF37'),
      title: (x) => `${x.__t}: ${x.name || ''}`,
      rows: (x) => x.__t === 'судно'
        ? [['Тип', x.type], ['Скорость', x.speed != null ? `${x.speed} уз` : undefined], ['Флаг', x.flag], ['Назначение', x.destination]]
        : x.__t === 'пролив'
          ? [['Трафик', x.traffic], ['Риск', x.risk]]
          : [['Страна', x.country], ['Тип', x.type], ['Объём', x.volume]],
    });

    /* ── ЗЕМЛЕТРЯСЕНИЯ (природные угрозы) ── */
    pointLayer('earthquakes', al.earthquakes ? d.earthquakes : [], {
      coord: (e) => [e.lat, e.lng],
      radius: (e) => Math.max(3, Math.min(12, (e.magnitude ?? 3) * 1.4)),
      color: (e) => (e.magnitude >= 6 ? '#D32F2F' : e.magnitude >= 4.5 ? '#E65100' : '#ffd166'),
      title: (e) => `Землетрясение M${e.magnitude ?? '?'}`,
      rows: (e) => [['Место', e.place], ['Глубина', e.depth != null ? `${e.depth} км` : undefined], ['Источник', e.source]],
    });

    /* ── ПОЖАРЫ (природные угрозы) ── */
    pointLayer('fires', al.fires ? d.fires : [], {
      coord: (f) => [f.lat, f.lng],
      radius: () => 3,
      color: () => '#E65100',
      title: () => 'Пожар (VIIRS)',
      rows: (f) => [['Яркость', f.brightness]],
    });

    /* ── ГЛОБАЛЬНЫЕ ИНЦИДЕНТЫ (GDELT) ── */
    pointLayer('gdelt', al.global_incidents ? d.gdelt : [], {
      coord: (e) => [e.lat, e.lng],
      radius: () => 3.5,
      color: () => '#e63946',
      title: (e) => e.name || 'Инцидент',
      rows: (e) => [['Тип', e.type], ['Ссылка', e.url]],
    });

    /* ── КАМЕРЫ CCTV (клик открывает CameraViewer, как в MapLibre) ── */
    pointLayer('cctv', al.cctv ? d.cameras : [], {
      coord: (c) => [c.lat, c.lng],
      radius: () => 4,
      color: () => '#00E5FF',
      title: (c) => c.name || 'Камера',
      rows: (c) => [['Город', c.city], ['Страна', c.country], ['Источник', c.source]],
      entity: (c) => ({ type: 'cctv', ...c }),
    });

    /* ── LIVE NEWS (клик открывает фид) ── */
    pointLayer('news', al.live_news ? d.live_feeds : [], {
      coord: (f) => [f.lat, f.lng],
      radius: () => 4,
      color: () => '#FF3D71',
      title: (f) => f.name || 'Трансляция',
      rows: (f) => [['Город', f.city], ['Страна', f.country], ['Категория', f.category]],
      entity: (f) => ({ type: 'live_news', name: f.name, city: f.city, country: f.country, url: f.url, category: f.category, embed_allowed: f.embed_allowed !== false }),
    });

    /* ── РИСОВАННЫЕ AOI оператора ── */
    const dg = groupsRef.current.drawn!;
    dg.clearLayers();
    for (const poly of propsRef.current.drawnPolygons ?? []) {
      const g = poly.geojson?.geometry as any;
      if (!g) continue;
      const style = { renderer: canvas, color: poly.color, weight: 2, fillColor: poly.color, fillOpacity: 0.15 };
      if (g.type === 'Polygon') {
        dg.addLayer(L.polygon(g.coordinates[0].map((c: [number, number]) => [c[1], c[0]] as [number, number]), style));
      } else if (g.type === 'LineString') {
        dg.addLayer(L.polyline(g.coordinates.map((c: [number, number]) => [c[1], c[0]] as [number, number]), style));
      }
    }

    /* ── МАРШРУТ (turn-by-turn) ── */
    const rg = groupsRef.current.route!;
    rg.clearLayers();
    const r = propsRef.current.route;
    if (r?.geometry) {
      for (const alt of r.alternates ?? []) {
        rg.addLayer(L.polyline(alt.coordinates.map((c) => [c[1], c[0]] as [number, number]), { renderer: canvas, color: '#555', weight: 3, opacity: 0.5 }));
      }
      rg.addLayer(L.polyline(r.geometry.coordinates.map((c) => [c[1], c[0]] as [number, number]), { renderer: canvas, color: '#00E5FF', weight: 4, opacity: 0.95 }));
      rg.addLayer(L.circleMarker([r.from.lat, r.from.lng], { renderer: canvas, radius: 6, color: '#fff', weight: 2, fillColor: '#26A69A', fillOpacity: 1 }));
      rg.addLayer(L.circleMarker([r.to.lat, r.to.lng], { renderer: canvas, radius: 6, color: '#fff', weight: 2, fillColor: '#e63946', fillOpacity: 1 }));
    }

    /* ── ПОЗИЦИЯ ПОЛЬЗОВАТЕЛЯ ── */
    const ug = groupsRef.current.user!;
    ug.clearLayers();
    const u = propsRef.current.userLocation;
    if (u) {
      if (u.accuracy) ug.addLayer(L.circle([u.lat, u.lng], { renderer: canvas, radius: u.accuracy, color: '#00E5FF', weight: 1, fillOpacity: 0.08 }));
      ug.addLayer(L.circleMarker([u.lat, u.lng], { renderer: canvas, radius: 6, color: '#fff', weight: 2, fillColor: '#00E5FF', fillOpacity: 1 }));
    }
  }, [dataRef, alRef, trenchRef, drawnRef, routeRef, userRef, pointLayer]);

  return (
    <>
      <div ref={containerRef} className="absolute inset-0 z-0 w-full h-full" style={{ background: '#0b0b0b' }} />
      {/* CSS попапов/подписей Leaflet в стиле OSIRIS (тёмные карточки). */}
      <style>{`
        .${POPUP_CLASS} .leaflet-popup-content-wrapper {
          background: rgba(12, 14, 26, 0.95);
          color: #E8E6E0;
          border: 1px solid rgba(230, 57, 70, 0.4);
          border-radius: 10px;
          box-shadow: 0 8px 32px rgba(0,0,0,0.6);
        }
        .${POPUP_CLASS} .leaflet-popup-tip { background: rgba(12, 14, 26, 0.95); }
        .${POPUP_CLASS} .leaflet-popup-close-button { color: #8a8a8a !important; }
        .osiris-trench-label {
          color: #cfcfcf;
          font: 500 9px/1 'JetBrains Mono', monospace;
          letter-spacing: 0.08em;
          text-align: center;
          text-shadow: 0 1px 3px #000, 0 0 6px #000;
          pointer-events: none;
          white-space: nowrap;
        }
        .leaflet-container { background: #0b0b0b; font-family: 'JetBrains Mono', monospace; }
        .osiris-compat-banner {
          position: absolute; top: 56px; left: 50%; transform: translateX(-50%);
          z-index: 500; display: flex; align-items: center; gap: 10px;
          max-width: min(92vw, 680px);
          background: rgba(255, 209, 102, 0.12); border: 1px solid rgba(255, 209, 102, 0.5);
          color: #ffd166; font: 400 11px/1.5 'JetBrains Mono', monospace;
          padding: 8px 12px; border-radius: 8px; backdrop-filter: blur(8px);
        }
        .osiris-compat-banner a { color: #ffe3a3; }
        .osiris-compat-banner button {
          background: none; border: 1px solid rgba(255,209,102,.4); color: #ffd166;
          border-radius: 4px; padding: 1px 8px; cursor: pointer; font: inherit; flex-shrink: 0;
        }
      `}</style>
    </>
  );
}

/* ─────────────────── баннер режима совместимости ─────────────────── */

export function WebGLFallbackBanner() {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  return (
    <div className="osiris-compat-banner" role="status">
      <span aria-hidden>⚠</span>
      <span>
        WebGL недоступен — включён режим совместимости (Leaflet). Часть слоёв
        (спутники, живые облака, рельеф, глобус OI) недоступна без WebGL.{' '}
        <a href="https://developer.chrome.com/docs/devtools/rendering" target="_blank" rel="noreferrer">Как включить WebGL →</a>
      </span>
      <button onClick={() => setHidden(true)}>Скрыть</button>
    </div>
  );
}
