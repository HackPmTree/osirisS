/**
 * Geo-import helpers — turn whatever the operator drops into the panel
 * (GeoJSON, GPX, KML/KMZ, TopoJSON, a Yandex Maps share link, or plain map
 * coordinates) into a GeoJSON FeatureCollection the map can draw.
 *
 * Everything here is pure and offline-safe: no network calls except for
 * fetching an explicit URL handed to `loadFromUrl`.
 */

export interface GeoImportResult {
  geojson: any; // FeatureCollection
  count: number;
  name: string;
}

/* ── tiny XML parser (enough for KML / GPX) ─────────────────────────── */

interface XNode {
  tag: string;
  attrs: Record<string, string>;
  children: XNode[];
  text: string;
}

function parseXml(src: string): XNode {
  const root: XNode = { tag: '#root', attrs: {}, children: [], text: '' };
  const stack: XNode[] = [root];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    const text = src.slice(i, lt);
    if (text.trim() && stack.length) stack[stack.length - 1].text += text;
    const gt = src.indexOf('>', lt);
    if (gt === -1) break;
    let inner = src.slice(lt + 1, gt);
    i = gt + 1;
    if (inner.startsWith('?') || inner.startsWith('!')) continue; // PI / comment / CDATA decl
    const selfClose = inner.endsWith('/');
    if (selfClose) inner = inner.slice(0, -1);
    if (inner.startsWith('/')) {
      stack.pop();
      continue;
    }
    const parts = inner.trim().split(/\s+/);
    const tag = parts[0];
    const attrs: Record<string, string> = {};
    inner.replace(/([\w:-]+)\s*=\s*"([^"]*)"|([\w:-]+)\s*=\s*'([^']*)'/g, (_m, k1, v1, k2, v2) => {
      attrs[(k1 || k2)] = (v1 ?? v2 ?? '');
      return '';
    });
    const node: XNode = { tag, attrs, children: [], text: '' };
    stack[stack.length - 1].children.push(node);
    if (!selfClose) stack.push(node);
  }
  return root;
}

function findAll(node: XNode, tag: string): XNode[] {
  const out: XNode[] = [];
  const walk = (n: XNode) => {
    for (const c of n.children) {
      if (c.tag.toLowerCase() === tag.toLowerCase()) out.push(c);
      walk(c);
    }
  };
  walk(node);
  return out;
}

function findFirst(node: XNode, tag: string): XNode | undefined {
  return findAll(node, tag)[0];
}

function nodeText(node: XNode | undefined): string {
  if (!node) return '';
  const direct = node.text.trim();
  if (direct) return direct;
  const all = (n: XNode): string => n.text.trim() || n.children.map(all).join(' ').trim();
  return all(node);
}

/* ── coordinate parsing ─────────────────────────────────────────────── */

/** "lng,lat[,alt]" sequences separated by whitespace — KML/GPX style. */
function parseCoordSeq(s: string): number[][] {
  return s
    .trim()
    .split(/\s+/)
    .map((tok) => tok.split(',').map(Number))
    .filter((c) => c.length >= 2 && Number.isFinite(c[0]) && Number.isFinite(c[1]))
    .map((c) => [c[0], c[1]]);
}

/** "lat,lng" pairs typed by hand ("48.7092,44.5119"). */
export function parseLatLngList(s: string): number[][] {
  const out: number[][] = [];
  for (const tok of s.split(/[\s;]+/)) {
    const m = tok.match(/^(-?\d{1,3}(?:\.\d+)?)[,;/](-?\d{1,3}(?:\.\d+)?)$/);
    if (!m) continue;
    const lat = parseFloat(m[1]);
    const lng = parseFloat(m[2]);
    if (Math.abs(lat) <= 90 && Math.abs(lng) <= 180) out.push([lng, lat]);
  }
  return out;
}

function feature(
  geometry: GeoJSON.Geometry | null,
  props: Record<string, any>,
): GeoJSON.Feature | null {
  if (!geometry) return null;
  // strip undefined/null values so MapLibre never chokes on them
  const properties: Record<string, any> = {};
  for (const [k, v] of Object.entries(props)) {
    if (v !== undefined && v !== null && v !== '') properties[k] = String(v).slice(0, 500);
  }
  return { type: 'Feature', properties, geometry };
}

