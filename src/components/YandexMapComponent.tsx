'use client';

/**
 * YandexMapComponent — клиентский компонент карты на Яндекс Карт API 2.1.
 *
 * ОСОБЕННОСТИ:
 *  - Безопасная инициализация через useEffect с проверкой window.ymaps
 *    (скрипт API грузится в layout.tsx через next/script со стратегией
 *    afterInteractive, поэтому к моменту монтирования он может быть ещё
 *    не готов — ждём событие ymaps.ready / опрашиваем загрузку).
 *  - Тип карты по умолчанию: yandex#satellite (Спутник + подписи).
 *  - Центр: [50.284959, 37.681517], зум: 11 — район пользовательской
 *    карты-конструктора Яндекса (um=constructor:af87517a...).
 *  - Опциональная загрузка слоя-конструктора, если задан constructor id
 *    и включён режим usermaps (требует авторизации пользователя в Яндексе;
 *    при недоступности слоя карта просто остаётся в спутниковом режиме).
 */

import { useEffect, useRef, useState } from 'react';

/* Минимальная типизация глобального объекта ymaps (официальных TS-типов 2.1 нет).
   eslint-disable: библиотека подключается рантайм-скриптом, any здесь неизбежен. */
/* eslint-disable @typescript-eslint/no-explicit-any */

/* ── Настройки по умолчанию (согласно ТЗ) ─────────────────────────── */
export const YANDEX_MAP_DEFAULTS = {
  center: [50.284959, 37.681517] as [number, number], // [lat, lon]
  zoom: 11,
  type: 'yandex#satellite',                            // Спутник + подписи
  controls: ['zoomControl', 'typeSelector'],            // масштаб + выбор типа схемы
  /** id слоя-конструктора из ссылки um=constructor:<id> */
  constructorId:
    'af87517a6f87da7d082c4ae0faa6ac274904c7f0828ae8adf9f741527277c067',
};

interface YandexMapProps {
  /** Координаты центра [широта, долгота] */
  center?: [number, number];
  zoom?: number;
  /** Тип карты: yandex#satellite | yandex#map | yandex#hybrid */
  mapType?: string;
  className?: string;
  /** Показать слой-конструктор пользователя (если доступен) */
  showUserConstructorLayer?: boolean;
}

/** Ждём появления window.ymaps: скрипт мог начаться грузиться позже монтажа. */
function waitForYmaps(timeoutMs = 15000): Promise<any> {
  return new Promise((resolve, reject) => {
    const w = window as any;
    if (w.ymaps?.Map) return resolve(w.ymaps);

    const started = Date.now();
    const timer = window.setInterval(() => {
      if (w.ymaps?.Map) {
        window.clearInterval(timer);
        resolve(w.ymaps);
      } else if (Date.now() - started > timeoutMs) {
        window.clearInterval(timer);
        reject(new Error('Яндекс Карты API не загрузился: проверьте NEXT_PUBLIC_YANDEX_MAPS_API_KEY в .env.local'));
      }
    }, 200);
  });
}

export default function YandexMapComponent({
  center = YANDEX_MAP_DEFAULTS.center,
  zoom = YANDEX_MAP_DEFAULTS.zoom,
  mapType = YANDEX_MAP_DEFAULTS.type,
  className,
  showUserConstructorLayer = false,
}: YandexMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const yandexMapInstance = useRef<any>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [errorText, setErrorText] = useState<string>('');

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        /* Безопасная инициализация: проверяем наличие window.ymaps
           до создания карты. */
        const ymaps = await waitForYmaps();
        if (cancelled || !mapRef.current) return;

        await new Promise<void>((res) => ymaps.ready(res));
        if (cancelled || !mapRef.current || yandexMapInstance.current) return;

        const map = new ymaps.Map(mapRef.current, {
          center,        // [50.284959, 37.681517]
          zoom,          // 11
          type: mapType, // yandex#satellite — Спутник + подписи
          controls: YANDEX_MAP_DEFAULTS.controls as unknown as string[],
        });

        /* Пользовательская карта-конструктор из ссылки
           yandex.ru/maps/?mode=usermaps&um=constructor:...
           Доступна только при авторизованной загрузке; при неудаче
           молча оставляем базовый спутниковый слой. */
        if (showUserConstructorLayer && YANDEX_MAP_DEFAULTS.constructorId) {
          try {
            const layer = await ymaps.collections.UserMap.load(
              `user__map_${YANDEX_MAP_DEFAULTS.constructorId}`,
            );
            if (!cancelled) map.layers.add(layer);
          } catch {
            /* Слой недоступен без сессии Яндекса — не критично. */
          }
        }

        yandexMapInstance.current = map;
        if (!cancelled) setStatus('ready');
      } catch (e: any) {
        if (!cancelled) {
          setErrorText(e?.message || 'Не удалось загрузить Яндекс Карты');
          setStatus('error');
        }
      }
    })();

    /* Деструктор: освобождаем ресурсы карты при размонтировании. */
    return () => {
      cancelled = true;
      if (yandexMapInstance.current) {
        try { yandexMapInstance.current.destroy(); } catch { /* уже уничтожен */ }
        yandexMapInstance.current = null;
      }
    };
    /* Зависимости намеренно минимальны: карта создаётся один раз. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      {/* Контейнер, в который Яндекс рисует карту */}
      <div ref={mapRef} style={{ width: '100%', height: '100%' }} />

      {status === 'loading' && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,6,12,0.75)', color: '#E8E6E0',
            fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.1em',
          }}
        >
          ЗАГРУЗКА ЯНДЕКС КАРТ…
        </div>
      )}

      {status === 'error' && (
        <div
          style={{
            position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
            gap: 8, alignItems: 'center', justifyContent: 'center',
            background: 'rgba(6,6,12,0.85)', color: '#FF3D3D',
            fontFamily: 'monospace', fontSize: 12, padding: 16, textAlign: 'center',
          }}
        >
          <span>ОШИБКА ЗАГРУЗКИ ЯНДЕКС КАРТ</span>
          <span style={{ color: '#8A8880' }}>{errorText}</span>
        </div>
      )}
    </div>
  );
}
