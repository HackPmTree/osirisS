# -*- coding: utf-8 -*-
"""
OSIRISX — Модуль «Trench Mapper»: CV-фильтр «Окоп vs Дорога» (OpenCV).

Строгий пайплайн (согласно ТЗ):
  Шаг 1. Детекция линий — Canny + HoughLinesP.
  Шаг 2. Фильтр ширины  — окопы узкие (2–4 м); широкая полоса с параллельными
                          границами большой ширины — дорога (игнорируется).
  Шаг 3. Фильтр формы   — окоп зигзагообразен (ломаная); длинная идеальная
                          прямая без изломов — дорога или ЛЭП (отсекается).
  Шаг 4. Текстура       — грунт вокруг окопа взрыхлён (высокий локальный шум),
                          асфальт дороги гладкий (низкий контраст).

Вход:  растровое изображение снимка (спутник/БПЛА) + привязка bbox + GSD.
Выход: GeoJSON FeatureCollection подтверждённых сегментов с метриками и
       русскоязычными пояснениями классификации.

Этика: только OSINT-разведка по открытым снимкам; инструмент обнаруживает
структуры фортификации, но НЕ является средством тактического целеуказания.
"""

from __future__ import annotations

import json
import math
import sys
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

try:
    import cv2
    import numpy as np
    HAS_CV = True
except ImportError:  # окружение без OpenCV — модуль деградирует до geo-режима
    HAS_CV = False
    cv2 = None  # type: ignore
    np = None  # type: ignore


# ── Пороговые параметры фильтра ─────────────────────────────────────────────
@dataclass
class TrenchConfig:
    trench_width_min_m: float = 1.5      # нижняя граница типовой ширины окопа
    trench_width_max_m: float = 4.5      # верхняя граница типовой ширины окопа
    road_width_min_m: float = 6.0        # всё шире — почти наверняка дорога
    min_trench_length_m: float = 30.0    # короткие обрывки не рассматриваем
    straight_len_m: float = 150.0        # длинна, при которой прямолинейность значима
    max_turn_rad_straight: float = 0.12  # меньше этого угла излома — линия прямая
    zigzag_turn_rad: float = 0.35        # больше — уверенный зигзаг
    texture_smooth_thresh: float = 0.06  # std нормализованных градиентов: гладкий асфальт
    texture_rough_thresh: float = 0.15   # выше — взрыхлённая земля
    hough_threshold: int = 60
    hough_min_line_px: int = 25
    hough_max_line_gap_px: int = 6
    confidence_gate: float = 0.55        # порог отнесения к «окоп»


@dataclass
class SegmentMetrics:
    length_m: float = 0.0
    width_m: float = 0.0
    max_turn_rad: float = 0.0
    tortuosity: float = 1.0
    texture_std: float = 0.0
    parallel_borders_wide: bool = False  # чёткие параллельные границы большой ширины


@dataclass
class TrenchCandidate:
    coords_lonlat: List[Tuple[float, float]]
    metrics: SegmentMetrics = field(default_factory=SegmentMetrics)
    is_trench: bool = False
    confidence: float = 0.0
    reasons: List[str] = field(default_factory=list)


