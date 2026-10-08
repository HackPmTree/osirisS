# -*- coding: utf-8 -*-
"""
OSIRISX — HTTP-обёртка CV-движка «Окоп vs Дорога».

Запуск (локально или в контейнере):
    python src/api/trench_engine.py            # порт 8790 по умолчанию
    TRENCH_ENGINE_PORT=8791 python src/api/trench_engine.py

После запуска добавьте в .env.local:
    TRENCH_ENGINE_URL=http://127.0.0.1:8790

Эндпоинты:
    GET  /health — проверка готовности и наличия OpenCV;
    POST /scan   — { bbox:[minLon,minLat,maxLon,maxLat], image_b64?, gsd_m? }
                   Если image_b64 не передан, движок сам скачивает мозаичный
                   спутниковый снимок bbox (Esri World_Imagery) и запускает
                   пайплайн trench_scan.scan().

Зависимости: opencv-python-headless, numpy. Стандартная библиотека http.server —
без внешних веб-фреймворков, чтобы движок поднимался минимальными средствами.
"""

from __future__ import annotations

import base64
import io
import json
import math
import os
import sys
import tempfile
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trench_scan  # noqa: E402  (наш CV-пайплайн)

try:
    import cv2
    import numpy as np
    HAS_CV = True
except ImportError:
    HAS_CV = False

MAX_BODY = 32 * 1024 * 1024  # 32 МБ — потолок для base64-снимка


def dedupe_features(features: list[dict]) -> list[dict]:
    """Убрать дубликаты сегментов из перекрывающихся окон анализа."""
    seen: set[tuple] = set()
    out: list[dict] = []
    for f in features:
        coords = tuple(tuple(round(v, 5) for v in p)
                       for p in f.get("geometry", {}).get("coordinates", []))
        key = min(coords, coords[::-1]) if coords else None
        if not key or key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def _tile_url(z: int, x: int, y: int) -> str:
    """Мозаичный спутниковый растр Esri (открытый доступ, без ключа)."""
    return (f"https://server.arcgisonline.com/ArcGIS/rest/services/"
            f"World_Imagery/MapServer/tile/{z}/{y}/{x}")


def download_bbox_image(bbox, resolution_px: int = 768) -> tuple[bytes, float]:
    """
    Скачать мозаичный спутниковый кадр, покрывающий bbox, с максимальным
    доступным разрешением (z=19 ≈ 0.3 м/пикс — иначе окоп 2–4 м физически
    не различим). Кадр режется на тайлы resolution_px и возвращаются ВСЕ
    тайлы: маленький bbox целиком не влезает в один кадр без деградации GSD.

    Возвращает (список PNG-байтов, список bbox каждого тайла, GSD м/пикс).
    """
    min_lon, min_lat, max_lon, max_lat = bbox
    z = 19  # фиксированный VHR-зум Esri World_Imagery

    def deg2xy(lat, lon, zz):
        n = 2 ** zz
        x = (lon + 180.0) / 360.0 * n
        y = (1.0 - math.asinh(math.tan(math.radians(lat))) / math.pi) / 2.0 * n
        return x, y

    x1, y1 = deg2xy(max_lat, min_lon, z)   # левый-верхний угол bbox
    x2, y2 = deg2xy(min_lat, max_lon, z)   # правый-нижний угол bbox
    tx0, ty0 = int(math.floor(x1)), int(math.floor(y1))
    tx1, ty1 = int(math.floor(x2)), int(math.floor(y2))

    # Скачиваем все тайлы покрытия (потолок 64 — защита от перегрузки)
    tiles: dict[tuple[int, int], "np.ndarray"] = {}
    todo = [(tx, ty) for ty in range(ty0, ty1 + 1) for tx in range(tx0, tx1 + 1)]
    if len(todo) > 64:
        raise RuntimeError(f"Область слишком велика для движка: тайлов {len(todo)} (макс. 64)")
    for tx, ty in todo:
        try:
            with urllib.request.urlopen(_tile_url(z, tx, ty), timeout=15) as r:
                buf = np.frombuffer(r.read(), np.uint8)
            tile = cv2.imdecode(buf, cv2.IMREAD_COLOR)
            if tile is not None:
                tiles[(tx, ty)] = tile
        except Exception:
            pass  # пропущенный тайл — чёрная область, фильтр её отсеет сам
    if not tiles:
        raise RuntimeError("Не удалось скачать ни одного тайла для bbox")

    # Мозаика покрытия
    cols, rows = tx1 - tx0 + 1, ty1 - ty0 + 1
    canvas = np.zeros((rows * 256, cols * 256, 3), dtype=np.uint8)
    for (tx, ty), tile in tiles.items():
        canvas[(ty - ty0) * 256:(ty - ty0 + 1) * 256,
               (tx - tx0) * 256:(tx - tx0 + 1) * 256] = tile

    # Пиксельные границы bbox внутри мозаики
    cx1, cy1 = int(round((x1 - tx0) * 256)), int(round((y1 - ty0) * 256))
    cx2, cy2 = int(round((x2 - tx0) * 256)), int(round((y2 - ty0) * 256))
    crop = canvas[max(0, cy1):cy2, max(0, cx1):cx2]
    if crop.size == 0:
        raise RuntimeError("Пустой кадр после обрезки bbox")

    # GSD на выбранных координатах (без ресейза — разрешение сохраняем!)
    lat_mid = math.radians((min_lat + max_lat) / 2.0)
    gsd = 156543.03 * math.cos(lat_mid) / (2 ** z)

    # Режем кадр на окна resolution_px с перекрытием 25% (чтобы линии на
    # границе окон не терялись); каждое окно → свой снимок и свой подс bbox.
    step = max(1, int(resolution_px * 0.75))
    h, w = crop.shape[:2]
    images: list[bytes] = []
    boxes: list[tuple[float, float, float, float]] = []
    px_span_x = max_lon - min_lon
    px_span_y = max_lat - min_lat
    off_x0, off_y0 = max(0, cx1), max(0, cy1)
    for oy in range(0, max(1, h - resolution_px + 1), step):
        for ox in range(0, max(1, w - resolution_px + 1), step):
            win = crop[oy:oy + resolution_px, ox:ox + resolution_px]
            if win.shape[0] < 128 or win.shape[1] < 128:
                continue
            ok, enc = cv2.imencode(".png", win)
            if not ok:
                continue
            images.append(enc.tobytes())
            # географический bbox окна (обратно через пиксельные доли кадра)
            gx1 = min_lon + px_span_x * (ox + off_x0) / max(1, cx2 - cx1)
            gx2 = min_lon + px_span_x * (ox + off_x0 + win.shape[1]) / max(1, cx2 - cx1)
            gy2 = max_lat - px_span_y * (oy + off_y0) / max(1, cy2 - cy1)
            gy1 = max_lat - px_span_y * (oy + off_y0 + win.shape[0]) / max(1, cy2 - cy1)
            boxes.append((round(gx1, 7), round(gy1, 7), round(gx2, 7), round(gy2, 7)))
    if not images:
        raise RuntimeError("Кадр слишком мал для окон анализа")
    return images, boxes, gsd


