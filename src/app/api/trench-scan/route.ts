/**
 * OSIRISX — /api/trench-scan: CV-сканирование СПУТНИКОВОГО снимка на окопы.
 *
 *  POST { bbox:[minLon,minLat,maxLon,maxLat], resolutionPx?, autosave?, lines? }
 *
 * Как это работает (реальное сканирование спутника, а не векторной карты):
 *  1. Оркестратор скачивает VHR-кадр Esri World_Imagery (тот же растри,
 *     который карта показывает в режиме «СПУТ») по центру области скана.
 *  2. Кадр (base64) передаётся Python-движку OpenCV (src/api/trench_engine.py,
 *     запускается отдельно; адрес — TRENCH_ENGINE_URL). Движок выполняет
 *     строгий пайплайн «окоп vs дорога»: HoughLinesP → фильтр ширины (2–4 м)
 *     → фильтр формы (зигзаг против прямой) → анализ текстуры грунта.
 *  3. Если движок НЕ поднят — тяжёлый растровый анализ невозможен, и сервер
 *     честно сообщает об этом (engine='no-engine'), вместо того чтобы
 *     выдумыватьDetection по геометрии и рисовать «окопы» там, где их нет.
 *  4. Обводы оператора (lines) классифицируются локальной геометрической
 *     эвристикой — это отдельный, явно обозначенный режим проверки.
 *
 * Контракт безопасности:
 *  - Rate Limiting: 25 запросов в минуту на клиента (актуальное ТЗ).
 *  - Zod-валидация bbox/линий/разрешения (src/lib/trench-schema.ts).
 *  - Результат — GeoJSON для слоя укреплений на карте.
 */

import { NextRequest, NextResponse } from 'next/server';
import { trenchScanSchema, zodErrorText } from '@/lib/trench-schema';
import { checkRateLimit, clientKey, rateLimitResponse, RATE_LIMIT_PER_MINUTE } from '@/lib/rate-limit';
import { classifySegment, shapeMetrics } from '@/lib/trench-classify';
import { addTrench, type TrenchFeature } from '@/lib/trench-store';

export const runtime = 'nodejs';
export const maxDuration = 30; // секунд на один скан (защита от зависших CPU-запросов)

/* ── Встроенный лёгкий детектор «окоп vs дорога» (чистый JS, без зависимостей)
      Используется, когда внешний Python-движок OpenCV не поднят: анализирует
      РЕАЛЬНЫЙ спутниковый растр по тому же алгоритму, что и trench_scan.py —
      декодирование JPEG, скользящее окно, градиенты, поиск прямых линий,
      проверка направления/длины. Это честная растровая детекция, а не
      догадки по вектору. ──────────────────────────────────────────────────────
*/

/** Декодировать JPEG из буфера в grayscale-массив (через sharp, если доступен). */
async function decodeGray(buf: Buffer): Promise<{ w: number; h: number; data: Uint8Array } | null> {
  try {
    // sharp — опциональный тяжёлый нативный модуль; при его отсутствии возвращаем null
    const sharp = (await import('sharp')).default;
    const img = sharp(buf).greyscale();
    const meta = await img.metadata();
    const { data } = await img.raw().toBuffer({ resolveWithObject: true });
    return { w: meta.width ?? 0, h: meta.height ?? 0, data };
  } catch {
    return null; // sharp недоступен — лёгкий детектор пропускается
  }
}

/** Одно passes Sobel-подобного фильтра: вернуть карту градиентов и порог шума. */
function gradientField(g: { w: number; h: number; data: Uint8Array }) {
  const { w, h, data } = g;
  const mag = new Float32Array(w * h);
  /* Устойчивые статистики яркости: медиана и межквартильный размах,
     а не среднее/СКО — иначе светлая дорога или тёмный лес сдвигают
     «среднюю сцену» и адаптивный порог тьмы перестаёт отделять
     траншею от грунта. */
  const lumSample: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const gx =
        -data[i - w - 1] - 2 * data[i - 1] - data[i + w - 1] +
         data[i - w + 1] + 2 * data[i + 1] + data[i + w + 1];
      const gy =
        -data[i - w - 1] - 2 * data[i - w] - data[i - w + 1] +
         data[i + w - 1] + 2 * data[i + w] + data[i + w + 1];
      mag[i] = Math.hypot(gx, gy);
      if ((i & 7) === 0) lumSample.push(data[i]); // выборка ~1/8 пикселей
    }
  }
  lumSample.sort((a, b) => a - b);
  const q = (p: number) => lumSample[Math.min(lumSample.length - 1, Math.floor(lumSample.length * p))] ?? 128;
  const mean = q(0.5);                                  // «типичный грунт» = медиана сцены
  const std = Math.max(8, (q(0.75) - q(0.25)) / 1.349); // robust σ по IQR
  return { mag, mean, std };
}