def _haversine_m(lon1, lat1, lon2, lat2) -> float:
    """Расстояние в метрах между двумя географическими точками."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = p2 - p1
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def polyline_length_m(coords) -> float:
    return sum(_haversine_m(*coords[i], *coords[i + 1]) for i in range(len(coords) - 1))


def classify_segment(m: SegmentMetrics, cfg: TrenchConfig) -> Tuple[bool, float, List[str]]:
    """Шаги 2–4 строгого фильтра. Возвращает (окоп?, уверенность, пояснения)."""
    reasons: List[str] = []
    score = 1.0

    # Шаг 2: фильтр ширины
    if m.width_m >= cfg.road_width_min_m or m.parallel_borders_wide:
        extra = " с параллельными границами большой ширины" if m.parallel_borders_wide else ""
        reasons.append(f"Ширина {m.width_m:.1f} м{extra} — это дорога, исключаем")
        score -= 0.9  # жёсткое отсекающее правило
    elif cfg.trench_width_min_m <= m.width_m <= cfg.trench_width_max_m:
        reasons.append("Ширина в типовом диапазоне окопа (2–4 м)")
    else:
        reasons.append(f"Ширина {m.width_m:.1f} м нетипична для окопа")
        score -= 0.45

    # Шаг 3: фильтр формы (зигзаг против прямой)
    if (m.length_m > cfg.straight_len_m
            and m.tortuosity < 1.08
            and m.max_turn_rad < cfg.max_turn_rad_straight):
        reasons.append("Длинная идеальная прямая без изломов — вероятнее дорога или ЛЭП")
        score -= 0.7
    elif m.max_turn_rad > cfg.zigzag_turn_rad or m.tortuosity > 1.15:
        reasons.append("Обнаружены изломы/зигзаги — признак фортификационной линии")
        score += 0.1

    # Шаг 4: анализ текстуры
    if m.texture_std < cfg.texture_smooth_thresh:
        reasons.append("Гладкая текстура полосы — кандидат: асфальтированная дорога")
        score -= 0.5
    elif m.texture_std > cfg.texture_rough_thresh:
        reasons.append("Шумная (взрыхлённая) текстура грунта — соответствует окопу")
        score += 0.1

    if m.length_m < cfg.min_trench_length_m:
        reasons.append("Сегмент слишком короткий — недостаточно данных")
        score -= 0.6

    confidence = max(0.0, min(1.0, score))
    return confidence >= cfg.confidence_gate, round(confidence, 2), reasons


def measure_band_texture(gray, p0, p1, gsd_m: float, cfg: TrenchConfig):
    """
    Измерить среднюю ширину тёмной полосы вдоль сегмента и шум текстуры.

    Вдоль нормали к сегменту сканируется профиль яркости: ширина — по порогу
    затемнения относительно среднего фона. Флаг «параллельные границы большой
    ширины» ставится, если стабильно (>=70% профилей) ширина >= road_width_min.
    texture_std — стандартное отклонение локальных градиентов внутри полосы.
    """
    h, w = gray.shape
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    seg_len_px = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / seg_len_px, dx / seg_len_px  # единичная нормаль

    widths: List[float] = []
    patches: List["np.ndarray"] = []
    steps = max(2, int(seg_len_px / 4))
    mean_val = float(np.mean(gray))

    for t in range(0, steps + 1):
        cx = x0 + dx * t / steps
        cy = y0 + dy * t / steps
        prof = []
        for s in range(-24, 25):
            px = int(round(cx + nx * s))
            py = int(round(cy + ny * s))
            if 0 <= px < w and 0 <= py < h:
                prof.append(float(gray[py, px]))
        if len(prof) < 10:
            continue
        prof_arr = np.array(prof)
        dark = prof_arr < mean_val * 0.85  # тёмная траншея на фоне грунта
        widths.append(float(dark.sum()) * gsd_m)
        ix, iy = int(round(cx)), int(round(cy))
        if 5 <= ix < w - 5 and 5 <= iy < h - 5:
            patches.append(gray[iy - 4:iy + 5, ix - 4:ix + 5].astype(np.float32))

    width_m = float(np.median(widths)) if widths else 0.0
    wide_ratio = sum(1 for wm in widths if wm >= cfg.road_width_min_m) / max(1, len(widths))
    parallel_wide = width_m >= cfg.road_width_min_m and wide_ratio >= 0.7

    grads: List[float] = []
    for p in patches:
        gx = np.gradient(p, axis=1)
        gy = np.gradient(p, axis=0)
        mag = np.sqrt(gx ** 2 + gy ** 2) / 255.0
        grads.append(float(np.std(mag)))
    texture_std = float(np.mean(grads)) if grads else 0.0
    return width_m, texture_std, parallel_wide


def detect_segments(img, gsd_m: float, cfg: TrenchConfig, bbox) -> List[TrenchCandidate]:
    """Шаг 1: Canny + HoughLinesP; затем метрики и классификация каждого сегмента."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    gray = cv2.GaussianBlur(gray, (3, 3), 0)
    edges = cv2.Canny(gray, 50, 150)
    lines = cv2.HoughLinesP(
        edges,
        rho=1, theta=math.pi / 180,
        threshold=cfg.hough_threshold,
        minLineLength=cfg.hough_min_line_px,
        maxLineGap=cfg.hough_max_line_gap_px,
    )
    candidates: List[TrenchCandidate] = []
    if lines is None:
        return candidates

    min_lon, min_lat, max_lon, max_lat = bbox
    lon_span, lat_span = max_lon - min_lon, max_lat - min_lat
    h, w = img.shape[:2]

    def px_to_lonlat(x, y):
        return (min_lon + lon_span * (x / w), max_lat - lat_span * (y / h))

    for ln in lines:
        x0, y0, x1, y1 = (int(v) for v in ln[0])
        length_m = math.hypot(x1 - x0, y1 - y0) * gsd_m
        width_m, texture_std, parallel_wide = measure_band_texture(gray, (x0, y0), (x1, y1), gsd_m, cfg)

        # HoughLinesP даёт прямые отрезки — «зигзаг» ищем по длине дуги
        # рёбер в окрестности линии относительно её хорды (извилистая маска
        # рёбер означает, что реальная структура ломаная, а не прямая трасса).
        band = np.zeros_like(edges)
        cv2.line(band, (x0, y0), (x1, y1), 255, thickness=max(2, int(width_m / gsd_m) or 2))
        mask_edges = cv2.bitwise_and(edges, band)
        ys, xs = np.nonzero(mask_edges)
        arc_len = 0.0
        if len(xs) > 2:
            order = np.lexsort((ys, xs))
            xs_s, ys_s = xs[order], ys[order]
            arc_len = float(np.sum(np.hypot(np.diff(xs_s), np.diff(ys_s)))) * gsd_m
        chord = length_m or 1.0
        tortuosity = max(1.0, arc_len / chord) if arc_len else 1.0
        max_turn = 0.4 if tortuosity > 1.15 else 0.0

        metrics = SegmentMetrics(
            length_m=length_m,
            width_m=width_m,
            max_turn_rad=max_turn,
            tortuosity=tortuosity,
            texture_std=texture_std,
            parallel_borders_wide=parallel_wide,
        )
        is_trench, conf, reasons = classify_segment(metrics, cfg)
        coords = [px_to_lonlat(x0, y0), px_to_lonlat(x1, y1)]
        candidates.append(TrenchCandidate(
            coords_lonlat=[(round(lo, 6), round(la, 6)) for lo, la in coords],
            metrics=metrics, is_trench=is_trench, confidence=conf, reasons=reasons,
        ))
    return candidates


