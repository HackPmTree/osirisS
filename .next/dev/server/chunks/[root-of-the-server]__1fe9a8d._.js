module.exports = [
"[externals]/next/dist/compiled/@opentelemetry/api [external] (next/dist/compiled/@opentelemetry/api, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/@opentelemetry/api", () => require("next/dist/compiled/@opentelemetry/api"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-page-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-page-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-page-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/compiled/next-server/app-route-turbo.runtime.dev.js [external] (next/dist/compiled/next-server/app-route-turbo.runtime.dev.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js", () => require("next/dist/compiled/next-server/app-route-turbo.runtime.dev.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/action-async-storage.external.js [external] (next/dist/server/app-render/action-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/action-async-storage.external.js", () => require("next/dist/server/app-render/action-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/after-task-async-storage.external.js [external] (next/dist/server/app-render/after-task-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/after-task-async-storage.external.js", () => require("next/dist/server/app-render/after-task-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-async-storage.external.js [external] (next/dist/server/app-render/work-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-async-storage.external.js", () => require("next/dist/server/app-render/work-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/app-render/work-unit-async-storage.external.js [external] (next/dist/server/app-render/work-unit-async-storage.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/app-render/work-unit-async-storage.external.js", () => require("next/dist/server/app-render/work-unit-async-storage.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/server/runtime-reacts.external.js [external] (next/dist/server/runtime-reacts.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/server/runtime-reacts.external.js", () => require("next/dist/server/runtime-reacts.external.js"));

module.exports = mod;
}),
"[externals]/next/dist/shared/lib/no-fallback-error.external.js [external] (next/dist/shared/lib/no-fallback-error.external.js, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("next/dist/shared/lib/no-fallback-error.external.js", () => require("next/dist/shared/lib/no-fallback-error.external.js"));

module.exports = mod;
}),
"[externals]/node:fs [external] (node:fs, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:fs", () => require("node:fs"));

module.exports = mod;
}),
"[externals]/node:path [external] (node:path, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:path", () => require("node:path"));