/** Дилатация(+)/эрозия(-) бинарной маски квадратным ядром r (морфология). */
function morph(src: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const out = new Uint8Array(w * h);
  if (r > 0) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        for (let oy = -r; oy <= r && !hit; oy++) {
          for (let ox = -r; ox <= r && !hit; ox++) {
            const nx = x + ox, ny = y + oy;
            if (nx >= 0 && ny >= 0 && nx < w && ny < h && src[ny * w + nx]) hit = 1;
          }
        }
        out[y * w + x] = hit;
      }
    }
  } else {
    const rr = -r;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let all = src[y * w + x] ? 1 : 0;
        for (let oy = -rr; oy <= rr && all; oy++) {
          for (let ox = -rr; ox <= rr && all; ox++) {
            const nx = x + ox, ny = y + oy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h || !src[ny * w + nx]) all = 0;
          }
        }
        out[y * w + x] = all;
      }
    }
  }
  return out;
}

/** Связные компоненты 8-связности (BFS). Возвращает список пиксельных множеств. */
function components(mask: Uint8Array, w: number, h: number) {
  const seen = new Uint8Array(w * h);
  const comps: { px: number; xs: number[]; ys: number[] }[] = [];
  const stack: number[] = [];
  for (let start = 0; start < w * h; start++) {
    if (!mask[start] || seen[start]) continue;
    seen[start] = 1;
    stack.length = 0;
    stack.push(start);
    let px = 0;
    const xs: number[] = [], ys: number[] = [];
    while (stack.length) {
      const i = stack.pop()!;
      const x = i % w, y = (i / w) | 0;
      px++; xs.push(x); ys.push(y);
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const j = ny * w + nx;
          if (mask[j] && !seen[j]) { seen[j] = 1; stack.push(j); }
        }
      }
    }
    comps.push({ px, xs, ys });
  }
  return comps;
}

/**
 * ГЛАВНЫЙ РАСТРОВЫЙ ДЕТЕКТОР «окоп vs дорога» (чистый JS-аналог пайплайна
 * trench_scan.py: CLAHE → Canny → морфология → трассировка с изломами →
 * измерение ширины и текстуры полосы).
 *
 * Алгоритм (по ТЗ):
 *  1. Пороговая маска тёмных пикселей (траншея темнее окружающей земли)
 *     + маска сильных градиентов (тени буртиков окопа).
 *  2. Трассировка связных цепочек: идём по маске с инерцией направления,
 *     разрешая небольшие изломы (зигзаги фортификаций) — в отличие от
 *     старого кода, который искал ТОЛЬКО идеально прямые прогоны и потому
 *     находил исключительно дороги, а настоящие окопы — никогда.
 *  3. Для каждой цепи измеряем ПОПЕРЕЧНЫЙ профиль: ширину тёмной полосы
 *     (в метрах через GSD) и стандартное отклонение яркости внутри неё
 *     (взрыхлённый грунт шумит, асфальт гладкий).
 *  4. Цепь отдаётся классификатору classifySegment (жёсткие фильтры
 *     ширины/прямизны/текстуры/длины) — в результат попадают только
 *     структуры, прошедшие ВСЕ фильтры.
 */
