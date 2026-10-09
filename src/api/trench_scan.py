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
    straight_len_m: float = 150.0        # длинна, при которой прямолинейность значима
    max_turn_rad_straight: float = 0.12  # меньше этого угла излома — линия прямая
    zigzag_turn_rad: float = 0.35        # больше — уверенный зигзаг
    texture_smooth_thresh: float = 0.02  # std нормализованных градиентов: гладкий асфальт
    texture_rough_thresh: float = 0.15   # выше — уверенно взрыхлённая земля
    hough_threshold: int = 60
    hough_min_line_px: int = 25
    hough_max_line_gap_px: int = 6
    min_trench_length_m: float = 30.0    # короткие обрывки не рассматриваем (после склейки)
    max_valid_tortuosity: float = 4.0    # выше — это шум трассировки, а не зигзаг
    confidence_gate: float = 0.55        # порог отнесения к «окоп»
    # ── Параметры предобработки кадра (шаг 0 пайплайна) ──
    clahe_clip: float = 2.5              # коэффициент усиления CLAHE (тени траншей)
    clahe_grid: int = 8                  # размер сетки локальной гистограммы CLAHE
    blur_sigma: float = 0.9              # гауссово размытие до Canny (трава/камни)
    canny_low_ratio: float = 0.6         # нижний порог Canny = медиана*(1-ratio)
    canny_high_ratio: float = 1.4        # верхний порог Canny = медиана*(1+ratio)
    morph_dilate_iter: int = 1           # дилатация краёв: соединение разрывов линии
    morph_close_iter: int = 1            # морф. закрытие на карте тёмных полос
    dark_band_factor: float = 0.85       # полоса тёмная, если яркость < фон*factor
    # ── Теневой признак (окоп отбрасывает тень; дорога — нет) ──
    shadow_delta: float = 18.0           # минимальный перепад яркости «вал vs тень», ед. серого
    shadow_conf_bonus: float = 0.12      # прибавка за подтверждённую теневую структуру
    candidate_gate: float = 0.35         # порог показа кандидата оператору (ниже gate)


@dataclass
class SegmentMetrics:
    length_m: float = 0.0
    width_m: float = 0.0
    max_turn_rad: float = 0.0
    tortuosity: float = 1.0
    texture_std: float = 0.0
    parallel_borders_wide: bool = False  # чёткие параллельные границы большой ширины
    shadow_ratio: float = 0.0            # доля профилей с теневым перепадом «вал/тень»
    dark_ratio: float = 0.5              # доля тёмных пикселей внутри полосы


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

    # ── Жёсткие отсекающие правила ПЕРВЫМИ: физически невозможная форма,
    #    «дорожная» ширина, гладкий асфальт. Затем — мягкие модификаторы.
    hard_reject = False

    if m.tortuosity > cfg.max_valid_tortuosity:
        reasons.append(f"Извилистость {m.tortuosity:.1f} физически невозможна — шум трассировки, отбраковка")
        score -= 0.85
        hard_reject = True

    # Шаг 2: фильтр ширины
    if m.width_m >= cfg.road_width_min_m or m.parallel_borders_wide:
        extra = " с параллельными границами большой ширины" if m.parallel_borders_wide else ""
        reasons.append(f"Ширина {m.width_m:.1f} м{extra} — это дорога, исключаем")
        score -= 0.9
        hard_reject = True
    elif cfg.trench_width_min_m <= m.width_m <= cfg.trench_width_max_m:
        reasons.append("Ширина в типовом диапазоне окопа (2–4 м)")
        if not hard_reject:
            score += 0.15  # единственный честный положительный признак ширины
    else:
        reasons.append(f"Ширина {m.width_m:.1f} м нетипична для окопа")
        score -= 0.45

    # Шаг 3: фильтр формы (зигзаг против прямой)
    if not hard_reject:
        if (m.length_m > cfg.straight_len_m
                and m.tortuosity < 1.08
                and m.max_turn_rad < cfg.max_turn_rad_straight):
            reasons.append("Длинная идеальная прямая без изломов — вероятнее дорога или ЛЭП")
            score -= 0.7
            hard_reject = True
        elif m.max_turn_rad > cfg.zigzag_turn_rad or m.tortuosity > 1.15:
            reasons.append("Есть изломы/зигзаги — признак фортификационной линии")
            score += 0.1
        else:
            reasons.append("Форма не подтверждает окоп: нет ни изломов, ни выраженной кривизны")
            score -= 0.65

    # Шаг 4: анализ текстуры
    if m.texture_std < cfg.texture_smooth_thresh:
        reasons.append("Гладкая текстура полосы — кандидат: асфальтированная дорога")
        score -= 0.5
        hard_reject = True
    elif m.texture_std > cfg.texture_rough_thresh:
        reasons.append("Шумная (взрыхлённая) текстура грунта — соответствует окопу")
        score += 0.1
    else:
        reasons.append("Текстура не показывает взрыхлённого грунта вокруг линии")
        score -= 0.2

    # Теневой признак: траншея узкая и ГЛУБОКАЯ — с одной стороны всегда
    # светлый вал (выброс грунта), с другой тёмная стена (тень). У плоской
    # дороги такой асимметрии нет. Это самый надёжный отличительный признак.
    if m.shadow_ratio >= 0.6:
        reasons.append(f"Теневая структура «вал/тень» подтверждена в {m.shadow_ratio:.0%} профилей")
        score += cfg.shadow_conf_bonus
    elif m.shadow_ratio <= 0.2 and not hard_reject:
        reasons.append("Нет перепада «вал vs тень» — структура плоская, вероятна дорога/тропа")
        score -= 0.35

    if m.length_m < cfg.min_trench_length_m:
        reasons.append("Сегмент слишком короткий — недостаточно данных")
        score -= 0.6

    confidence = max(0.0, min(1.0, score))
    return confidence >= cfg.confidence_gate, round(confidence, 2), reasons