function collection(features: (GeoJSON.Feature | null)[]): any {
  return {
    type: 'FeatureCollection',
    features: features.filter(Boolean) as GeoJSON.Feature[],
  };
}

/* ── format detectors / converters ──────────────────────────────────── */

export function looksLikeGeoJson(text: string): boolean {
  const t = text.trimStart();
  if (!t.startsWith('{') && !t.startsWith('[')) return false;
  try {
    const j = JSON.parse(t);
    return !!j && typeof j === 'object' && (typeof j.type === 'string' || Array.isArray(j.features));
  } catch {
    return false;
  }
}

function normalizeGeoJson(parsed: any): any {
  if (parsed?.type === 'FeatureCollection' && Array.isArray(parsed.features)) {
    return { ...parsed, features: parsed.features.filter((f: any) => f && f.geometry) };
  }
  if (parsed?.type === 'Feature' && parsed.geometry) return collection([parsed]);
  if (parsed?.type && parsed.coordinates) {
    return collection([feature(parsed, { name: 'Geometry' })]);
  }
  if (Array.isArray(parsed)) {
    return collection(parsed.map((f: any, i: number) =>
      f?.type === 'Feature' ? f : feature(f?.geometry ?? f, { name: f?.name ?? `Элемент ${i + 1}` })));
  }
  throw new Error('Не похоже на GeoJSON: нет поля "type" или "features".');
}

export function convertGeoJson(text: string): any {
  return normalizeGeoJson(JSON.parse(text));
}

/** Minimal TopoJSON → GeoJSON (arc decoding, geometry collections). */
export function convertTopoJson(text: string): any {
  const topo = JSON.parse(text);
  if (!topo?.objects) throw new Error('Не похоже на TopoJSON: нет поля "objects".');
  const arcs: number[][][] = (topo.arcs || []).map((a: number[][]) => {
    let x = 0, y = 0;
    return a.map(([dx, dy]) => { x += dx; y += dy; return [x, y]; });
  });
  const tr = topo.transform;
  const decode = (arcIdx: number): number[][] => {
    const raw = arcs[Math.abs(arcIdx)] || [];
    const pts = tr
      ? raw.map(([x, y]) => [x * tr.scale[0] + tr.translate[0], y * tr.scale[1] + tr.translate[1]])
      : raw;
    return arcIdx < 0 ? pts.slice().reverse() : pts;
  };
  const line = (idxs: number[][]): number[][] => {
    const out: number[][] = [];
    for (const run of idxs) {
      const seg = Array.isArray(run) ? run.map(decode).flat() : decode(run as unknown as number);
      out.push(...(out.length && seg.length ? seg.slice(1) : seg));
    }
    return out;
  };
  const geomToFeature = (g: any, name: string): GeoJSON.Feature | null => {
    try {
      if (g.type === 'Point') return feature({ type: 'Point', coordinates: g.coordinates }, { name, ...g.properties });
      if (g.type === 'MultiPoint') return feature({ type: 'MultiPoint', coordinates: g.coordinates }, { name, ...g.properties });
      if (g.type === 'LineString') return feature({ type: 'LineString', coordinates: line(g.arcs) }, { name, ...g.properties });
      if (g.type === 'MultiLineString') return feature({ type: 'MultiLineString', coordinates: g.arcs.map(line) }, { name, ...g.properties });
      if (g.type === 'Polygon') return feature({ type: 'Polygon', coordinates: g.arcs.map(line) }, { name, ...g.properties });
      if (g.type === 'MultiPolygon') return feature({ type: 'MultiPolygon', coordinates: g.arcs.map((p: any) => p.map(line)) }, { name, ...g.properties });
    } catch { /* skip broken geometry */ }
    return null;
  };
  const feats: (GeoJSON.Feature | null)[] = [];
  for (const [key, obj] of Object.entries<any>(topo.objects)) {
    if (obj.type === 'GeometryCollection') {
      (obj.geometries || []).forEach((g: any, i: number) =>
        feats.push(geomToFeature(g, g.properties?.name || `${key} ${i + 1}`)));
    } else {
      feats.push(geomToFeature(obj, obj.properties?.name || key));
    }
  }
  return collection(feats);
}