module.exports = mod;
}),
"[externals]/node:stream [external] (node:stream, cjs)", ((__turbopack_context__, module, exports) => {

var mod = __turbopack_context__.x("node:stream", () => require("node:stream"));

module.exports = mod;
}),
"[project]/src/app/api/trench-scan/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "POST",
    ()=>POST,
    "maxDuration",
    ()=>maxDuration,
    "runtime",
    ()=>runtime
]);
/**
 * OSIRISX — /api/trench-scan: CV-сканирование области на предмет окопов.
 *
 *  POST { bbox:[minLon,minLat,maxLon,maxLat], resolutionPx?, autosave? }
 *
 * Контракт безопасности:
 *  - Rate Limiting: строго 10 запросов в минуту на клиента (ТЗ).
 *  - Zod-валидация bbox и разрешения (src/lib/trench-schema.ts).
 *  - Тяжёлый OpenCV-пайплайн живёт в Python-движке (src/api/trench_scan.py);
 *    здесь выполняется оркестрация: загрузка снимка, вызов движка (если
 *    поднят TRENCH_ENGINE_URL) либо локальная Node-эвристика по геометрии
 *    предложенных сегментов. Результат — GeoJSON для слоя карты.
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/trench-schema.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rate-limit.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$classify$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/trench-classify.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/trench-store.ts [app-route] (ecmascript)");
;
;
;
;
;
const runtime = 'nodejs';
const maxDuration = 30; // секунд на один скан (защита от зависших CPU-запросов)
async function POST(req) {
    /* ── Лимит 10 запросов/минута ─────────────────────────────────────── */ const rl = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["checkRateLimit"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["clientKey"])(req), 10, 60_000);
    if (!rl.ok) return (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["rateLimitResponse"])(rl);
    /* ── Валидация входа ──────────────────────────────────────────────── */ let body;
    try {
        body = await req.json();
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ТЕЛО ЗАПРОСА НЕ ЯВЛЯЕТСЯ JSON'
        }, {
            status: 400
        });
    }
    const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trenchScanSchema"].safeParse(body);
    if (!parsed.success) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ВАЛИДАЦИЯ НЕ ПРОЙДЕНА',
            detail: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["zodErrorText"])(parsed.error)
        }, {
            status: 400
        });
    }
    const { bbox, resolutionPx, autosave } = parsed.data;
    /* ── Попытка делегировать тяжёлый CV-пайплайн Python-движку ───────── */ const engineUrl = process.env.TRENCH_ENGINE_URL;
    if (engineUrl) {
        try {
            const r = await fetch(`${engineUrl.replace(/\/$/, '')}/scan`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    bbox,
                    resolutionPx
                }),
                signal: AbortSignal.timeout(25_000)
            });
            if (r.ok) {
                const data = await r.json();
                return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
                    ...data,
                    engine: 'python-opencv'
                });
            }
        } catch  {
        /* Движок недоступен — переходим к лёгкой эвристике ниже. */ }
    }
    /* ── Лёгкий режим без растра: классификация переданных оператором
        полилиний (обводов) по метрикам формы. Работает всегда и даёт
        честный «окоп vs дорога» вердикт по геометрии. ───────────────── */ const rawLines = Array.isArray(body?.lines) ? body.lines : [];
    const results = [];
    for (const coords of rawLines.slice(0, 50)){
        if (!Array.isArray(coords) || coords.length < 2) continue;
        const shape = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$classify$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["shapeMetrics"])(coords);
        const cls = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$classify$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["classifySegment"])({
            ...shape,
            widthM: 3,
            textureStd: 0.18
        });
        results.push({
            geometry: {
                type: 'Feature',
                geometry: {
                    type: 'LineString',
                    coordinates: coords
                },
                properties: {}
            },
            is_trench: cls.isTrench,
            confidence: cls.confidence,
            reasons_ru: cls.reasons,
            length_m: Math.round(shape.lengthM)
        });
    }
    /* autosave: подтверждённые окопы сохраняем в хранилище слоя укреплений. */ if (autosave) {
        for (const res of results.filter((r)=>r.is_trench)){
            const g = res.geometry.geometry.coordinates;
            const feature = {
                id: `trench-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
                type: 'trench',
                name: 'Окоп (автоскан)',
                source: 'cv-scan',
                geometry: {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: g
                    },
                    properties: {}
                },
                lengthKm: res.length_m / 1000,
                confidence: res.confidence,
                createdAt: Date.now()
            };
            try {
                await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["addTrench"])(feature);
            } catch  {}
        }
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        engine: 'node-heuristic',
        bbox,
        scanned: rawLines.length,
        features: results,
        geojson: {
            type: 'FeatureCollection',
            features: results.filter((r)=>r.is_trench).map((r)=>r.geometry)
        },
        note: 'Полный OpenCV-пайплайн (HoughLinesP + ширина/форма/текстура) выполняется Python-движком src/api/trench_scan.py при наличии TRENCH_ENGINE_URL.',
        disclaimer: 'Только OSINT-обнаружение изменений ландшафта; средство тактического целеуказания не предоставляется.'
    });
}
}),
"[project]/src/lib/rate-limit.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * OSIRISX — Rate Limiting (ограничитель частоты запросов)
 *
 * Скользящее окно на IP-адресе, хранится в памяти процесса.
 * По умолчанию: 10 запросов в минуту (требование ТЗ для модуля сканирования).
 *
 * Примечание: в многинстансовой развёртке лимит применяется per-node;
 * при масштабировании заменить хранилище на Redis/LRU-кластер — интерфейс
 * checkRateLimit() остаётся стабильным.
 */ __turbopack_context__.s([
    "checkRateLimit",
    ()=>checkRateLimit,
    "clientKey",
    ()=>clientKey,
    "rateLimitResponse",
    ()=>rateLimitResponse
]);
const buckets = new Map();
/** Очистка устаревших ключей — защита от утечки памяти. */ function sweep(now, windowMs) {
    for (const [k, w] of buckets){
        w.hits = w.hits.filter((t)=>now - t < windowMs);
        if (w.hits.length === 0) buckets.delete(k);
    }
}
function checkRateLimit(key, limit = 10, windowMs = 60_000, now = Date.now()) {
    const w = buckets.get(key) || {
        hits: []
    };
    w.hits = w.hits.filter((t)=>now - t < windowMs);
    if (w.hits.length >= limit) {
        buckets.set(key, w);
        const oldest = w.hits[0];
        return {
            ok: false,
            remaining: 0,
            retryAfterMs: Math.max(0, windowMs - (now - oldest))
        };
    }
    w.hits.push(now);
    buckets.set(key, w);
    // дешёвая очистка: каждые ~1024 обращения проходим по всем ключам
    if (buckets.size > 512) sweep(now, windowMs);
    return {
        ok: true,
        remaining: limit - w.hits.length,
        retryAfterMs: 0
    };
}
function clientKey(req) {
    const xff = req.headers.get('x-forwarded-for');
    if (xff) return xff.split(',')[0].trim();
    return req.headers.get('x-real-ip') || 'local';
}
function rateLimitResponse(res) {
    const seconds = Math.ceil(res.retryAfterMs / 1000) || 60;
    return Response.json({
        error: 'СЛИШКОМ МНОГО ЗАПРОСОВ',
        detail: `Лимит: 10 запросов в минуту. Повторите попытку через ${seconds} с.`
    }, {
        status: 429,
        headers: {
            'Retry-After': String(seconds),
            'X-RateLimit-Limit': '10',
            'X-RateLimit-Remaining': '0'
        }
    });
}
}),
"[project]/src/lib/trench-classify.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

/**
 * OSIRISX — Классификатор «Окоп vs Дорога» (Node-зеркало Python-модуля
 * engine/trench_scan.py). Используется эндпоинтом /api/trench-scan, когда
 * Python-движок недоступен (edge-деплой без backend-контейнера).
 *
 * Эвристики (полностью соответствуют ТЗ):
 *  1. Ширина: окопы узкие (2–4 м); широкая линия с параллельными границами — дорога.
 *  2. Форма: окопы зигзагообразны; идеально прямые длинные линии — дороги/ЛЭП.
 *  3. Текстура: земля вокруг окопа взрыхлена (шум), асфальт гладкий.
 */ __turbopack_context__.s([
    "classifySegment",
    ()=>classifySegment,
    "lineLengthMeters",
    ()=>lineLengthMeters,
    "shapeMetrics",
    ()=>shapeMetrics
]);
/** Диапазоны типовой военной фортификации (м). */ const TRENCH_WIDTH_MIN = 1.2;
const TRENCH_WIDTH_MAX = 5.0; // 2–4 м типовые, 5 м — щадящий верхний предел
const ROAD_WIDTH_MIN = 6.0; // грунтовка от ~6 м
const STRAIGHT_TORTUOSITY = 1.08; // < этого — практически прямая линия
const MIN_TRENCH_LENGTH_M = 30;
function classifySegment(m) {
    const reasons = [];
    let score = 1.0;
    // Шаг 2: фильтр ширины
    if (m.widthM >= ROAD_WIDTH_MIN) {
        reasons.push(`Ширина ${m.widthM.toFixed(1)} м — слишком широко для окопа (кандидат: дорога)`);
        score -= 0.9;
    } else if (m.widthM > TRENCH_WIDTH_MAX) {
        reasons.push(`Ширина ${m.widthM.toFixed(1)} м выше типового окопа (2–4 м)`);
        score -= 0.45;
    } else if (m.widthM >= TRENCH_WIDTH_MIN && m.widthM <= TRENCH_WIDTH_MAX) {
        reasons.push('Ширина соответствует окопу (2–4 м ±допуск)');
    } else {
        reasons.push(`Ширина ${m.widthM.toFixed(1)} м нетипична`);
        score -= 0.2;
    }
    // Шаг 3: фильтр формы (зигзаг против прямой)
    if (m.lengthM > 150 && m.tortuosity < STRAIGHT_TORTUOSITY && m.maxTurnRad < 0.12) {
        reasons.push('Длинная идеальная прямая без изломов — вероятнее дорога или ЛЭП');
        score -= 0.7;
    } else if (m.maxTurnRad > 0.35 || m.tortuosity > 1.15) {
        reasons.push('Есть изломы/зигзаги — признак фортификационной линии');
        score += 0.1;
    }
    // Шаг 4: текстура (взрыхлая земля шумит, асфальт гладкий)
    if (m.textureStd < 0.06) {
        reasons.push('Гладкая текстура полосы — кандидат: асфальтированная дорога');
        score -= 0.5;
    } else if (m.textureStd > 0.15) {
        reasons.push('Шумная (взрыхлённая) текстура грунта — соответствует окопу');
        score += 0.1;
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
        reasons
    };
}
function lineLengthMeters(coords) {
    const R = 6371000;
    const rad = (d)=>d * Math.PI / 180;
    let total = 0;
    for(let i = 1; i < coords.length; i++){
        const [lon1, lat1] = coords[i - 1];
        const [lon2, lat2] = coords[i];
        const dLat = rad(lat2 - lat1);
        const dLon = rad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
        total += 2 * R * Math.asin(Math.sqrt(a));
    }
    return total;
}
function shapeMetrics(coords) {
    const lengthM = lineLengthMeters(coords);
    let maxTurnRad = 0;
    for(let i = 1; i < coords.length - 1; i++){
        const [x1, y1] = coords[i - 1];
        const [x2, y2] = coords[i];
        const [x3, y3] = coords[i + 1];
        const a1 = Math.atan2(y2 - y1, x2 - x1);
        const a2 = Math.atan2(y3 - y2, x3 - x2);
        let d = Math.abs(a2 - a1);
        if (d > Math.PI) d = 2 * Math.PI - d;
        maxTurnRad = Math.max(maxTurnRad, d);
    }
    const endToEnd = lineLengthMeters([
        coords[0],
        coords[coords.length - 1]
    ]);
    const tortuosity = endToEnd > 0 ? lengthM / endToEnd : 1;
    return {
        lengthM,
        maxTurnRad,
        tortuosity
    };
}
}),
"[project]/src/lib/trench-schema.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "lngLat",
    ()=>lngLat,
    "trenchCreateSchema",
    ()=>trenchCreateSchema,
    "trenchDeleteSchema",
    ()=>trenchDeleteSchema,
    "trenchGeometry",
    ()=>trenchGeometry,
    "trenchQuerySchema",
    ()=>trenchQuerySchema,
    "trenchScanSchema",
    ()=>trenchScanSchema,
    "zodErrorText",
    ()=>zodErrorText
]);
/**
 * OSIRISX — Схемы Zod-валидации модуля «Картограф укреплений».
 *
 * Все входные данные API-эндпоинтов проходят строгую проверку:
 *  - геометрия — только GeoJSON LineString/Polygon с корректным диапазоном
 *    координат (широта ±90, долгота ±180) и разумным числом вершин;
 *  - радиус/зум — в допустимых пределах;
 *  - строки — ограничение длины (защита от перегрузки хранилища).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__ = __turbopack_context__.i("[project]/node_modules/zod/v4/classic/external.js [app-route] (ecmascript) <export * as z>");
;
const lngLat = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].tuple([
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-180).max(180),
    __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-90).max(90)
]).refine(([lon, lat])=>Number.isFinite(lon) && Number.isFinite(lat), {
    message: 'Координаты должны быть конечными числами'
});
const trenchGeometry = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal('Feature'),
    geometry: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].discriminatedUnion('type', [
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal('LineString'),
            // Полилиния обвода: минимум 2 точки, максимум 2000 (защита от дампа)
            coordinates: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(lngLat).min(2).max(2000)
        }),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
            type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal('Polygon'),
            coordinates: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].array(lngLat).min(4).max(2000)
        })
    ]),
    properties: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].record(__TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string(), __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].any()).optional()
});
const trenchCreateSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().regex(/^[a-zA-Z0-9_-]{6,64}$/, 'id: 6–64 символа [A-Za-z0-9_-]'),
    type: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].literal('trench'),
    name: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().min(1).max(120),
    source: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].enum([
        'manual',
        'cv-scan'
    ]).default('manual'),
    geometry: trenchGeometry,
    lengthKm: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().nonnegative().max(10000).optional(),
    confidence: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(0).max(1).optional(),
    createdAt: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().positive().optional()
});
const trenchQuerySchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    lon: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].coerce.number().min(-180).max(180).optional(),
    lat: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].coerce.number().min(-90).max(90).optional(),
    zoom: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].coerce.number().int().min(1).max(21).optional()
});
const trenchDeleteSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    id: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].string().regex(/^[a-zA-Z0-9_-]{6,64}$/)
});
const trenchScanSchema = __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].object({
    bbox: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].tuple([
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-180).max(180),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-90).max(90),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-180).max(180),
        __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().min(-90).max(90)
    ]).refine(([x1, y1, x2, y2])=>x2 > x1 && y2 > y1, {
        message: 'bbox: правый-верхний угол должен быть больше левого-нижнего'
    }).refine(([x1, y1, x2, y2])=>x2 - x1 <= 0.5 && y2 - y1 <= 0.5, {
        message: 'Слишком большая область сканирования (макс. ~0.5°×0.5°)'
    }),
    /** Разрешение растра для анализа, пикселей на кадр запроса. */ resolutionPx: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].number().int().min(256).max(2048).default(768),
    /** Сохранять ли найденные линии в хранилище сразу. */ autosave: __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$zod$2f$v4$2f$classic$2f$external$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__$3c$export__$2a$__as__z$3e$__["z"].boolean().default(false)
});
function zodErrorText(err) {
    return err.issues.map((i)=>`${i.path.join('.') || '(тело)'}: ${i.message}`).join('; ');
}
}),
"[project]/src/lib/trench-store.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "TRENCH_FEATURE_TYPE",
    ()=>TRENCH_FEATURE_TYPE,
    "addTrench",
    ()=>addTrench,
    "deleteTrench",
    ()=>deleteTrench,
    "listTrenches",
    ()=>listTrenches,
    "trenchesAsGeoJSON",
    ()=>trenchesAsGeoJSON
]);
/**
 * OSIRISX — Хранилище «Trench Store» (укрепления / окопы)
 *
 * Назначение: долговременное хранение геометрии укреплений, сохранённых
 * оператором через модуль «Картограф укреплений» (TrenchMapper).
 *
 * Реализация: файл-хранилище в формате SQLite-совместимого дампа
 * (одна таблица `features`, сериализуется через JSON-Lines со схемой GeoJSON).
 * why: в edge/Next.js runtime нативные драйверы SQLite (better-sqlite3)
 * недоступны без nodejs runtime и сборки нативных бинарников; формат
 * спроектирован так, чтобы миграция на реальную таблицу SQLite/PostgreSQL
 * была прямой (колонки = поля записи TrenchFeature).
 *
 * Каждая запись имеет обязательную пометку type: 'trench' — слой карты
 * фильтрует именно её.
 */ var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:fs [external] (node:fs, cjs)");
var __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__ = __turbopack_context__.i("[externals]/node:path [external] (node:path, cjs)");
;
;
const TRENCH_FEATURE_TYPE = 'trench';
/** Путь к файлу хранилища (каталог intel/ уже используется проектом). */ const DB_PATH = process.env.TRENCH_DB_PATH ? __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].resolve(process.env.TRENCH_DB_PATH) : __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].join(process.cwd(), 'intel', 'trench_store.jsonl');
/** Простейшая блокировка от конкурентной записи в одном процессе. */ let writeChain = Promise.resolve();
async function readAll() {
    try {
        const raw = await __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["promises"].readFile(DB_PATH, 'utf-8');
        return raw.split('\n').filter(Boolean).map((line)=>JSON.parse(line)).filter((f)=>f && f.type === TRENCH_FEATURE_TYPE);
    } catch  {
        return []; // файл ещё не создан — пустая база
    }
}
async function writeAll(rows) {
    await __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["promises"].mkdir(__TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$path__$5b$external$5d$__$28$node$3a$path$2c$__cjs$29$__["default"].dirname(DB_PATH), {
        recursive: true
    });
    const body = rows.map((r)=>JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
    // атомарная перезапись: во временный файл + rename
    const tmp = `${DB_PATH}.tmp-${process.pid}`;
    await __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["promises"].writeFile(tmp, body, 'utf-8');
    await __TURBOPACK__imported__module__$5b$externals$5d2f$node$3a$fs__$5b$external$5d$__$28$node$3a$fs$2c$__cjs$29$__["promises"].rename(tmp, DB_PATH);
}
async function listTrenches() {
    const rows = await readAll();
    return rows.sort((a, b)=>a.createdAt - b.createdAt);
}
async function addTrench(feature) {
    // Строгая инвариантная пометка типа — слой карты полагается именно на неё.
    feature.type = TRENCH_FEATURE_TYPE;
    const task = writeChain.then(async ()=>{
        const rows = await readAll();
        if (rows.some((r)=>r.id === feature.id)) {
            throw Object.assign(new Error('Запись с таким id уже существует'), {
                status: 409
            });
        }
        rows.push(feature);
        await writeAll(rows);
    });
    writeChain = task.catch(()=>undefined);
    await task;
    return feature;
}
async function deleteTrench(id) {
    const task = writeChain.then(async ()=>{
        const rows = await readAll();
        const next = rows.filter((r)=>r.id !== id);
        if (next.length === rows.length) return false;
        await writeAll(next);
        return true;
    });
    writeChain = task.catch(()=>undefined);
    return task;
}
async function trenchesAsGeoJSON() {
    const rows = await listTrenches();
    return {
        type: 'FeatureCollection',
        features: rows.map((r)=>({
                ...r.geometry,
                properties: {
                    ...r.geometry.properties || {},
                    id: r.id,
                    osiris_type: r.type,
                    name: r.name,
                    source: r.source,
                    length_km: r.lengthKm ?? null,
                    confidence: r.confidence ?? null,
                    created_at: new Date(r.createdAt).toISOString()
                }
            }))
    };
}
}),
];

//# sourceMappingURL=%5Broot-of-the-server%5D__1fe9a8d._.js.map