def measure_band_texture(gray, p0, p1, gsd_m: float, cfg: TrenchConfig):
    """
    Измерить среднюю ширину тёмной полосы вдоль сегмента, шум текстуры
    и ТЕНЕВОЙ профиль (асимметрия «светлый вал vs тёмная стена»).

    Вдоль нормали к сегменту сканируется профиль яркости: ширина — по порогу
    затемнения относительно среднего фона (cfg.dark_band_factor). Флаг
    «параллельные границы большой ширины» ставится, если стабильно (>=70%
    профилей) ширина >= road_width_min. texture_std — стандартное отклонение
    локальных градиентов внутри полосы.

    Теневой признак: у настоящей траншеи на профиле яркости есть выраженный
    светлый пик (вал выброса грунта) с одной стороны тёмной полосы и более
    тёмный спад (стена в тени) с другой; перепад >= shadow_delta ед. серого.
    У плоской дороги/грунтовки такой асимметрии нет → shadow_ratio низкий.
    """
    h, w = gray.shape
    x0, y0 = p0
    x1, y1 = p1
    dx, dy = x1 - x0, y1 - y0
    seg_len_px = math.hypot(dx, dy) or 1.0
    nx, ny = -dy / seg_len_px, dx / seg_len_px  # единичная нормаль

    widths: List[float] = []
    patches: List["np.ndarray"] = []
    shadow_hits = 0
    dark_ratios: List[float] = []
    steps = max(2, int(seg_len_px / 4))
    # Локальный фон — медиана КАДОГО профиля отдельно. Глобальная медиана
    # снимка непригодна: светлый вал траншеи сам сдвигает распределение
    # яркостей, и порог «темнее фона» начинает захватывать полосу вала
    # (завышенная ширина) или, наоборот, только дно (заниженная).
    mean_val = float(np.median(gray))

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
        local_bg = float(np.median(prof_arr))          # фон именно здесь
        dark = prof_arr < local_bg * cfg.dark_band_factor  # тёмная траншея на фоне грунта
        # ── Защита от «полосатого» профиля: если тёмных пикселей больше
        #    половины окна, профиль не содержит выраженной полосы — ширина
        #    ненадёжна, пропускаем такой замер.
        frac = float(dark.sum()) / max(1, len(prof))
        if 0.02 < frac <= 0.5:
            widths.append(float(dark.sum()) * gsd_m)
            dark_ratios.append(frac)
    # ── Теневой анализ профиля: асимметрия ФОНОВ по обе стороны тёмной полосы.
    #    У траншеи с одной стороны светлый вал (выброс грунта), с другой —
    #    затенённая стена; перепад средних фонов >= shadow_delta ед. серого.
    #    У плоской дороги/тропы оба края одинаковые → хит не растёт.
    #    ВАЖНО: фон берётся МЕДИАНОЙ широкого окна (9 px) сразу за краем
    #    полосы — среднее по 7 пикселям размывало узкий вал (2–3 px) шумом.
    try:
        idx = np.nonzero(dark)[0]
        if idx.size >= 2:
            lo_i, hi_i = int(idx[0]), int(idx[-1])
            left_bg = prof_arr[max(0, lo_i - 9):max(1, lo_i)]
            right_bg = prof_arr[min(len(prof_arr), hi_i + 1):min(len(prof_arr), hi_i + 10)]
            if left_bg.size >= 3 and right_bg.size >= 3:
                lmed, rmed = float(np.median(left_bg)), float(np.median(right_bg))
                band_med = float(np.median(prof_arr[dark]))
                # Вал должен быть СВЕТЛЕЕ дна минимум на shadow_delta, а
                # противоположная сторона — темнее вала хотя бы вдвое меньше
                # этого перепада (тень стены).
                crest = max(lmed, rmed); trough_side = min(lmed, rmed)
                if crest - band_med >= cfg.shadow_delta and crest - trough_side >= cfg.shadow_delta * 0.5:
                    shadow_hits += 1
    except Exception:
        pass
    ix, iy = int(round(cx)), int(round(cy))
    if 5 <= ix < w - 5 and 5 <= iy < h - 5:
        patches.append(gray[iy - 4:iy + 5, ix - 4:ix + 5].astype(np.float32))

    width_m = float(np.median(widths)) if widths else 0.0
    wide_ratio = sum(1 for wm in widths if wm >= cfg.road_width_min_m) / max(1, len(widths))
    parallel_wide = width_m >= cfg.road_width_min_m and wide_ratio >= 0.7
    n_valid = max(1, len(widths))
    shadow_ratio = shadow_hits / n_valid   # доля ПРОФИЛЕЙ С ПОЛОСОЙ, а не всех шагов
    dark_ratio = float(np.mean(dark_ratios)) if dark_ratios else 0.5

    grads: List[float] = []
    for p in patches:
        gx = np.gradient(p, axis=1)
        gy = np.gradient(p, axis=0)
        mag = np.sqrt(gx ** 2 + gy ** 2) / 255.0
        grads.append(float(np.std(mag)))
    texture_std = float(np.mean(grads)) if grads else 0.0
    return width_m, texture_std, parallel_wide, shadow_ratio, dark_ratio