export function convertKml(text: string): any {
  const doc = parseXml(text);
  const feats: (GeoJSON.Feature | null)[] = [];
  for (const pm of findAll(doc, 'Placemark')) {
    const name = nodeText(findFirst(pm, 'name')) || `Объект ${feats.length + 1}`;
    const desc = nodeText(findFirst(pm, 'description'));
    const coordsOf = (tag: string) => parseCoordSeq(nodeText(findFirst(pm, tag)));
    const pt = coordsOf('coordinates');
    if (pt.length) {
      feats.push(feature({ type: 'Point', coordinates: pt[0] }, { name, description: desc }));
      continue;
    }
    const lineEl = findFirst(pm, 'LineString');
    if (lineEl) {
      const seq = parseCoordSeq(nodeText(lineEl));
      if (seq.length > 1) feats.push(feature({ type: 'LineString', coordinates: seq }, { name, description: desc }));
      continue;
    }
    const polyEl = findFirst(pm, 'Polygon');
    if (polyEl) {
      const rings = findAll(polyEl, 'LinearRing')
        .map((r) => parseCoordSeq(nodeText(r)))
        .filter((r) => r.length > 2);
      if (rings.length) feats.push(feature({ type: 'Polygon', coordinates: rings }, { name, description: desc }));
      continue;
    }
    const multi = findAll(pm, 'MultiGeometry');
    if (multi.length) {
      for (const sub of multi[0].children) {
        const seq = parseCoordSeq(nodeText(sub));
        if (!seq.length) continue;
        const t = sub.tag.toLowerCase();
        if (t === 'point') feats.push(feature({ type: 'Point', coordinates: seq[0] }, { name, description: desc }));
        else if (t === 'linestring' && seq.length > 1) feats.push(feature({ type: 'LineString', coordinates: seq }, { name, description: desc }));
        else if (t === 'polygon') {
          const rings = findAll(sub, 'LinearRing').map((r) => parseCoordSeq(nodeText(r))).filter((r) => r.length > 2);
          if (rings.length) feats.push(feature({ type: 'Polygon', coordinates: rings }, { name, description: desc }));
        }
      }
    }
  }
  if (!feats.some(Boolean)) throw new Error('В KML не найдено ни одного Placemark с геометрией.');
  return collection(feats);
}

export function convertGpx(text: string): any {
  const doc = parseXml(text);
  const feats: (GeoJSON.Feature | null)[] = [];
  for (const wpt of findAll(doc, 'wpt')) {
    const lat = parseFloat(wpt.attrs.lat || ''), lon = parseFloat(wpt.attrs.lon || '');
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
    feats.push(feature({ type: 'Point', coordinates: [lon, lat] }, { name: nodeText(findFirst(wpt, 'name')) || 'Точка' }));
  }
  for (const trk of findAll(doc, 'trk')) {
    const name = nodeText(findFirst(trk, 'name')) || 'Маршрут';
    const seq: number[][] = [];
    for (const pt of findAll(trk, 'trkpt')) {
      const lat = parseFloat(pt.attrs.lat || ''), lon = parseFloat(pt.attrs.lon || '');
      if (Number.isFinite(lat) && Number.isFinite(lon)) seq.push([lon, lat]);
    }
    if (seq.length > 1) feats.push(feature({ type: 'LineString', coordinates: seq }, { name }));
  }
  for (const rte of findAll(doc, 'rte')) {
    const name = nodeText(findFirst(rte, 'name')) || 'Трек';
    const seq: number[][] = [];
    for (const pt of findAll(rte, 'rtept')) {
      const lat = parseFloat(pt.attrs.lat || ''), lon = parseFloat(pt.attrs.lon || '');
      if (Number.isFinite(lat) && Number.isFinite(lon)) seq.push([lon, lat]);
    }
    if (seq.length > 1) feats.push(feature({ type: 'LineString', coordinates: seq }, { name }));
  }
  if (!feats.some(Boolean)) throw new Error('В GPX не найдено точек, маршрутов или треков.');
  return collection(feats);
}

/* ── KMZ (zip) — inflate raw DEFLATE with the platform's DecompressionStream ── */