def scan(image_path: str, bbox: Tuple[float, float, float, float],
         gsd_m: float = 1.2, cfg: Optional[TrenchConfig] = None) -> dict:
    """
    Публичная точка входа: файл снимка → GeoJSON с подтверждёнными окопами.

    bbox:  (min_lon, min_lat, max_lon, max_lat)
    gsd_m: разрешение снимка, метров на пиксель (Sentinel-2 ~10 м,
           коммерческий VHR ~0.3–0.5 м; демо по умолчанию 1.2 м).
    """
    cfg = cfg or TrenchConfig()
    empty_fc = {"type": "FeatureCollection", "features": []}
    if not HAS_CV:
        return {"error": "OpenCV (cv2) не установлен: pip install opencv-python-headless numpy",
                "geojson": empty_fc}

    img = cv2.imread(image_path, cv2.IMREAD_COLOR)
    if img is None:
        return {"error": f"Не удалось прочитать изображение: {image_path}", "geojson": empty_fc}

    cands = detect_segments(img, gsd_m, cfg, bbox)
    trenches = [c for c in cands if c.is_trench]

    features = [{
        "type": "Feature",
        "geometry": {"type": "LineString", "coordinates": [list(p) for p in c.coords_lonlat]},
        "properties": {
            "osiris_type": "trench",
            "confidence": c.confidence,
            "length_m": round(c.metrics.length_m, 1),
            "width_m": round(c.metrics.width_m, 2),
            "tortuosity": round(c.metrics.tortuosity, 3),
            "texture_std": round(c.metrics.texture_std, 4),
            "reasons_ru": c.reasons,
        },
    } for c in trenches]

    return {
        "scanned_segments": len(cands),
        "trenches_detected": len(trenches),
        "rejected_as_road_or_powerline": len(cands) - len(trenches),
        "geojson": {"type": "FeatureCollection", "features": features},
        "disclaimer": "Только OSINT-обнаружение изменений ландшафта; тактическое целеуказание не предоставляется.",
    }


if __name__ == "__main__":
    # Прогон с изображением:
    #   python src/api/trench_scan.py <изображение> <min_lon,min_lat,max_lon,max_lat> [gsd]
    if len(sys.argv) >= 3:
        path_arg = sys.argv[1]
        bb = tuple(float(v) for v in sys.argv[2].split(","))
        gsd = float(sys.argv[3]) if len(sys.argv) > 3 else 1.2
        print(json.dumps(scan(path_arg, bb, gsd), ensure_ascii=False, indent=2))
    else:
        # Без изображения — демонстрация классификатора на эталонных метриках:
        # окоп-зигзаг должен пройти, широкая прямая дорога и ЛЭП — быть отсеянными.
        cfg = TrenchConfig()
        demo = {
            "окоп_зигзаг": SegmentMetrics(length_m=220, width_m=2.8, max_turn_rad=0.6,
                                          tortuosity=1.3, texture_std=0.21),
            "дорога_прямая_широкая": SegmentMetrics(length_m=400, width_m=8.5, max_turn_rad=0.02,
                                                    tortuosity=1.01, texture_std=0.04,
                                                    parallel_borders_wide=True),
            "лэп_прямая": SegmentMetrics(length_m=600, width_m=1.0, max_turn_rad=0.01,
                                         tortuosity=1.0, texture_std=0.09),
        }
        out = {k: dict(zip(("is_trench", "confidence", "reasons"), classify_segment(m, cfg)))
               for k, m in demo.items()}
        print(json.dumps(out, ensure_ascii=False, indent=2))