def _hough_segments(edges, cfg: TrenchConfig):
    """Совместимость с OpenCV 4.x/5.x: HoughLinesP возвращает (N,1,4) или (N,4)."""
    lines = cv2.HoughLinesP(
        edges,
        rho=1, theta=math.pi / 180,
        threshold=cfg.hough_threshold,
        minLineLength=cfg.hough_min_line_px,
        maxLineGap=cfg.hough_max_line_gap_px,
    )
    if lines is None:
        return []
    out = []
    for ln in lines:
        flat = np.asarray(ln).reshape(-1)
        if flat.size == 4:
            out.append(tuple(int(v) for v in flat[:4]))
    return out


def trace_polyline(gray, edges, p0, p1, gsd_m: float, cfg: TrenchConfig):
    """
    Превратить прямой отрезок Хафа в РЕАЛЬНУЮ ломаную трассу структуры.

    Идея: траншея тёмная и непрерывная — идём от начала к концу маленькими
    шагами; на каждом шаге внутри локального окна по нормали выбираем точку с
    минимальной ЯРКОСТЬЮ (следим за самой тёмной полосой — дном траншеи или
    краем дороги). Результат — цепочка вершин; изломы этой цепочки и есть
    «зигзаг» окопа. Для идеально прямой дороги цепочка остаётся прямой →
    фильтр формы её корректно отсекает.

    Почему яркость, а не карта градиентов: у траншеи градиентные отклики
    образуют ДВЕ параллельные линии (край вала / край тени), и трасса,
    следующая за максимумом |∇I|, мечется между ними туда-сюда, порождая
    фантомные развороты и невозможную извилистость. Тёмное дно — единый
    непрерывный хребет, вести трассу по нему устойчиво.

    Антидрожание: шаг вдоль трассы жёстко фиксирован, смещение ищется только
    по нормали с инерцией (штраф за резкую смену offsets + экспоненциальное
    сглаживание).
    """
    h, w = gray.shape
    x0, y0 = float(p0[0]), float(p0[1])
    x1, y1 = float(p1[0]), float(p1[1])
    seg_len = math.hypot(x1 - x0, y1 - y0)
    if seg_len < 8:
        return [(x0, y0), (x1, y1)]
    step = max(3.0, seg_len / 60.0)                  # ~60 шагов вдоль трассы
    win = max(4, int(round(1.5 * cfg.trench_width_max_m / max(gsd_m, 0.05))))  # окно ±~7 м
    n_steps = max(2, int(seg_len / step))
    ux, uy = (x1 - x0) / seg_len, (y1 - y0) / seg_len  # единичный вектор трассы
    nx, ny = -uy, ux                                   # нормаль — только по ней ищем смещение

    pts = [(x0, y0)]
    last_off = 0.0                                     # предыдущее нормальное смещение
    for i in range(1, n_steps + 1):
        bx = x0 + ux * step * i                        # базовая точка строго вперёд
        by = y0 + uy * step * i
        best_val, off = None, 0.0
        ix0, iy0 = int(round(bx)), int(round(by))
        for d in range(-win, win + 1):                 # смещение ТОЛЬКО по нормали
            px, py = ix0 + int(round(nx * d)), iy0 + int(round(ny * d))
            if not (0 <= px < w and 0 <= py < h):
                continue
            val = float(gray[py, px])                  # следим за тёмным дном полосы
            # штраф за резкую смену смещения: трасса идёт гладко, инерция ±2 px
            cost = val + abs(d - last_off) * 0.6
            if best_val is None or cost < best_val:
                best_val, off = cost, d
        cxp, cyp = bx + nx * off, by + ny * off
        # сглаживание смещения (экспоненциальное), чтобы трасса не дрожала
        last_off = 0.6 * last_off + 0.4 * off
        pts.append((cxp, cyp))

    # Упрощение цепочки: оставляем только значимые изломы (Douglas-Peucker)
    def rdp(points, eps):
        if len(points) < 3:
            return points
        (ax, ay), (bx_, by_) = points[0], points[-1]
        dx, dy = bx_ - ax, by_ - ay
        seg = math.hypot(dx, dy) or 1.0
        dmax, imax = 0.0, 0
        for k in range(1, len(points) - 1):
            d = abs(dy * points[k][0] - dx * points[k][1] + bx_ * ay - by_ * ax) / seg
            if d > dmax:
                dmax, imax = d, k
        if dmax > eps:
            return rdp(points[:imax + 1], eps)[:-1] + rdp(points[imax:], eps)
        return [points[0], points[-1]]

    return rdp(pts, max(1.5, 1.0 / max(gsd_m, 0.05)))  # эпсилон ~1 м


