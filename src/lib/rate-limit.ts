/**
 * OSIRISX — Rate Limiting (ограничитель частоты запросов)
 *
 * Скользящее окно на IP-адресе, хранится в памяти процесса.
 * По умолчанию: 25 запросов в минуту (актуальное требование ТЗ для модуля
 * сканирования укреплений; исторический лимит 10/мин был пересмотрен).
 *
 * Примечание: в многинстансовой развёртке лимит применяется per-node;
 * при масштабировании заменить хранилище на Redis/LRU-кластер — интерфейс
 * checkRateLimit() остаётся стабильным.
 */

import { NextRequest } from 'next/server';

interface Window { hits: number[] }
const buckets = new Map<string, Window>();

/** Единый лимит модуля сканирования укреплений: 25 запросов в минуту. */
export const RATE_LIMIT_PER_MINUTE = 25;

/** Очистка устаревших ключей — защита от утечки памяти. */
function sweep(now: number, windowMs: number) {
  for (const [k, w] of buckets) {
    w.hits = w.hits.filter((t) => now - t < windowMs);
    if (w.hits.length === 0) buckets.delete(k);
  }
}

export interface RateResult {
  ok: boolean;
  /** Сколько запросов ещё доступно в текущем окне. */
  remaining: number;
  /** Через сколько мс окно «очистится» (для заголовка Retry-After). */
  retryAfterMs: number;
}

/**
 * Проверить лимит для ключа (обычно IP клиента).
 * @param limit  максимум запросов (по умолчанию 25)
 * @param windowMs длительность окна в мс (по умолчанию 60 000 = 1 минута)
 */
export function checkRateLimit(
  key: string,
  limit = RATE_LIMIT_PER_MINUTE,
  windowMs = 60_000,
  now = Date.now(),
): RateResult {
  const w = buckets.get(key) || { hits: [] };
  w.hits = w.hits.filter((t) => now - t < windowMs);
  if (w.hits.length >= limit) {
    buckets.set(key, w);
    const oldest = w.hits[0];
    return { ok: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - oldest)) };
  }
  w.hits.push(now);
  buckets.set(key, w);
  // дешёвая очистка: каждые ~1024 обращения проходим по всем ключам
  if (buckets.size > 512) sweep(now, windowMs);
  return { ok: true, remaining: limit - w.hits.length, retryAfterMs: 0 };
}

/** Извлечь идентификатор клиента из запроса (XFF → host). */
export function clientKey(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'local';
}

/** Готовый 429-ответ с русским сообщением и стандартными заголовками. */
export function rateLimitResponse(res: RateResult): Response {
  const seconds = Math.ceil(res.retryAfterMs / 1000) || 60;
  return Response.json(
    {
      error: 'СЛИШКОМ МНОГО ЗАПРОСОВ',
      detail: `Лимит: ${RATE_LIMIT_PER_MINUTE} запросов в минуту. Повторите попытку через ${seconds} с.`,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(seconds),
        'X-RateLimit-Limit': String(RATE_LIMIT_PER_MINUTE),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