function detectLinearFeatures(g: { w: number; h: number; data: Uint8Array }, gsdM: number) {
  const { w, h, data } = g;
  const { mag, mean, std } = gradientField(g);

  /* ── Шаг 1: адаптивные пороги (эквивалент CLAHE+Canny по медиане) ── */
  const med = medianOf(mag);
  const upper = quantileOf(mag, 0.75);
  const gradThresh = Math.max(1e-3, Math.min(upper, 3 * med));   // «сильный край»
  const loDark = Math.max(0, mean - 0.67 * std);   // темнее квартиля P25 → ядро траншеи
  const hiDark = Math.min(255, mean + 0.21 * std); // потолок полосы ~P60 (отсекает светлый асфальт)
  const darkOnly = new Uint8Array(w * h); // узкая маска: только ТЁМНЫЙ грунт (ядро полосы)
  for (let i = 0; i < w * h; i++) {
    const px = data[i];
    darkOnly[i] = px <= loDark ? 1 : 0;
  }
  /* Широкая маска = тёмное ядро + сильные края ТОЛЬКО возле тёмного ядра.
     Это критично: иначе однородный шум фона (земля, трава) целиком попадает
     в маску по градиенту и connected components превращает кадр в кашу. */
  const edgeNearDark = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!darkOnly[i]) continue;
      for (const [ox, oy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]) {
        const j = (y + oy) * w + (x + ox);
        if (mag[j] >= gradThresh) edgeNearDark[j] = 1;
      }
    }
  }
  const mask = new Uint8Array(w * h); // широкая маска: грунт + прилегающие края
  for (let i = 0; i < w * h; i++) {
    mask[i] = (darkOnly[i] || edgeNearDark[i]) && data[i] <= hiDark ? 1 : 0;
  }

  /* ── Шаг 2: морфология + связные компоненты (аналог dilate→erode→findContours) ──
     Полосы окопов прерывистые (тени, растительность), поэтому сначала
     «сшиваем» маску дилатацией, затем уплотняем эрозией и выделяем
     связные компоненты. Вытянутые компоненты скелетонируются в полилинию
     через трассировку от левого края по максимуму вертикального размаха. */
  /* Морфология: только дилатация на 1 px — смыкает мелкие разрывы полосы.
     ЭРОЗИЮ не делаем: она стирает узкие (7 px) полосы окопов, оставляя
     нетронутыми лишь широкие дороги — ровно наоборот нужному. */
  const dil = morph(mask, w, h, 1);
  const ero = dil;
  const comps = components(ero, w, h);

  const chains: { pts: [number, number][] }[] = [];
  for (const comp of comps) {
    if (comp.px < 40) continue; // слишком мелко
    // габариты: вытянутость (циклом, не spread — компонент может быть огромным)
    let minx = Infinity, maxx = -Infinity, miny = Infinity, maxy = -Infinity;
    for (const x of comp.xs) { if (x < minx) minx = x; if (x > maxx) maxx = x; }
    for (const y of comp.ys) { if (y < miny) miny = y; if (y > maxy) maxy = y; }
    const spanX = maxx - minx, spanY = maxy - miny;
    const longAxis = Math.max(spanX, spanY);
    if (longAxis * gsdM < 25) continue;               // короткое пятно — не линия
    const thinness = Math.min(spanX, spanY) / longAxis;
    if (thinness > 0.6 && comp.px > longAxis * 4) continue; // blobs (воронки, здания)
    void thinness;
    // скелетизация: идём вдоль длинной оси мелкими шажками с инерцией —
    // каждое сечение берётся НЕ глобальной колонкой (она «сгладила» бы
    // зигзаг в прямую), а локальным окном ±win вокруг текущей координаты.
    const horiz = spanX >= spanY;
    const pts: [number, number][] = [];
    const win = Math.max(6, Math.round(20 / gsdM)); // окно сечения ~20 м
    const stepPx = Math.max(2, Math.round(3 / gsdM)); // шаг скелета ~3 м
    let curCross = horiz ? comp.ys[0] : comp.xs[0];
    for (let k = (horiz ? minx : miny); k <= (horiz ? maxx : maxy); k += stepPx) {
      let lo = Infinity, hi = -Infinity;
      const from = (horiz ? miny : minx), to = (horiz ? maxy : maxx);
      const m0 = Math.max(from, curCross - win), m1 = Math.min(to, curCross + win);
      for (let m = m0; m <= m1; m++) {
        const x = horiz ? k : m, y = horiz ? m : k;
        if (!ero[y * w + x]) continue;
        if (darkOnly[y * w + x]) { lo = Math.min(lo, m); hi = Math.max(hi, m); }
      }
      if (hi === -Infinity) {
        for (let m = m0; m <= m1; m++) {
          const x = horiz ? k : m, y = horiz ? m : k;
          if (!ero[y * w + x]) continue;
          lo = Math.min(lo, m); hi = Math.max(hi, m);
        }
      }
      if (hi === -Infinity) continue; // разрыв > окна — пропускаем, цепь продолжится дальше
      const c = Math.round((lo + hi) / 2);
      pts.push(horiz ? [k, c] : [c, k]);
      curCross = c; // инерция: следующее сечение ищем вокруг предыдущего центра
    }
    if (pts.length >= 4) chains.push({ pts });
  }

  /* ── Шаг 3: поперечный профиль — ширина и текстура полосы ──
     Ширина измеряется по ТЁМНОМУ ядру (darkOnly), а не по широкой маске:
     иначе шумный тёмный грунт даёт «нулевую ширину» и окопы невозможно
     отличить от дорог по этому критерию. Дополнительно считаем darkRatio —
     долю тёмных пикселей внутри полосы (у дороги она ~0, у окопа высока). */
  const out: {
    coords: [number, number][]; lenPx: number; widthM: number; textureStd: number;
    darkRatio: number; tortuosity: number; maxTurnRad: number;
  }[] = [];
  const atDark = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? darkOnly[y * w + x] : 0);
  /* Границы структуры (mask): выход за них = конец луча. Функция была
     потеряна при рефакторинге — без неё файл не компилировался (TS2304). */
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < w && y < h ? mask[y * w + x] : 0);
  for (const { pts } of chains) {
    // длина цепи в пикселях
    let lenPx = 0;
    for (let i = 1; i < pts.length; i++) lenPx += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const lengthM = lenPx * gsdM;
    if (lengthM < 25) continue; // короткие огрызки не рассматриваем

    // усреднённая ширина тёмной полосы по нормали в контрольных точках
    const widths: number[] = [];
    const texSamples: number[] = [];
    let darkTotal = 0, sampleTotal = 0;
    for (let i = 1; i < pts.length - 1; i += 2) {
      const [x, y] = pts[i];
      const nx = -(pts[i + 1][1] - pts[i - 1][1]), ny = pts[i + 1][0] - pts[i - 1][0];
      const nl = Math.hypot(nx, ny) || 1;
      const ux = nx / nl, uy = ny / nl;
      /* Профиль: идём от оси в обе стороны; тёмное ядро расширяем пока
         встречаем тёмные пиксели, при этом помечаем долю тьмы вдоль всего
         короткого луча (для гладких светлых дорог darkRatio ≈ 0). */
      let hwDark = 0;
      for (const s of [1, -1]) {
        let local = 0;
        for (let t = 1; t <= Math.round(12 / gsdM); t++) {
          const px = Math.round(x + ux * s * t), py = Math.round(y + uy * s * t);
          if (!at(px, py)) break;      // вышли за пределы структуры
          if (atDark(px, py)) local = t;
        }
        hwDark += local;
      }
      widths.push(Math.max(hwDark, 1) * gsdM); // ширина тёмного ядра, м
      // дисперсия яркости ВНУТРИ полосы + доля тёмных пикселей
      const span = Math.max(3, Math.min(hwDark + 2, Math.round(6 / gsdM)));
      for (let t = -span; t <= span; t++) {
        const px = Math.round(x + ux * t), py = Math.round(y + uy * t);
        if (px >= 0 && py >= 0 && px < w && py < h) {
          texSamples.push(data[py * w + px]);
          sampleTotal++;
          if (darkOnly[py * w + px]) darkTotal++;
        }
      }
    }
    const widthM = widths.length ? widths.sort((a, b) => a - b)[Math.floor(widths.length / 2)] : 2;
    const darkRatio = sampleTotal > 0 ? darkTotal / sampleTotal : 0;
    let textureStd = 0;
    if (texSamples.length > 8) {
      const m0 = texSamples.reduce((a, b) => a + b, 0) / texSamples.length;
      const v = texSamples.reduce((a, b) => a + (b - m0) ** 2, 0) / texSamples.length;
      textureStd = Math.sqrt(v) / 255; // нормируем 0..1 как в Python-зеркале
    }

    // геометрия цепи: извилистость и максимальный излом (как у обводов оператора)
    const geoCoords: [number, number][] = pts.map(([px, py]) => [px, py]);
    const shape = polylineShapePx(geoCoords);

    out.push({
      coords: geoCoords, lenPx, widthM, textureStd,
      darkRatio,
      tortuosity: shape.tortuosity, maxTurnRad: shape.maxTurnRad,
    });
  }

  // ── Шаг 4: жёсткий растровый преселектор «окоп vs дорога» ──
  /* Настоящий окоп на VHR-снимке: ТЁМНОЕ узкое ядро (2–5 м), высокая доля
     тьмы в полосе (darkRatio) и шумная взрыхлённая текстура. Светлые
     гладкие структуры (асфальт, дороги, ЛЭП) отсекаются здесь же — до
     классификатора, который по геометрии цепи их не различает. */
  const gsdMin = 1;                                       // ≥1 пиксель тёмного ядра
  const gsdMax = Math.max(3, Math.round(5.0 / gsdM));     // ≤5 м
  const kept = out.filter((c) => {
    const corePx = c.widthM / gsdM;
    return c.darkRatio >= 0.45 && corePx >= gsdMin && corePx <= gsdMax && c.textureStd >= 0.05;
  });

  // сортировка: сначала самые «окопоподобные» (узкие, тёмные, изломанные)
  kept.sort((a, b) => (b.darkRatio - a.darkRatio) || (b.tortuosity - a.tortuosity) || (a.widthM - b.widthM));
  return kept;
}