async function unzipEntry(data: Uint8Array): Promise<string | null> {
  // locate the local file header(s): PK\x03\x04
  const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let off = 0;
  while (off + 30 <= data.length) {
    if (dv.getUint32(off, true) !== 0x04034b50) { off++; continue; }
    const method = dv.getUint16(off + 8, true);
    let compSize = dv.getUint32(off + 18, true);
    const nameLen = dv.getUint16(off + 26, true);
    const extraLen = dv.getUint16(off + 28, true);
    const name = new TextDecoder().decode(data.subarray(off + 30, off + 30 + nameLen));
    const start = off + 30 + nameLen + extraLen;
    if (compSize === 0) {
      // stream flag — scan for the next local header as the boundary
      let end = data.length;
      for (let p = start; p + 4 <= data.length; p++) {
        if (dv.getUint32(p, true) === 0x04034b50) { end = p; break; }
      }
      compSize = end - start;
    }
    const payload = data.subarray(start, start + compSize);
    let xml: Uint8Array | null = null;
    if (method === 0) xml = payload;
    else if (method === 8 && typeof DecompressionStream !== 'undefined') {
      try {
        const ds = new DecompressionStream('deflate-raw');
        const buf = await new Response(new Blob([payload as unknown as ArrayBuffer]).stream().pipeThrough(ds)).arrayBuffer();
        xml = new Uint8Array(buf);
      } catch { xml = null; }
    }
    if (xml && /\.kml$/i.test(name)) return new TextDecoder('utf-8').decode(xml);
    off = start + compSize;
  }
  return null;
}

export async function convertKmz(buffer: ArrayBuffer): Promise<any> {
  const bytes = new Uint8Array(buffer);
  const kml = await unzipEntry(bytes);
  if (!kml) throw new Error('В KMZ не найден файл .kml (или архив повреждён).');
  return convertKml(kml);
}

/* ── Yandex Maps shared links ───────────────────────────────────────── */

/**
 * Accepts yandex.ru/maps links and pulls what they carry:
 *  - ?ll=lng,lat&z=…      → a point at the shown location
 *  - ?source=srm + points → route waypoints (multiple m= entries)
 *  - plain coordinates typed straight in ("48.7092,44.5119")
 */
export function fromYandexLink(input: string): any {
  const raw = input.trim();
  let url: URL | null = null;
  try {
    url = new URL(raw.startsWith('http') ? raw : `https://yandex.ru/${raw}`);
  } catch { /* not a URL — fall through to bare coordinates */ }

  if (!url) {
    const pts = parseLatLngList(raw);
    if (!pts.length) throw new Error('Похоже на ссылку Яндекс Карт, но разобрать координаты не удалось.');
    return collection(pts.map((c, i) =>
      feature({ type: pts.length > 1 ? 'LineString' : 'Point', coordinates: pts.length > 1 ? pts : c },
        { name: pts.length > 1 ? `Маршрут (${pts.length} точек)` : `Точка ${i + 1}` })));
  }

  const host = url.hostname.toLowerCase();
  const isYandex = host.includes('yandex');
  const ll = url.searchParams.get('ll');
  const z = url.searchParams.get('z');
  if (!isYandex) throw new Error('Домен не относится к Яндекс Картам.');

  // route waypoints: repeated m= params like "48.7;44.5~lm"
  const ms = url.searchParams.getAll('m')
    .map((m) => m.split('~')[0])
    .map((pair) => pair.split(';').map(parseFloat))
    .filter((p) => p.length === 2 && p.every(Number.isFinite));
  if (ms.length >= 2) {
    const coords = ms.map(([lat, lng]) => [lng, lat]);
    return collection([feature({ type: 'LineString', coordinates: coords },
      { name: `Маршрут Яндекс (${coords.length} точек)` })]);
  }
  if (ms.length === 1) {
    const [lat, lng] = ms[0];
    return collection([feature({ type: 'Point', coordinates: [lng, lat] }, { name: 'Метка Яндекс Карт' })]);
  }
  if (ll) {
    const [lngS, latS] = ll.split(',');
    const lng = parseFloat(lngS), lat = parseFloat(latS);
    if (Number.isFinite(lat) && Number.isFinite(lng)) {
      return collection([feature(
        { type: 'Point', coordinates: [lng, lat] },
        { name: `Яндекс Карты${z ? ` · зум ${z}` : ''}` },
      )]);
    }
  }
  throw new Error('В ссылке нет координат (ll= или точки маршрута). Откройте нужный фрагмент карты и скопируйте адрес из строки браузера.');
}

/* ── main entry ─────────────────────────────────────────────────────── */

