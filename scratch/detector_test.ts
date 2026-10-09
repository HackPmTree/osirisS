/**
 * Тест встроенного растрового детектора окопов на СИНТЕТИЧЕСКОМ спутниковом
 * кадре 512x512 (GSD 0.19 м/пикс ~ z19): рисуем зигзагообразный окоп (узкая
 * тёмная полоса ~2.7 м с шумной текстурой) и прямую широкую «дорогу» (~8 м,
 * гладкий асфальт). Проверяем: окоп найден и помечен is_trench, дорога — НЕТ.
 */
import { classifySegment } from '../src/lib/trench-classify';

// ── Копия ядра детектора из route.ts (идентична, синхронизирована вручную) ──
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
function medianOf(arr: Float32Array): number {
  const sample: number[] = [];
  for (let i = 0; i < arr.length; i += 7) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.floor(sample.length / 2)] || 0;
}
function quantileOf(arr: Float32Array, q: number): number {
  const sample: number[] = [];
  for (let i = 0; i < arr.length; i += 7) sample.push(arr[i]);
  sample.sort((a, b) => a - b);
  return sample[Math.min(sample.length - 1, Math.floor(sample.length * q))] || 0;
}
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

// ── Генерация синтетического кадра ────────────────────────────────
const W = 512, H = 512, GSD = 0.19;
const data = new Uint8Array(W * H);
// Фон: земля со средним шумом (яркость 150 ± 25)
let seed = 42;
const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return (seed % 1000) / 1000; };
for (let i = 0; i < W*H; i++) data[i] = 150 + Math.round((rnd()-0.5)*50);

// Дорога: горизонтальная гладкая лента 8 м (~42 px) яркостью 170, без шума
const roadY = 120, roadHW = Math.round(8/GSD/2);
for (let y = roadY-roadHW; y <= roadY+roadHW; y++)
  for (let x = 5; x < W-5; x++) data[y*W+x] = 170;

// Окоп: зигзаг через весь кадр, ширина 2.7 м (~14 px), тёмный (70) + шум ±45
const trenchHW = Math.round(2.7/GSD/2);
let ty = 380;
for (let x = 10; x < W-10; x++) {
  const seg = Math.floor(x / 45);           // сегменты ~8.5 м
  const phase = seg % 2;                     // зигзаг вверх/вниз
  const localX = x % 45;
  ty = 380 + (phase === 0 ? localX : 45 - localX) * 0.6 - 13; // наклонные колена
  const yc = Math.round(ty);
  for (let dy = -trenchHW; dy <= trenchHW; dy++) {
    const yy = yc + dy;
    if (yy < 0 || yy >= H) continue;
    data[yy*W+x] = Math.max(0, Math.min(255, 70 + Math.round((rnd()-0.5)*90)));
  }
}

// ── Прогон детектора + классификатора ─────────────────────────────
const gray = { w: W, h: H, data };
const cands = detectLinearFeatures(gray, GSD);
console.log(`Цепей найдено: ${cands.length}`);
let trenchFound = false, roadPassed = true;
for (const c of cands.slice(0, 30)) {
  const cls = classifySegment({ lengthM: c.lenPx*GSD, widthM: c.widthM, maxTurnRad: c.maxTurnRad, tortuosity: c.tortuosity, textureStd: c.textureStd });
  const midY = c.coords[Math.floor(c.coords.length/2)][1];
  console.log(`цепь y≈${midY} len=${(c.lenPx*GSD).toFixed(0)}м width=${c.widthM.toFixed(1)}м tort=${c.tortuosity.toFixed(2)} tex=${c.textureStd.toFixed(3)} → trench=${cls.isTrench} conf=${cls.confidence}`);
  if (cls.isTrench && midY > 300) trenchFound = true;
  if (cls.isTrench && midY < 200) roadPassed = false;
}
console.log('\nРЕЗУЛЬТАТ:');
console.log('  окоп (зигзаг, низ кадра) обнаружен:', trenchFound);
console.log('  дорога НЕ ложно сработала:', roadPassed);
process.exit(trenchFound && roadPassed ? 0 : 1);
