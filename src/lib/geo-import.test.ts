import { describe, it, expect } from 'vitest';
import { fromYandexLink, detectKind, importFromText } from './geo-import';

// Эталонная ссылка пользователя: спутник + подписи, карта-конструктор, центр Харьков (зум 11)
const CONSTRUCTOR_URL =
  'https://yandex.ru/maps/?l=sat%2Cskl&ll=37.681517%2C50.284959&mode=usermaps' +
  '&um=constructor%3Aaf87517a6f87da7d082c4ae0faa6ac274904c7f0828ae8adf9f741527277c067&z=11';

describe('fromYandexLink — карты-конструкторы (um=constructor:...)', () => {
  it('извлекает id конструктора из закодированной ссылки', () => {
    const gj = fromYandexLink(CONSTRUCTOR_URL);
    expect(gj.type).toBe('FeatureCollection');
    expect(gj.features.length).toBe(1);
    const p = gj.features[0].properties;
    expect(p.yandex_constructor_id).toBe(
      'af87517a6f87da7d082c4ae0faa6ac274904c7f0828ae8adf9f741527277c067');
    expect(p.yandex_mode).toBe('usermaps');
  });

  it('сохраняет центр (ll), зум и режим слоёв sat,skl', () => {
    const f = fromYandexLink(CONSTRUCTOR_URL).features[0];
    // Координаты GeoJSON: [долгота, широта]
    expect(f.geometry.coordinates).toEqual([37.681517, 50.284959]);
    // свойства сериализуются в строки (см. feature() в geo-import.ts)
    expect(f.properties.zoom).toBe('11');
    expect(f.properties.yandex_layers).toBe('sat,skl');
  });

  it('по умолчанию считает режим «спутник + подписи»', () => {
    const url = 'https://yandex.ru/maps/?ll=37.681517%2C50.284959&mode=usermaps' +
      '&um=constructor%3Aabcdef0123456789abcdef0123456789&z=11';
    const p = fromYandexLink(url).features[0].properties;
    expect(p.yandex_layers).toBe('sat,skl');
  });

  it('работает через общий импорт по тексту ссылки', () => {
    expect(detectKind('', CONSTRUCTOR_URL).kind).toBe('yandex');
    const res = importFromText(CONSTRUCTOR_URL);
    expect(res.count).toBe(1);
    expect(res.name).toBe('Яндекс Карты');
  });
});

describe('fromYandexLink — обычные ссылки', () => {
  it('точка по ll=долгота,широта', () => {
    const gj = fromYandexLink('https://yandex.ru/maps/?ll=30.5234%2C50.4515&z=13');
    expect(gj.features[0].geometry.coordinates).toEqual([30.5234, 50.4515]);
  });

  it('маршрут по нескольким m=точкам', () => {
    const gj = fromYandexLink(
      'https://yandex.ru/maps/?source=srm&m=48.7092;44.5119~lm&m=48.7087;44.4999~lm');
    expect(gj.features[0].geometry.type).toBe('LineString');
    expect(gj.features[0].geometry.coordinates.length).toBe(2);
  });

  it('отклоняет не-Yandex домен', () => {
    expect(() => fromYandexLink('https://example.com/maps/?ll=1,2')).toThrow();
  });
});
