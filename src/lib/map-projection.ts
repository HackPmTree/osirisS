import type { Map } from 'maplibre-gl';

/* MapLibre 4.7-compatible projection helpers. The WebGL1-capable downgrade
   (MapLibre 6.x requires WebGL2, which fails on llvmpipe/software renderers)
   removed the zoom-interpolated projection expressions and `getProjection`;
   4.x exposes a boolean `map.getGlobe()`/`setGlobe()` surface instead. Globe
   in 4.x is adaptive by default (it flattens to mercator as you zoom in), so
   the terrain-specific interpolated variant from the v6 code path is no
   longer needed — plain globe covers both cases. */

export function applyMapProjection(
  map: Map,
  mode: 'globe' | 'mercator',
  _terrainEnabled = false,
): boolean {
  const wantGlobe = mode === 'globe';
  let current: boolean;
  try {
    current = typeof map.getGlobe === 'function' ? !!map.getGlobe() : false;
  } catch {
    current = false;
  }
  if (current === wantGlobe) return false;
  try {
    map.setGlobe(wantGlobe);
  } catch {
    /* setGlobe may be unavailable on very old builds; fall back to style
       projection, which 4.7 also understands as a constant string. */
    try { map.setProjection({ type: wantGlobe ? 'globe' : 'mercator' } as never); } catch { /* ignore */ }
  }
  return true;
}