/** Медиана массива Float32Array (выборка для скорости). */
function medianOf(arr: Float32Array): number {
  const sample: number[] = [];
  for (let i = 0; i < arr.length; i += 7) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length / 2)] || 0;
}
/** Квантиль q по той же выборке. */
function quantileOf(arr: Float32Array, q: number): number {
  const sample: number[] = [];
  for (let i = 0; i < arr.length; i += 7) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(sample.length * q))] || 0;
}

/** Метрики формы полилинии в ПИКСЕЛЯХ (извилистость, макс. излом). */
function polylineShapePx(pts: [number, number][]) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
  let maxTurnRad = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const a1 = Math.atan2(pts[i][1] - pts[i - 1][1], pts[i][0] - pts[i - 1][0]);
    const a2 = Math.atan2(pts[i + 1][1] - pts[i][1], pts[i + 1][0] - pts[i][0]);
    let d = Math.abs(a2 - a1); if (d > Math.PI) d = 2 * Math.PI - d;
    maxTurnRad = Math.max(maxTurnRad, d);
  }
  const e2e = Math.hypot(pts[pts.length - 1][0] - pts[0][0], pts[pts.length - 1][1] - pts[0][1]);
  return { lengthPx: len, tortuosity: e2e > 0 ? len / e2e : 1, maxTurnRad };
}

