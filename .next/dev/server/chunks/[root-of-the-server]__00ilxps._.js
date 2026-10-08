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
"[project]/src/app/api/trenches/route.ts [app-route] (ecmascript)", ((__turbopack_context__) => {
"use strict";

__turbopack_context__.s([
    "DELETE",
    ()=>DELETE,
    "GET",
    ()=>GET,
    "POST",
    ()=>POST,
    "runtime",
    ()=>runtime
]);
/**
 * OSIRISX — /api/trenches: хранилище укреплений (окопов).
 *
 *  GET    — список всех сохранённых укреплений как GeoJSON FeatureCollection
 *           (+ опциональная фильтрация по bbox через lon/lat/zoom не требуется
 *            слою карты, но параметры валидируются на случай будущего).
 *  POST   — сохранить укрепление (ручной обвод «Полилиния» или CV-скан).
 *           Тело проходит строгую Zod-валидацию; пометка type:'trench'
 *           проставляется сервером принудительно.
 *  DELETE — удалить запись по id (?id=...).
 *
 * Безопасность: rate limiting 10 запросов/мин (см. src/lib/rate-limit.ts),
 * валидация каждой координаты и лимиты длины строк (src/lib/trench-schema.ts).
 */ var __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/node_modules/next/server.js [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/trench-store.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/trench-schema.ts [app-route] (ecmascript)");
var __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__ = __turbopack_context__.i("[project]/src/lib/rate-limit.ts [app-route] (ecmascript)");
;
;
;
;
const runtime = 'nodejs'; // файловое хранилище требует Node.js runtime
/** Общая проверка лимита: 10 запросов в минуту на клиент. */ function guard(req) {
    const res = (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["checkRateLimit"])((0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["clientKey"])(req), 10, 60_000);
    return res.ok ? null : (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$rate$2d$limit$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["rateLimitResponse"])(res);
}
async function GET(req) {
    const limited = guard(req);
    if (limited) return limited;
    // Параметры выборки валидируются, даже если пока не влияют на выдачу.
    const q = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trenchQuerySchema"].safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!q.success) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'НЕКОРРЕКТНЫЕ ПАРАМЕТРЫ',
            detail: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["zodErrorText"])(q.error)
        }, {
            status: 400
        });
    }
    const fc = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trenchesAsGeoJSON"])();
    const rows = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["listTrenches"])();
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        geojson: fc,
        count: rows.length,
        // Слой карты использует эти константы, чтобы отличаться от красных линий фронта.
        style: {
            strokeColor: '#5D4037',
            strokeWidth: 3,
            strokeOpacity: 0.9
        }
    });
}
async function POST(req) {
    const limited = guard(req);
    if (limited) return limited;
    let body;
    try {
        body = await req.json();
    } catch  {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ТЕЛО ЗАПРОСА НЕ ЯВЛЯЕТСЯ JSON'
        }, {
            status: 400
        });
    }
    const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trenchCreateSchema"].safeParse(body);
    if (!parsed.success) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ВАЛИДАЦИЯ НЕ ПРОЙДЕНА',
            detail: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["zodErrorText"])(parsed.error)
        }, {
            status: 400
        });
    }
    const feature = {
        ...parsed.data,
        createdAt: parsed.data.createdAt ?? Date.now(),
        type: 'trench'
    };
    try {
        await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["addTrench"])(feature);
    } catch (e) {
        const status = e?.status === 409 ? 409 : 500;
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'СОХРАНЕНИЕ НЕ ВЫПОЛНЕНО',
            detail: e?.message || String(e)
        }, {
            status
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        ok: true,
        feature
    }, {
        status: 201
    });
}
async function DELETE(req) {
    const limited = guard(req);
    if (limited) return limited;
    const parsed = __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["trenchDeleteSchema"].safeParse(Object.fromEntries(req.nextUrl.searchParams));
    if (!parsed.success) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'НЕКОРРЕКТНЫЙ id',
            detail: (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$schema$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["zodErrorText"])(parsed.error)
        }, {
            status: 400
        });
    }
    const removed = await (0, __TURBOPACK__imported__module__$5b$project$5d2f$src$2f$lib$2f$trench$2d$store$2e$ts__$5b$app$2d$route$5d$__$28$ecmascript$29$__["deleteTrench"])(parsed.data.id);
    if (!removed) {
        return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
            error: 'ЗАПИСЬ НЕ НАЙДЕНА'
        }, {
            status: 404
        });
    }
    return __TURBOPACK__imported__module__$5b$project$5d2f$node_modules$2f$next$2f$server$2e$js__$5b$app$2d$route$5d$__$28$ecmascript$29$__["NextResponse"].json({
        ok: true,
        deleted: parsed.data.id
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

//# sourceMappingURL=%5Broot-of-the-server%5D__00ilxps._.js.map