class Handler(BaseHTTPRequestHandler):
    def log_message(self, fmt, *args):  # тихий лог, чтобы не спамить
        pass

    def _json(self, code: int, payload: dict):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            self._json(200, {"ok": True, "cv2": HAS_CV,
                             "version": getattr(cv2, "__version__", None) if HAS_CV else None})
        else:
            self._json(404, {"error": "Неизвестный путь"})

    def do_POST(self):
        if self.path != "/scan":
            self._json(404, {"error": "Неизвестный путь"})
            return
        if not HAS_CV:
            self._json(503, {"error": "OpenCV не установлен: pip install opencv-python-headless numpy"})
            return
        try:
            length = int(self.headers.get("content-length", 0))
            if length > MAX_BODY:
                self._json(413, {"error": "Слишком большое изображение (макс. 32 МБ)"})
                return
            data = json.loads(self.rfile.read(length).decode("utf-8"))
            bbox = data.get("bbox")
            if (not isinstance(bbox, list) or len(bbox) != 4
                    or not all(isinstance(v, (int, float)) for v in bbox)):
                self._json(400, {"error": "bbox должен быть [minLon,minLat,maxLon,maxLat]"})
                return
            gsd_override = data.get("gsd_m")
            img_b64 = data.get("image_b64")

            tmp_path = None
            try:
                if img_b64:
                    # Снимок прислан оператором (скриншот карты) — GSD по умолчанию 0.5 м/пикс
                    raw = base64.b64decode(img_b64.split(",")[-1])
                    fd, tmp_path = tempfile.mkstemp(suffix=".png")
                    with os.fdopen(fd, "wb") as f:
                        f.write(raw)
                    gsd = float(gsd_override) if gsd_override else 0.5
                    result = trench_scan.scan(tmp_path, tuple(bbox), gsd)
                    result["gsd_m"] = round(gsd, 3)
                else:
                    # Автоскачивание реального VHR-кадра по bbox (несколько окон)
                    images, boxes, gsd_auto = download_bbox_image(
                        bbox, int(data.get("resolutionPx", 768)))
                    gsd_eff = float(gsd_override) if gsd_override else gsd_auto
                    merged_feats = []
                    scanned = trenches_n = rejected_n = 0
                    fd, tmp_path = tempfile.mkstemp(suffix=".png")
                    os.close(fd)  # дескриптор не нужен — пишем по имени файла
                    for png_bytes, win_bbox in zip(images, boxes):
                        with open(tmp_path, "wb") as f:
                            f.write(png_bytes)
                        r = trench_scan.scan(tmp_path, win_bbox, gsd_eff)
                        scanned += r.get("scanned_segments", 0)
                        trenches_n += r.get("trenches_detected", 0)
                        rejected_n += r.get("rejected_as_road_or_powerline", 0)
                        merged_feats += r.get("geojson", {}).get("features", [])
                    result = {
                        "scanned_segments": scanned,
                        "trenches_detected": trenches_n,
                        "rejected_as_road_or_powerline": rejected_n,
                        "geojson": {"type": "FeatureCollection",
                                    "features": dedupe_features(merged_feats)},
                        "gsd_m": round(gsd_eff, 3),
                        "windows_analyzed": len(images),
                        "disclaimer": "Только OSINT-обнаружение изменений ландшафта; "
                                      "тактическое целеуказание не предоставляется.",
                    }
                self._json(200, result)
            finally:
                if tmp_path and os.path.exists(tmp_path):
                    os.unlink(tmp_path)
        except Exception as exc:  # noqa: BLE001
            self._json(500, {"error": f"Внутренняя ошибка движка: {exc}"})


def main():
    port = int(os.environ.get("TRENCH_ENGINE_PORT", "8790"))
    srv = ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"[osiris-trench-engine] слушает http://127.0.0.1:{port} "
          f"(OpenCV: {'OK' if HAS_CV else 'НЕ УСТАНОВЛЕН'})")
    srv.serve_forever()


if __name__ == "__main__":
    main()
