/**
 * TrenchesLayer — рендер статического слоя укреплений на MapLibre.
 *
 * Паттерн проекта: OsirisMap принимает готовый GeoJSON через проп и сам
 * вызывает addSource/addLayer (см. эффект ARCGIS LAYERS в OsirisMap.tsx).
 * Здесь — та же схема, но со специфичными для окопов layers:
 *   trenches-static-line    — линии траншей, цвет по статусу, пунктир;
 *   trenches-static-hover   — подсветка линии под курсором (над линией);
 *   trenches-static-points  — точки (блиндажи/ДОТ), цвет по типу;
 *   trenches-static-labels  — подписи «тип · длина» при zoom > 10.
 *
 * Никаких React/DOM-элементов на объект: всё рисует GPU MapLibre (ТЗ §5).
 * Popup/hover живут в эффекте OsirisMap, где уже есть helper попапов
 * и HTML-экранирование.
 */

import type maplibregl from 'maplibre-gl';
import type { StaticTrenchFC } from '@/lib/trench-static';

export const TRENCH_SRC = 'trenches-static';
const LINE = `${TRENCH_SRC}-line`;
const HOVER = `${TRENCH_SRC}-hover`;
const POINTS = `${TRENCH_SRC}-points`;
const LABELS = `${TRENCH_SRC}-labels`;

/** Все id слоёв слоя окопов (для teardown). */
export const TRENCH_LAYER_IDS = [LINE, HOVER, POINTS, LABELS] as const;

/** Полностью убрать слой с карты (слой выключен или компонент размонтирован). */
export function removeTrenchesLayers(map: maplibregl.Map) {
  TRENCH_LAYER_IDS.forEach((id) => { if (map.getLayer(id)) map.removeLayer(id); });
  if (map.getSource(TRENCH_SRC)) map.removeSource(TRENCH_SRC);
}

/**
 * Добавить/обновить слои окопов. Цвета берутся из properties ('color' —
 * статус, 'point_color' — тип): их подготовил trench-static.ts, поэтому
 * paint-выражения остаются простыми ['get', …]. Повторный вызов только
 * обновляет данные источника (фильтры панели = setData, без пересоздания).
 */
export function addTrenchesLayers(map: maplibregl.Map, data: StaticTrenchFC) {
  if (map.getSource(TRENCH_SRC)) {
    (map.getSource(TRENCH_SRC) as maplibregl.GeoJSONSource).setData(data as never);
    return;
  }
  map.addSource(TRENCH_SRC, { type: 'geojson', data: data as never });

  // Линии траншей: цвет по статусу (активный #e63946, заброшенный серый
  // пунктиром, уничтоженный красный полупрозрачный, неизвестный жёлтый).
  map.addLayer({
    id: LINE,
    type: 'line',
    source: TRENCH_SRC,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['get', 'color'],
      'line-width': ['interpolate', ['linear'], ['zoom'], 8, 1.5, 12, 2.5, 16, 3],
      'line-opacity': [
        'match', ['get', 'status'],
        'destroyed', 0.5,
        'abandoned', 0.8,
        'unknown', 0.9,
        0.95, // active и всё остальное
      ],
      'line-dasharray': [
        'case',
        ['==', ['get', 'status'], 'abandoned'], ['literal', [2, 2]],
        ['==', ['get', 'status'], 'destroyed'], ['literal', [3, 1.5]],
        ['literal', [1, 0]],
      ],
    },
  });

  // Точки: блиндажи / огневые точки / позиции. Радиус ~5 px, цвет по типу.
  map.addLayer({
    id: POINTS,
    type: 'circle',
    source: TRENCH_SRC,
    filter: ['==', ['geometry-type'], 'Point'],
    paint: {
      'circle-color': ['get', 'point_color'],
      'circle-radius': ['interpolate', ['linear'], ['zoom'], 8, 3.5, 12, 5, 16, 7],
      'circle-stroke-width': 1.5,
      'circle-stroke-color': '#0b0e1a',
      'circle-opacity': ['case', ['==', ['get', 'status'], 'destroyed'], 0.5, 0.95],
    },
  });

  // Подсветка под курсором: тот же источник, поверх обычной линии,
  // но под точками (moveLayer ставит её непосредственно перед POINTS).
  map.addLayer({
    id: HOVER,
    type: 'line',
    source: TRENCH_SRC,
    filter: ['==', ['geometry-type'], 'LineString'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#ffffff',
      'line-width': 5,
      'line-opacity': 0,
      'line-blur': 1.5,
    },
  });
  map.moveLayer(HOVER, POINTS);

  // Подписи «Тип · длина» — только при zoom > 10 (ТЗ §4.3).
  map.addLayer({
    id: LABELS,
    type: 'symbol',
    source: TRENCH_SRC,
    minzoom: 10,
    layout: {
      'text-field': ['get', 'label'],
      'text-size': 10,
      'text-font': ['Noto Sans Regular'],
      'text-offset': [0, 1.1],
      'text-anchor': 'top',
      'text-max-width': 12,
    },
    paint: {
      'text-color': '#E8E6E0',
      'text-halo-color': 'rgba(4,4,10,0.9)',
      'text-halo-width': 1.4,
    },
  });
}
