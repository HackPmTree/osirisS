/**
 * OSIRISX — тесты фильтра «Окоп vs Дорога».
 *
 * Проверяют, что классификатор НЕ выдаёт случайные линии за окопы со 100%
 * уверенностью: прямые дороги и ЛЭП отсеиваются, короткие огрызки не
 * проходят порог, а характерный фортификационный зигзаг детектируется.
 */

import { describe, it, expect } from 'vitest';
import { classifySegment, shapeMetrics, lineLengthMeters } from './trench-classify';

/* Вспомогательные: перевод метров в градусы на широте ~50° с.ш. */
const LAT = 50.28;
const LON = 37.68;
const M_PER_DEG_LAT = 111_200;
const M_PER_DEG_LON = 111_200 * Math.cos((LAT * Math.PI) / 180);
const pt = (eastM: number, northM: number): [number, number] =>
  [LON + eastM / M_PER_DEG_LON, LAT + northM / M_PER_DEG_LAT];

describe('classifySegment — строгий фильтр «окоп vs дорога»', () => {
  it('уверенный окоп: зигзаг, узкий, шумная текстура → isTrench=true', () => {
    const r = classifySegment({
      lengthM: 220, widthM: 2.8, maxTurnRad: 0.6, tortuosity: 1.3, textureStd: 0.21,
    });
    expect(r.isTrench).toBe(true);
    expect(r.confidence).toBeGreaterThanOrEqual(0.55);
    expect(r.reasons.join(' ')).toContain('зигзаг');
  });

  it('широкая прямая дорога → isTrench=false с явной причиной', () => {
    const r = classifySegment({
      lengthM: 400, widthM: 8.5, maxTurnRad: 0.02, tortuosity: 1.01, textureStd: 0.04,
    });
    expect(r.isTrench).toBe(false);
    expect(r.confidence).toBeLessThan(0.55);
    expect(r.reasons.join(' ')).toMatch(/дорога/);
  });

  it('идеально прямая длинная линия даже узкая — вероятнее ЛЭП → false', () => {
    const r = classifySegment({
      lengthM: 600, widthM: 2.5, maxTurnRad: 0.01, tortuosity: 1.0, textureStd: 0.09,
    });
    expect(r.isTrench).toBe(false);
  });

  it('короткий огрызок (<30 м) не проходит фильтр', () => {
    const r = classifySegment({
      lengthM: 15, widthM: 2.5, maxTurnRad: 0.5, tortuosity: 1.3, textureStd: 0.2,
    });
    expect(r.isTrench).toBe(false);
  });

  it('уверенность никогда не превышает [0..1]', () => {
    const r = classifySegment({
      lengthM: 200, widthM: 3, maxTurnRad: 0.8, tortuosity: 1.5, textureStd: 0.3,
    });
    expect(r.confidence).toBeGreaterThanOrEqual(0);
    expect(r.confidence).toBeLessThanOrEqual(1);
  });
});

describe('shapeMetrics — геометрия реальных обводов', () => {
  it('зигзаг-полилиния оператора имеет извилистость > 1.1 и крупные изломы', () => {
    const zigzag: [number, number][] = [];
    for (let i = 0; i <= 10; i++) zigzag.push(pt(i * 35, i % 2 === 0 ? 0 : 25));
    const s = shapeMetrics(zigzag);
    expect(s.lengthM).toBeGreaterThan(300);
    expect(s.tortuosity).toBeGreaterThan(1.1);
    expect(s.maxTurnRad).toBeGreaterThan(0.35);
    // Такой обвод должен быть ПРИЗНАН окопом при типовых метриках полосы
    const c = classifySegment({ ...s, widthM: 2.5, textureStd: 0.22 });
    expect(c.isTrench).toBe(true);
  });

  it('прямая дорога, обведённая оператором, ОТБРАКОВЫВАЕТСЯ фильтром', () => {
    const road: [number, number][] = [pt(0, 0), pt(400, 0), pt(800, 0)];
    const s = shapeMetrics(road);
    expect(s.tortuosity).toBeLessThan(1.02);
    const c = classifySegment({ ...s, widthM: 2.5, textureStd: 0.08 });
    expect(c.isTrench).toBe(false);
  });

  it('lineLengthMeters считает длину гаверсингом', () => {
    const len = lineLengthMeters([pt(0, 0), pt(100, 0)]);
    expect(len).toBeGreaterThan(90);
    expect(len).toBeLessThan(110);
  });
});