def polyline_metrics(coords_px, gray, gsd_m: float, cfg: TrenchConfig) -> SegmentMetrics:
    """
    Метрики реального ломаного следа: длина, ширина, изломы, извилистость,
    текстура. Вход — цепочка точек [(x, y), ...] в пиксельных координатах.
    """
    px = [(float(p[0]), float(p[1])) for p in coords_px]
    lengths = [math.hypot(px[i + 1][0] - px[i][0], px[i + 1][1] - px[i][1])
               for i in range(len(px) - 1)]
    length_m = sum(lengths) * gsd_m
    end2end = math.hypot(px[-1][0] - px[0][0], px[-1][1] - px[0][1]) * gsd_m
    tortuosity = max(1.0, length_m / end2end) if end2end > 1 else 1.0
    max_turn = 0.0
    for i in range(1, len(px) - 1):
        a1 = math.atan2(px[i][1] - px[i - 1][1], px[i][0] - px[i - 1][0])
        a2 = math.atan2(px[i + 1][1] - px[i][1], px[i + 1][0] - px[i][0])
        d = abs((a2 - a1 + math.pi) % (2 * math.pi) - math.pi)
        max_turn = max(max_turn, d)
    widths, textures, wide_hits = [], [], 0
    shadow_ratios, dark_ratios = [], []
    for (xa, ya), (xb, yb) in zip(px, px[1:]):
        wm, tex, wide, sh_ratio, dk_ratio = measure_band_texture(
            gray, (int(xa), int(ya)), (int(xb), int(yb)), gsd_m, cfg)
        if wm > 0:
            widths.append(wm); textures.append(tex); wide_hits += 1 if wide else 0
            shadow_ratios.append(sh_ratio); dark_ratios.append(dk_ratio)
    return SegmentMetrics(
        length_m=length_m,
        width_m=float(np.median(widths)) if widths else 0.0,
        max_turn_rad=max_turn,
        tortuosity=tortuosity,
        texture_std=float(np.mean(textures)) if textures else 0.0,
        parallel_borders_wide=(wide_hits >= 0.7 * len(widths)) if widths else False,
        shadow_ratio=float(np.mean(shadow_ratios)) if shadow_ratios else 0.0,
        dark_ratio=float(np.mean(dark_ratios)) if dark_ratios else 0.5,
    )


