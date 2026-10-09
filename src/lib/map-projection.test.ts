import { describe, expect, it, vi } from 'vitest';
import type { Map } from 'maplibre-gl';

import { applyMapProjection } from './map-projection';

/* The map runs on MapLibre 4.7 (WebGL1-capable) after the WebGL2-only v6
   broke software-rendering machines. 4.x exposes getGlobe/setGlobe rather
   than the v6 getProjection surface, so the helpers target that API. */
function fixture(initial = false) {
  let globe = initial;
  const map = {
    getGlobe: () => globe,
    setGlobe: vi.fn((next: boolean) => { globe = next; }),
  };
  return { map: map as unknown as Map, set: map.setGlobe };
}

describe('map projection (maplibre 4.x)', () => {
  it('switches to globe via setGlobe', () => {
    const { map, set } = fixture(false);
    expect(applyMapProjection(map, 'globe')).toBe(true);
    expect(set).toHaveBeenCalledWith(true);
  });

  it('switches back to mercator', () => {
    const { map, set } = fixture(true);
    expect(applyMapProjection(map, 'mercator')).toBe(true);
    expect(set).toHaveBeenCalledWith(false);
  });

  it('is a no-op when already in the requested mode', () => {
    const { map, set } = fixture(true);
    expect(applyMapProjection(map, 'globe')).toBe(false);
    expect(set).not.toHaveBeenCalled();
  });

  it('terrain flag no longer changes the projection spec', () => {
    const { map, set } = fixture(false);
    applyMapProjection(map, 'globe', true);
    expect(set).toHaveBeenCalledWith(true);
  });
});