/** Пиксель → география для кадра, привязанного к bbox. */
function pxToLonLat(px: number, py: number, w: number, h: number, bbox: [number, number, number, number]): [number, number] {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const lon = minLon + (px / Math.max(1, w - 1)) * (maxLon - minLon);
  const lat = maxLat - (py / Math.max(1, h - 1)) * (maxLat - minLat); // y сверху вниз
  return [lon, lat];
}

/**
 * Скачать VHR-спутниковый кадр Esri World_Imagery (плитки {z}/{y}/{x}) вокруг
 * центра области. Тот же источник растровых тайлов, что отображается на карте
 * в режиме «СПУТ», поэтому движок анализирует именно спутник, а не вектор.
 * Возвращает PNG-буфер мозаики 2×2 тайла z=19 (~0.3 м/пикс) и её bbox.
 */
async function fetchSatelliteImage(bbox: [number, number, number, number], _resolutionPx = 768):
  Promise<{ buf: Buffer; gsdM: number; tileBbox: [number, number, number, number] } | null> {
  try {
    const [minLon, minLat, maxLon, maxLat] = bbox;
    const cx = (minLon + maxLon) / 2, cy = (minLat + maxLat) / 2;
    const z = 19; // ~0.3 м/пикс — иначе окоп 2–4 м физически не различим
    const n = 2 ** z;
    const xTile = Math.floor(((cx + 180) / 360) * n);
    const yTile = Math.floor(((1 - Math.asinh(Math.tan((cy * Math.PI) / 180)) / Math.PI) / 2) * n);

    // Мозаика 2×2 соседних тайла (512×512 px ≈ 150×150 м на z=19)
    const tiles = await Promise.all(
      [0, 1].flatMap((dy) =>
        [0, 1].map(async (dx) => {
          const url =
            `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${yTile + dy}/${xTile + dx}`;
          const r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
          return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
        }),
      ),
    );
    if (tiles.some((t) => t === null)) return null;

    /* Сборка мозаики и перенос в PNG — через sharp (compositing по offset). */
    const sharp = (await import('sharp')).default;
    const composites: { input: Buffer; left: number; top: number }[] = [];
    for (let i = 0; i < 4; i++) {
      const dx = i % 2, dy = Math.floor(i / 2);
      composites.push({ input: tiles[i]!, left: dx * 256, top: dy * 256 });
    }
    const pngBuf = await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 128, g: 128, b: 128 } },
    })
      .composite(composites)
      .png()
      .toBuffer();

    // Географический bbox мозаики = западная граница левого тайла … восточная правого
    const xy2deg = (xt: number, yt: number) => ({
      lon: (xt / n) * 360 - 180,
      lat: (Math.atan(Math.sinh(Math.PI * (1 - (2 * yt) / n))) * 180) / Math.PI,
    });
    const nw = xy2deg(xTile, yTile);           // левый-верхний угол мозаики
    const se = xy2deg(xTile + 2, yTile + 2);   // правый-нижний угол
    const tileBbox: [number, number, number, number] = [nw.lon, se.lat, se.lon, nw.lat];
    // GSD: метрическая ширина мозаики / 512 px
    const widthM = (se.lon - nw.lon) * 111320 * Math.cos((cy * Math.PI) / 180);
    const gsdM = widthM / 512;
    return { buf: pngBuf, gsdM, tileBbox };
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  /* ── Лимит 25 запросов/минута ─────────────────────────────────────── */
  const rl = checkRateLimit(clientKey(req), RATE_LIMIT_PER_MINUTE, 60_000);
  if (!rl.ok) return rateLimitResponse(rl);

  /* ── Валидация входа ──────────────────────────────────────────────── */
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'ТЕЛО ЗАПРОСА НЕ ЯВЛЯЕТСЯ JSON' }, { status: 400 });
  }
  const parsed = trenchScanSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'ВАЛИДАЦИЯ НЕ ПРОЙДЕНА', detail: zodErrorText(parsed.error) }, { status: 400 });
  }
  const { bbox, resolutionPx, autosave } = parsed.data;

  /* ── 1. Тяжёлый CV-пайплайн: внешний Python-движок OpenCV (лучшее качество).
         Если TRENCH_ENGINE_URL не задан в .env.local, движок ищется на
         стандартном локальном порту 8790 — чтобы запущенный
         `python src/api/trench_engine.py` работал сразу без настройки env. ── */
  const engineUrl = process.env.TRENCH_ENGINE_URL || 'http://127.0.0.1:8790';
  try {
    const r = await fetch(`${engineUrl.replace(/\/$/, '')}/scan`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ bbox, resolutionPx }),
      signal: AbortSignal.timeout(25_000),
    });
    if (r.ok) {
      const data = await r.json();
      /* Конвертация формата движка в единый контракт фронтенда:
         geojson.features          → подтверждённые окопы (features[])
         candidates_geojson.features → кандидаты для зелёного пунктира
         Ответ содержит ИСХОДНЫЕ ключи движка + нормализованные features/geojson. */
      const confirmed: Record<string, unknown>[] = (data?.geojson?.features ?? []).map((f: any) => ({
        geometry: { type: 'Feature', geometry: f.geometry, properties: f.properties },
        is_trench: true,
        needs_review: false,
        confidence: f.properties?.confidence ?? 0.7,
        reasons_ru: f.properties?.reasons_ru ?? [],
        length_m: f.properties?.length_m ?? null,
        width_m: f.properties?.width_m ?? null,
        source: 'cv-scan',
      }));
      const candidates: Record<string, unknown>[] = (data?.candidates_geojson?.features ?? []).map((f: any) => ({
        geometry: { type: 'Feature', geometry: f.geometry, properties: f.properties },
        is_trench: false,
        needs_review: true,
        confidence: f.properties?.confidence ?? 0.4,
        reasons_ru: f.properties?.reasons_ru ?? [],
        length_m: f.properties?.length_m ?? null,
        width_m: f.properties?.width_m ?? null,
        source: 'cv-scan',
      }));
      /* autosave: только уверенные подтверждения движка (conf ≥ 0.55) */
      if (autosave) {
        for (const res of confirmed.filter((c) => Number(c.confidence) >= 0.55)) {
          const g = (res.geometry as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
          const feature: TrenchFeature = {
            id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
            type: 'trench',
            name: 'Окоп (AI-скан)',
            source: 'ai_detected',
            geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: g }, properties: {} },
            lengthKm: ((res.length_m as number) ?? 0) / 1000,
            confidence: res.confidence as number,
            createdAt: Date.now(),
          };
          try { await addTrench(feature); } catch { /* дубликат/ошибка — пропускаем */ }
        }
      }
      return NextResponse.json({
        ...data,
        engine: 'python-opencv',
        scanned: data?.scanned_segments ?? 0,
        features: [...confirmed, ...candidates],
        geojson: { type: 'FeatureCollection', features: confirmed.map((c) => c.geometry) },
        candidates_geojson: { type: 'FeatureCollection', features: candidates.map((c) => c.geometry) },
      });
    }
  } catch {
    /* Движок недоступен — переходим к встроенному растровому детектору. */
  }

  /* ── 2. Встроенный растровый детектор: скачиваем РЕАЛЬНЫЙ спутниковый кадр
         (Esri World_Imagery — тот же растри, что карта показывает в режиме
         «СПУТ») и анализируем его на CPU Node. Окопы ищутся именно на снимке,
         а не на векторной карте. При отсутствии sharp или недоступности
         тайлового сервера возвращаем честный пустой результат. ─────────────── */
  const shot = await fetchSatelliteImage(bbox, resolutionPx);
  const rasterResults: Record<string, unknown>[] = [];
  let rasterScanned = 0;
  if (shot) {
    const gray = await decodeGray(shot.buf);
    if (gray && gray.w > 8 && gray.h > 8) {
      const cands = detectLinearFeatures(gray, shot.gsdM);
      rasterScanned = cands.length;
      for (const c of cands.slice(0, 100)) {
        // Привязка к реальному bbox мозаики тайлов, а не к запрошенному bbox
        const geoCoords = c.coords.map(([px, py]) => pxToLonLat(px, py, gray.w, gray.h, shot.tileBbox));
        const lenM = c.lenPx * shot.gsdM;
        /* Ключевое исправление: теперь метрики РЕАЛЬНЫЕ (ширина полосы в
           метрах, извилистость цепи, дисперсия яркости грунта), и решение
           принимает единый классификатор classifySegment — тот же строгий
           фильтр «окоп vs дорога», что и для ручных обводов:
             • ширина ≥6 м → дорога (жёсткая отбраковка);
             • длинная идеальная прямая (>150 м, без изломов) → дорога/ЛЭП;
             • гладкая текстура (std<0.02) → асфальт; шумная → взрыхлённый грунт;
             • короче 30 м → недостаточно данных.
           В выдачу попадают ВСЕ кандидаты (для зелёного пунктира), но
           is_trench=true только у прошедших все фильтры. */
        const cls = classifySegment({
          lengthM: lenM,
          widthM: c.widthM,
          maxTurnRad: c.maxTurnRad,
          tortuosity: c.tortuosity,
          textureStd: c.textureStd,
        });
        rasterResults.push({
          geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: geoCoords }, properties: {} },
          is_trench: cls.isTrench,
          needs_review: !cls.isTrench, // авто-окопы всё равно подтверждает оператор
          confidence: cls.confidence,
          reasons_ru: cls.reasons,
          length_m: Math.round(lenM),
          width_m: Number(c.widthM.toFixed(1)),
          texture_std: Number(c.textureStd.toFixed(3)),
          tortuosity: Number(c.tortuosity.toFixed(2)),
          gsd_m: Number(shot.gsdM.toFixed(3)),
        });
      }
    }
  }

  /* ── 3. Проверка обводов оператора (геометрическая эвристика) ────────────
         widthM и textureStd вычисляются из реальной геометрии обвода. */
  const rawLines: [number, number][][] = parsed.data.lines ?? [];
  const results: Record<string, unknown>[] = [...rasterResults];
  for (const coords of rawLines.slice(0, 50)) {
    if (!Array.isArray(coords) || coords.length < 2) continue;
    const shape = shapeMetrics(coords as [number, number][]);

    let estimatedWidthM = 2.5;
    if (coords.length >= 4) {
      const start = coords[0], end = coords[coords.length - 1];
      const dist = Math.hypot(end[0] - start[0], end[1] - start[1]) * 111000;
      if (dist < 10) {
        estimatedWidthM = Math.min(8, Math.max(1.5, shape.lengthM / (coords.length * 2)));
      }
    }
    const textureEstimate = shape.tortuosity > 1.1 ? 0.22 :
                            shape.tortuosity > 1.05 ? 0.15 :
                            shape.maxTurnRad > 0.3 ? 0.18 : 0.08;

    const cls = classifySegment({ ...shape, widthM: estimatedWidthM, textureStd: textureEstimate });

    results.push({
      geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords }, properties: {} },
      is_trench: cls.isTrench,
      confidence: cls.confidence,
      reasons_ru: cls.reasons,
      length_m: Math.round(shape.lengthM),
      width_m: Number(estimatedWidthM.toFixed(1)),
      texture_std: Number(textureEstimate.toFixed(2)),
      tortuosity: Number(shape.tortuosity.toFixed(2)),
      max_turn_deg: Number(((shape.maxTurnRad * 180) / Math.PI).toFixed(0)),
    });
  }

  /* autosave: сохраняем только УВЕРЕННЫЕ окопы (порог 0.55). Кандидаты с
     низкой достоверностью из растрового детектора в слой НЕ пишутся —
     чтобы карта не заполнялась ложными «окопами 100%». */
  if (autosave) {
    for (const res of results.filter((r) => r.is_trench && Number(r.confidence) >= 0.55)) {
      const g = (res.geometry as { geometry: { coordinates: [number, number][] } }).geometry.coordinates;
      const feature: TrenchFeature = {
        id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        type: 'trench',
        name: 'Окоп (автоскан)',
        source: 'ai_detected',
        geometry: { type: 'Feature', geometry: { type: 'LineString', coordinates: g }, properties: {} },
        lengthKm: (res.length_m as number) / 1000,
        confidence: res.confidence as number,
        createdAt: Date.now(),
      };
      try { await addTrench(feature); } catch { /* дубликат/ошибка — пропускаем */ }
    }
  }

  const engine: 'js-raster-lite' | 'no-raster' = rasterResults.length > 0 || shot ? 'js-raster-lite' : 'no-raster';
  return NextResponse.json({
    engine,
    bbox,
    scanned: rawLines.length,
    scanned_raster_segments: rasterScanned,
    features: results,
    geojson: {
      type: 'FeatureCollection',
      features: results.filter((r) => r.is_trench).map((r) => r.geometry),
    },
    note: engine === 'js-raster-lite'
      ? 'Выполнено сканирование СПУТНИКОВОГО кадра Esri World_Imagery встроенным лёгким детектором (CPU Node). Для полного OpenCV-пайплайна (HoughLinesP + ширина/зигзаг/текстура) запустите Python-движок: python src/api/trench_engine.py и укажите TRENCH_ENGINE_URL.'
      : 'Спутниковый кадр получить или декодировать не удалось (нет сети до Esri или не установлен sharp). Автоскан по растровому изображению недоступен — используйте ручной обвод. Полный OpenCV-пайплайн: python src/api/trench_engine.py + TRENCH_ENGINE_URL.',
    disclaimer: 'Только OSINT-обнаружение изменений ландшафта; средство тактического целеуказания не предоставляется.',
  });
}