def merge_traces(traces):
    """
    Склейка соосных отрезков Хафа в единые трассы.

    HoughLinesP всегда рвёт длинную структуру на короткие осколки — без склейки
    реальный окоп (200+ м) разваливается на сегменты по 15 м и гарантированно
    отсеивается фильтром минимальной длины. Склейка жадная: следующий отрезок
    присоединяется к цепи, если его конец попадает в окрестность конца цепи
    (разрыв ≤ ~макс(12 px, 0.6·длины)) и направление совпадает (< ~35°).
    """
    if not traces:
        return []
    used = [False] * len(traces)
    chains: List[List[Tuple[float, float]]] = []

    for i in range(len(traces)):
        if used[i]:
            continue
        used[i] = True
        chain = list(traces[i])
        grew = True
        while grew:
            grew = False
            for j in range(len(traces)):
                if used[j]:
                    continue
                t = traces[j]
                a, b = t[0], t[-1]
                dxv, dyv = b[0] - a[0], b[1] - a[1]
                ln = math.hypot(dxv, dyv) or 1.0
                ang_j = math.atan2(dyv, dxv)
                # (конец цепи, кандидат-стык, нужен ли разворот отрезка)
                for end_i, cand, rev in ((1, a, False), (1, b, True), (0, a, True), (0, b, False)):
                    p = chain[-1] if end_i == 1 else chain[0]
                    gap = math.hypot(cand[0] - p[0], cand[1] - p[1])
                    if gap > max(12.0, ln * 0.6):
                        continue
                    q = chain[-2] if end_i == 1 else chain[1]
                    cdx, cdy = p[0] - q[0], p[1] - q[1]
                    diff = abs((ang_j - math.atan2(cdy, cdx) + math.pi) % (2 * math.pi) - math.pi)
                    if min(diff, math.pi - diff) > math.radians(35):
                        continue
                    piece = t[::-1] if rev else t
                    if end_i == 1:
                        chain.extend(piece[1:] if piece[0] != p else piece)
                    else:
                        chain = (piece[:-1] if piece[-1] != p else piece) + chain
                    used[j] = True
                    grew = True
                    break
                if grew:
                    break
        chains.append(chain)
    return chains


def preprocess_frame(img, cfg: TrenchConfig):
    """
    Шаг 0 пайплайна (предобработка по ТЗ):
      1) оттенки серого;
      2) CLAHE — усиление локального контраста (тени траншей становятся читаемы);
      3) гауссово размытие — подавление мелкого шума (трава, камни);
      4) Canny с ПОРОГАМИ ОТ МЕДИАНЫ (адаптивные к снимку) + морфология
         (dilate/close) для соединения разрывов линии окопа.

    Возвращает (gray_for_metrics, edges). Метрики яркости снимаются с gray ДО
    CLAHE — иначе усиленный контраст завысил бы и ширину, и теневой профиль.
    """
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    # Мягкое подавление солёного-перцевого шума без размывания траншей
    gray = cv2.medianBlur(gray, 3)

    clahe = cv2.createCLAHE(clipLimit=cfg.clahe_clip, tileGridSize=(cfg.clahe_grid, cfg.clahe_grid))
    enhanced = clahe.apply(gray)
    blurred = cv2.GaussianBlur(enhanced, (3, 3), cfg.blur_sigma)

    v = float(np.median(blurred))
    lo = max(5, int((1.0 - cfg.canny_low_ratio) * v))
    hi = int((1.0 + cfg.canny_high_ratio) * v)
    edges = cv2.Canny(blurred, lo, hi)

    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (3, 3))
    edges = cv2.dilate(edges, kernel, iterations=cfg.morph_dilate_iter)
    # Морфологическое закрытие на карте тёмных полос: соединяет разрывы
    dark_mask = cv2.morphologyEx(
        (blurred < v * 0.8).astype(np.uint8) * 255,
        cv2.MORPH_CLOSE, kernel, iterations=cfg.morph_close_iter)
    edges = cv2.bitwise_or(edges, cv2.Canny(dark_mask, 30, 90))
    return gray, edges


