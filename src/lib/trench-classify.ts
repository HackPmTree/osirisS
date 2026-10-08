/**
 * OSIRISX — Классификатор «Окоп vs Дорога» (Node-зеркало Python-модуля
 * engine/trench_scan.py). Используется эндпоинтом /api/trench-scan, когда
 * Python-движок недоступен (edge-деплой без backend-контейнера).
 *
 * Эвристики (полностью соответствуют ТЗ):
 *  1. Ширина: окопы узкие (2–4 м); широкая линия с параллельными границами — дорога.
 *  2. Форма: окопы зигзагообразны; идеально прямые длинные линии — дороги/ЛЭП.
 *  3. Текстура: земля вокруг окопа взрыхлена (шум), асфальт гладкий.
 */

export interface SegmentMetrics {
  /** Длина линии в метрах. */
  lengthM: number;
  /** Средняя ширина светлой полосы вдоль нормали, м. */
  widthM: number;
  /** Максимальный угол излома, радианы. */
  maxTurnRad: number;
  /** Суммарная «извилистость»: отношение длины к расстоянию концов. */
  tortuosity: number;
  /** Контраст текстуры (std локальных градиентов) внутри полосы. */
  textureStd: number;
}

export interface ClassificationResult {
  isTrench: boolean;
  confidence: number; // 0..1
  reasons: string[];  // русскоязычные пояснения
}

/** Диапазоны типовой военной фортификации (м). */
const TRENCH_WIDTH_MIN = 1.2;
const TRENCH_WIDTH_MAX = 5.0;   // 2–4 м типовые, 5 м — щадящий верхний предел
const ROAD_WIDTH_MIN = 6.0;     // грунтовка от ~6 м
const STRAIGHT_TORTUOSITY = 1.08; // < этого — практически прямая линия
const MIN_TRENCH_LENGTH_M = 30;
const MAX_VALID_TORTUOSITY = 4.0; // выше — физически невозможная «зигзагость» = шум

/**
 * Классифицировать сегмент по метрикам. Строгий фильтр: любое явное
 * «дорожное» свойство снижает уверенность, комбинация — отсекает кандидата.
 * Зеркалит Python-реализацию src/api/trench_scan.py::classify_segment:
 * жёсткие отсекающие правила первыми; нейтральные значения формы/текстуры
 * штрафуются — окоп без доказательств не признаётся окопом со 100%.
 */
export function classifySegment(m: SegmentMetrics): ClassificationResult {
  const reasons: string[] = [];
  let score = 1.0;
  let hardReject = false;

  if (m.tortuosity > MAX_VALID_TORTUOSITY) {
    reasons.push(`Извилистость ${m.tortuosity.toFixed(1)} физически невозможна — шум трассировки, отбраковка`);
    score -= 0.85;
    hardReject = true;
  }

  // Шаг 2: фильтр ширины
  if (m.widthM >= ROAD_WIDTH_MIN) {
    reasons.push(`Ширина ${m.widthM.toFixed(1)} м — слишком широко для окопа (кандидат: дорога)`);
    score -= 0.9;
    hardReject = true;
  } else if (m.widthM > TRENCH_WIDTH_MAX) {
    reasons.push(`Ширина ${m.widthM.toFixed(1)} м выше типового окопа (2–4 м)`);
    score -= 0.45;
  } else if (m.widthM >= TRENCH_WIDTH_MIN && m.widthM <= TRENCH_WIDTH_MAX) {
    reasons.push('Ширина соответствует окопу (2–4 м ±допуск)');
    if (!hardReject) score += 0.15;
  } else {
    reasons.push(`Ширина ${m.widthM.toFixed(1)} м нетипична`);
    score -= 0.2;
  }

  // Шаг 3: фильтр формы (зигзаг против прямой)
  if (!hardReject) {
    if (m.lengthM > 150 && m.tortuosity < STRAIGHT_TORTUOSITY && m.maxTurnRad < 0.12) {
      reasons.push('Длинная идеальная прямая без изломов — вероятнее дорога или ЛЭП');
      score -= 0.7;
      hardReject = true;
    } else if (m.maxTurnRad > 0.35 || m.tortuosity > 1.15) {
      reasons.push('Есть изломы/зигзаги — признак фортификационной линии');
      score += 0.1;
    } else {
      reasons.push('Форма не подтверждает окоп: нет ни изломов, ни выраженной кривизны');
      score -= 0.65;
    }
  }

  // Шаг 4: текстура (взрыхлённая земля шумит, асфальт гладкий)
  if (m.textureStd < 0.02) {
    reasons.push('Гладкая текстура полосы — кандидат: асфальтированная дорога');
    score -= 0.5;
    hardReject = true;
  } else if (m.textureStd > 0.15) {
    reasons.push('Шумная (взрыхлённая) текстура грунта — соответствует окопу');
    score += 0.1;
  } else {
    reasons.push('Текстура не показывает взрыхлённого грунта вокруг линии');
    score -= 0.2;
  }

  // Минимальная осмысленная длина
  if (m.lengthM < MIN_TRENCH_LENGTH_M) {
    reasons.push('Слишком короткий сегмент — недостаточно данных');
    score -= 0.6;
  }

  const confidence = Math.min(1, Math.max(0, score));
  return {
    isTrench: confidence >= 0.55,
    confidence: Number(confidence.toFixed(2)),
    reasons,
  };
}

/** Длина LineString [lon,lat] в метрах (гаверсинг). */
export function lineLengthMeters(coords: [number, number][]): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    const [lon1, lat1] = coords[i - 1];
    const [lon2, lat2] = coords[i];
    const dLat = rad(lat2 - lat1);
    const dLon = rad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
    total += 2 * R * Math.asin(Math.sqrt(a));
  }
  return total;
}

/** Метрики формы полилинии (без растра — только геометрия обвода). */
export function shapeMetrics(coords: [number, number][]): Pick<SegmentMetrics, 'lengthM' | 'maxTurnRad' | 'tortuosity'> {
  const lengthM = lineLengthMeters(coords);
  let maxTurnRad = 0;
  for (let i = 1; i < coords.length - 1; i++) {
    const [x1, y1] = coords[i - 1];
    const [x2, y2] = coords[i];
    const [x3, y3] = coords[i + 1];
    const a1 = Math.atan2(y2 - y1, x2 - x1);
    const a2 = Math.atan2(y3 - y2, x3 - x2);
    let d = Math.abs(a2 - a1);
    if (d > Math.PI) d = 2 * Math.PI - d;
    maxTurnRad = Math.max(maxTurnRad, d);
  }
  const endToEnd = lineLengthMeters([coords[0], coords[coords.length - 1]]);
  const tortuosity = endToEnd > 0 ? lengthM / endToEnd : 1;
  return { lengthM, maxTurnRad, tortuosity };
}