export interface DetectInfo { kind: string; label: string; }

export function detectKind(fileName: string, text: string): DetectInfo {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.kmz')) return { kind: 'kmz', label: 'KMZ' };
  if (lower.endsWith('.kml')) return { kind: 'kml', label: 'KML' };
  if (lower.endsWith('.gpx')) return { kind: 'gpx', label: 'GPX' };
  if (lower.endsWith('.topo.json') || lower.endsWith('.topojson')) return { kind: 'topo', label: 'TopoJSON' };
  const t = text.trimStart();
  if (t.includes('<kml') || t.includes('<?xml')) {
    if (t.includes('<gpx')) return { kind: 'gpx', label: 'GPX' };
    return { kind: 'kml', label: 'KML' };
  }
  if (looksLikeGeoJson(t)) {
    try {
      const j = JSON.parse(t);
      if (j?.type === 'Topology') return { kind: 'topo', label: 'TopoJSON' };
    } catch { /* treat as geojson below */ }
    return { kind: 'geojson', label: 'GeoJSON' };
  }
  if (/yandex\.(ru|com|by|kz)/i.test(t)) return { kind: 'yandex', label: 'Яндекс Карты' };
  return { kind: 'unknown', label: 'неизвестный формат' };
}

/** Convert text content of an imported file/link. `fileName` only guides detection. */
export function importFromText(text: string, fileName = ''): GeoImportResult {
  const kind = detectKind(fileName, text);
  let geojson: any;
  switch (kind.kind) {
    case 'kml': geojson = convertKml(text); break;
    case 'gpx': geojson = convertGpx(text); break;
    case 'topo': geojson = convertTopoJson(text); break;
    case 'geojson': geojson = convertGeoJson(text); break;
    case 'yandex': geojson = fromYandexLink(text.trim()); break;
    default: {
      // last resort: maybe it is just coordinates
      const pts = parseLatLngList(text);
      if (pts.length) {
        geojson = collection(pts.map((c, i) =>
          feature({ type: pts.length > 1 ? 'LineString' : 'Point', coordinates: pts.length > 1 ? pts : c },
            { name: pts.length > 1 ? `Линия (${pts.length} точек)` : `Точка ${i + 1}` })));
        return finish(geojson, 'Координаты');
      }
      throw new Error('Формат не распознан. Поддерживаются: GeoJSON (.geojson/.json), KML/KMZ (экспорт Яндекс Карт и Google Earth), GPX, TopoJSON, ссылки Яндекс Карт и просто координаты «широта,долгота».');
    }
  }
  return finish(geojson, kind.label);
}

export async function importFromFile(file: File): Promise<GeoImportResult> {
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.kmz') || (file.type.includes('zip'))) {
    const buf = await file.arrayBuffer();
    try {
      const geojson = await convertKmz(buf);
      return finish(geojson, 'KMZ');
    } catch (e) {
      // not actually a zip — try reading it as text anyway
      const text = new TextDecoder('utf-8').decode(buf);
      if (text.includes('\u0000')) throw e;
      return importFromText(text, file.name);
    }
  }
  const text = await file.text();
  return importFromText(text, file.name);
}

/** Fetch a remote file (GeoJSON/KML/GPX by URL) and import it. */
export async function loadFromUrl(url: string): Promise<GeoImportResult> {
  let parsed: URL;
  try { parsed = new URL(url.trim()); } catch {
    return finish(fromYandexLink(url), 'Яндекс Карты');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new Error('Можно загружать только ссылки http(s).');
  }
  if (/yandex\.(ru|com|by|kz)/i.test(parsed.hostname)) {
    return finish(fromYandexLink(url), 'Яндекс Карты');
  }
  const res = await fetch(parsed.toString());
  if (!res.ok) throw new Error(`Загрузка не удалась (${res.status}). Сервер мог заблокировать запрос из браузера (CORS) — скачайте файл и перетащите его в окно.`);
  const text = await res.text();
  return importFromText(text, decodeURIComponent(parsed.pathname.split('/').pop() || ''));
}

function finish(geojson: any, kindLabel: string): GeoImportResult {
  const count = geojson?.features?.length ?? 0;
  if (!count) throw new Error('Файл прочитан, но объектов в нём нет.');
  return { geojson, count, name: kindLabel };
}
