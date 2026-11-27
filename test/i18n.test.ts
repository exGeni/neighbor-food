import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '../src/errors';
import { DICTS, LANGS, pickLang, plural, t, type Dict } from '../src/i18n';

const shape = (value: unknown, path: string): string[] =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value).flatMap(([key, child]) => (/^(one|few|many|other)$/.test(key) ? [] : shape(child, `${path}.${key}`)))
    : [Array.isArray(value) ? `${path}[${value.length}]` : path];

const strings = (value: unknown): string[] => (typeof value === 'string' ? [value] : Object.values(value as object).flatMap(strings));
const placeholders = (value: unknown): string => [...new Set(strings(value).flatMap((s) => s.match(/\{\w+\}/g) ?? []))].sort().join();

describe('translations', () => {
  it('have the same keys in all three languages', () => {
    for (const lang of LANGS) expect(shape(DICTS[lang], 'd').sort()).toEqual(shape(DICTS.en, 'd').sort());
  });

  it('use the same placeholders and leave nothing empty', () => {
    for (const lang of LANGS) {
      for (const [key, value] of Object.entries(DICTS[lang]) as [keyof Dict, unknown][]) {
        expect(placeholders(value), `${lang}.${key}`).toBe(placeholders(DICTS.en[key]));
        for (const text of strings(value)) expect(text.trim(), `${lang}.${key}`).not.toBe('');
      }
    }
  });

  it('explain every error a screen can show', () => {
    const screen = ERROR_CODES.filter((code) => !code.startsWith('NF-BUILD-'));
    for (const lang of LANGS) expect(Object.keys(DICTS[lang].errors).sort()).toEqual([...screen].sort());
  });

  it('count in Polish and Russian', () => {
    expect([1, 2, 5, 22].map((n) => plural('askCount', n, 'pl'))).toEqual(['1 prośba', '2 prośby', '5 próśb', '22 prośby']);
    expect([1, 3, 5, 21].map((n) => plural('askCount', n, 'ru'))).toEqual(['1 просьба', '3 просьбы', '5 просьб', '21 просьба']);
    expect([1, 2].map((n) => plural('askCount', n, 'en'))).toEqual(['1 request', '2 requests']);
  });

  it('pick the language from the browser, then the choice', () => {
    expect(pickLang(['ru-RU', 'en'], null)).toBe('ru');
    expect(pickLang(['de-DE', 'pl'], null)).toBe('pl');
    expect(pickLang(['de'], null)).toBe('en');
    expect(pickLang(['ru'], 'pl')).toBe('pl');
  });

  it('keep an unknown placeholder visible', () => {
    expect(t('organiser', {}, 'en')).toBe('Organiser: {contact}');
  });
});
