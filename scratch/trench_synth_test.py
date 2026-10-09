# -*- coding: utf-8 -*-
"""Синтетический тест детектора: зигзаг-окоп с валом/тенью против прямой дороги и ЛЭП."""
import sys, os, json
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'src', 'api'))
import numpy as np, cv2
import trench_scan as ts

H = W = 768
GSD = 0.19  # м/пикс (z=19)
rng = np.random.default_rng(42)

# Фон: «поля» со слабой текстурой
base = rng.normal(120, 8, (H, W)).clip(0, 255).astype(np.uint8)
img = cv2.merge([base, base, base])

def draw_polyline(pts, width_px, color, blur=0):
    for i in range(len(pts)-1):
        cv2.line(img, pts[i], pts[i+1], color, width_px)

# 1) ОКОП: узкая тёмная траншея + светлый вал с одной стороны, тень с другой, зигзаг
zig = []
x, y = 120, 200
for k in range(14):
    zig.append((int(x), int(y)))
    x += 30
    y += 22 if k % 2 == 0 else -22
# траншея (тёмная, ~3 px = 0.6м... ширина измерится по профилю; рисуем 4px)
for i in range(len(zig)-1):
    a, b = zig[i], zig[i+1]
    dx, dy = b[0]-a[0], b[1]-a[1]; L = np.hypot(dx,dy); nx, ny = -dy/L, dx/L
    for t in np.linspace(0, 1, int(L)*2):
        cx, cy = a[0]+dx*t, a[1]+dy*t
        img[int(cy), int(cx)] = 55                      # дно траншеи
        img[int(cy+ny*3), int(cx+nx*3)] = 170           # светлый вал
        img[int(cy-ny*3), int(cx-nx*3)] = 80            # теневая сторона
zig_path = zig

# 2) ДОРОГА: широкая (10px=1.9м? нет — рисуем 30px ≈ 5.7м… сделаем 40px≈7.6м) прямая, гладкая, светлая
road = [(100, 560), (660, 560)]
cv2.line(img, road[0], road[1], 150, 40)  # шире road_width_min при GSD 0.19 => 40px=7.6м

# 3) ЛЭП: очень длинная идеальная прямая, тонкая
power = [(60, 90), (700, 110)]
cv2.line(img, power[0], power[1], 60, 2)

ok, enc = cv2.imencode('.png', img)
path = '/tmp/synth_trench.png'
open(path, 'wb').write(enc.tobytes())

bbox = (37.600, 50.280, 37.600 + W*GSD/(111320*np.cos(np.radians(50.28))), 50.280 + H*GSD/111320)
res = ts.scan(path, bbox, GSD)
print(json.dumps({k: v for k, v in res.items() if k != 'geojson' and k != 'candidates_geojson'}, ensure_ascii=False, indent=1))
for f in res['geojson']['features']:
    p = f['properties']
    print('TRENCH conf=%.2f len=%.0f w=%.2f shadow=%.2f tort=%.2f tex=%.3f' % (p['confidence'], p['length_m'], p['width_m'], p['shadow_ratio'], p['tortuosity'], p['texture_std']))
for f in res.get('candidates_geojson', {}).get('features', []):
    p = f['properties']
    print('CANDIDATE conf=%.2f len=%.0f w=%.2f shadow=%.2f reasons=%s' % (p['confidence'], p['length_m'], p['width_m'], p['shadow_ratio'], p['reasons_ru'][:2]))