def detect_segments(img, gsd_m: float, cfg: TrenchConfig,
                    bbox: Tuple[float, float, float, float]) -> List["TrenchCandidate"]:
    """
    Шаг 1 пайплайна: детекция линейных структур на снимке.

    Предобработка (CLAHE+blur+Canny+морфология) → HoughLinesP → трассировка
    ломаной каждого отрезка → СКЛЕЙКА соосных осколков в единые трассы (иначе
    реальный окоп рассыпается на 15-метровые фрагменты и бракуется по длине) →
    метрики ширины/формы/текстуры/тени → строгий фильтр «окоп vs дорога»
    (classify_segment). Пиксельные координаты переводятся в географические по
    bbox.
    """
    gray, edges = preprocess_frame(img, cfg)

    min_lon, min_lat, max_lon, max_lat = bbox
    h, w = gray.shape
    mppb_x = (max_lon - min_lon) / max(1, w)  # градусов на пиксель по X
    mppb_y = (max_lat - min_lat) / max(1, h)  # градусов на пиксель по Y

    def px_to_lonlat(px: float, py: float) -> Tuple[float, float]:
        return (min_lon + px * mppb_x, max_lat - py * mppb_y)

    raw_traces = []
    for x0, y0, x1, y1 in _hough_segments(edges, cfg):
        trace = trace_polyline(gray, edges, (x0, y0), (x1, y1), gsd_m, cfg)
        if len(trace) >= 2:
            raw_traces.append([(float(a), float(b)) for a, b in trace])

    candidates: List[TrenchCandidate] = []
    for chain in merge_traces(raw_traces):
        if len(chain) < 2:
            continue
        metrics = polyline_metrics(chain, gray, gsd_m, cfg)
        is_trench, conf, reasons = classify_segment(metrics, cfg)
        coords = [px_to_lonlat(px, py) for px, py in chain]
        candidates.append(TrenchCandidate(
            coords_lonlat=coords, metrics=metrics,
            is_trench=is_trench, confidence=conf, reasons=reasons))
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
    # Кандидаты: не прошли строгий порог, но достаточно интересны, чтобы их
    # показал оператору на карте (зелёным пунктиром) для визуальной проверки.
    review = [c for c in cands if not c.is_trench and c.confidence >= cfg.candidate_gate]

    def to_feature(c: "TrenchCandidate") -> dict:
        return {
            "type": "Feature",
            "geometry": {"type": "LineString", "coordinates": [list(p) for p in c.coords_lonlat]},
            "properties": {
                "osiris_type": "trench",
                "confidence": c.confidence,
                "length_m": round(c.metrics.length_m, 1),
                "width_m": round(c.metrics.width_m, 2),
                "tortuosity": round(c.metrics.tortuosity, 3),
                "texture_std": round(c.metrics.texture_std, 4),
                "shadow_ratio": round(c.metrics.shadow_ratio, 2),
                "reasons_ru": c.reasons,
            },
        }

    features = [to_feature(c) for c in trenches]

    return {
        "scanned_segments": len(cands),
        "trenches_detected": len(trenches),
        "rejected_as_road_or_powerline": len(cands) - len(trenches) - len(review),
        "geojson": {"type": "FeatureCollection", "features": features},
        # Предварительный результат для отрисовки зелёным пунктиром (требует
        # подтверждения оператором; в хранилище НЕ пишется без подтверждения).
        "candidates_geojson": {
            "type": "FeatureCollection",
            "features": [dict(to_feature(c), properties={**to_feature(c)["properties"],
                                                          "needs_review": True})
                         for c in review],
        },
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
