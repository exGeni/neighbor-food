import { describe, expect, it } from 'vitest';
import { createDemo, DEMO_KEY, DEMO_USER } from '../src/demo';
import { calendarFile, escapeText, fold } from '../src/ics';
import { clean, length, LIMITS, randomId, KEY_PATTERN } from '../src/limits';
import { demoUrl, parseRoute, postUrl } from '../src/router';
import { askExpiry, daysBetween, offerAt, HOUR } from '../src/time';
import { checkPost } from '../src/validate';
import { assignWindows, drawnFloors, windowState } from '../src/windows';
import type { Post } from '../src/store/types';
import { newAsk, newOffer } from './contract';

const post = (id: string, extra: Partial<Post> = {}): Post => ({
  id,
  kind: 'offer',
  what: 'Soup',
  where: '',
  name: '',
  allergens: '',
  author: 'a',
  createdAt: 0,
  expiresAt: 1000,
  responses: {},
  ...extra,
});

describe('limits', () => {
  it('counts like the database rules', () => {
    expect(length('🍲суп')).toBe(5);
  });
  it('makes single-line fields', () => {
    expect(clean('  a\r\nb\n ')).toBe('a b');
  });
  it('makes keys the rules accept', () => {
    expect(randomId()).toMatch(KEY_PATTERN);
    expect(randomId()).not.toBe(randomId());
  });
});

describe('time', () => {
  const noon = new Date(2026, 10, 27, 12, 0).getTime();
  it('takes a clock time on a coming day', () => {
    expect(offerAt(noon, 0, '15:30')).toBe(new Date(2026, 10, 27, 15, 30).getTime());
    expect(offerAt(noon, 1, '9:00')).toBe(new Date(2026, 10, 28, 9, 0).getTime());
  });
  it('keeps the wall-clock time across the spring change', () => {
    const before = new Date(2027, 2, 27, 12, 0).getTime();
    expect(new Date(offerAt(before, 1, '17:00') as number).getHours()).toBe(17);
  });
  it('refuses unreadable input', () => {
    expect(offerAt(noon, 0, '25:00')).toBeNull();
    expect(offerAt(noon, 0, '')).toBeNull();
    expect(offerAt(noon, LIMITS.offerDaysAhead + 1, '10:00')).toBeNull();
  });
  it('ends a request tonight or in a week', () => {
    expect(new Date(askExpiry(noon, 'today')).getHours()).toBe(23);
    expect(askExpiry(noon, 'week') - noon).toBe(7 * 24 * HOUR);
    expect(daysBetween(noon, askExpiry(noon, 'week'))).toBe(7);
  });
});

describe('post checks', () => {
  const now = Date.now();
  it('accepts a normal offer and request', () => {
    expect(checkPost(newOffer(), now)).toEqual({});
    expect(checkPost(newAsk(), now)).toEqual({});
  });
  it('names the field that is wrong', () => {
    expect(checkPost(newOffer({ what: '   ' }), now)).toHaveProperty('what', 'required');
    expect(checkPost(newOffer({ what: 'x'.repeat(LIMITS.what + 1) }), now)).toHaveProperty('what', 'tooLong');
    expect(checkPost(newOffer({ portions: 21 }), now)).toHaveProperty('portions', 'badPortions');
  });
});

describe('windows', () => {
  it('draws one to six floors', () => {
    expect([drawnFloors(0), drawnFloors(3), drawnFloors(30)]).toEqual([1, 3, 6]);
  });
  it('places the same posts the same way whatever their order', () => {
    const posts = Array.from({ length: 6 }, (_, i) => post(`p${i}`, { createdAt: i }));
    const slots = (list: Post[]) => [...assignWindows(list, 8, 1)].map(([slot, p]) => `${slot}:${p.id}`).sort();
    expect(slots([...posts].reverse())).toEqual(slots(posts));
    expect(new Set(slots(posts)).size).toBe(6);
  });
  it('shows the newest when there are more posts than windows, and no expired ones', () => {
    const posts = [post('old', { createdAt: 1 }), post('new', { createdAt: 2 }), post('gone', { createdAt: 3, expiresAt: 5 })];
    expect([...assignWindows(posts, 1, 10).values()].map((p) => p.id)).toEqual(['new']);
  });
  it('tells the window states apart', () => {
    expect(windowState(undefined, 'me')).toBe('dark');
    expect(windowState(post('a'), 'me')).toBe('offer');
    expect(windowState(post('a', { kind: 'ask' }), 'me')).toBe('ask');
    expect(windowState(post('a', { author: 'me' }), 'me')).toBe('mine');
    expect(windowState(post('a', { responses: { me: { name: '', at: 0 } } }), 'me')).toBe('mine');
    expect(windowState(post('a', { left: 0, author: 'me' }), 'me')).toBe('full');
  });
});

describe('routes', () => {
  it('reads every address', () => {
    expect(parseRoute('')).toEqual({ name: 'demo' });
    expect(parseRoute('#/demo/poster')).toEqual({ name: 'poster', key: null });
    expect(parseRoute('#/e/KEY')).toEqual({ name: 'entrance', key: 'KEY' });
    expect(parseRoute('#/e/KEY?p=abc')).toEqual({ name: 'entrance', key: 'KEY', post: 'abc' });
    expect(parseRoute('#/e/KEY?p=a%20b')).toEqual({ name: 'entrance', key: 'KEY' });
    expect(parseRoute('#/e/KEY/poster')).toEqual({ name: 'poster', key: 'KEY' });
    expect(parseRoute('#/e/KEY/about')).toEqual({ name: 'about', key: 'KEY' });
    expect(parseRoute('#/new')).toEqual({ name: 'new' });
    expect(parseRoute('#/about')).toEqual({ name: 'about', key: null });
    expect(parseRoute('#/nonsense')).toEqual({ name: 'demo' });
  });
  it('builds links from the site address only', () => {
    const site = 'https://example.test/neighbor-food/';
    expect(demoUrl(site)).toBe(`${site}#/demo`);
    expect(postUrl('K', 'p1', site)).toBe(`${site}#/e/K?p=p1`);
  });
});

describe('calendar file', () => {
  const file = calendarFile({
    uid: 'p1',
    start: Date.UTC(2026, 10, 27, 14, 0),
    stamp: Date.UTC(2026, 10, 27, 10, 0),
    title: 'Суп; с, хлебом',
    where: 'в холле',
  });
  it('carries the time in UTC, an alarm and CRLF lines', () => {
    expect(file).toContain('DTSTART:20261127T140000Z\r\n');
    expect(file).toContain('DTEND:20261127T143000Z\r\n');
    expect(file).toContain('DTSTAMP:20261127T100000Z\r\n');
    expect(file).toContain('TRIGGER:-PT15M\r\n');
    expect(file).toContain('UID:p1@neighbor-food\r\n');
    expect(file.replace(/\r\n/g, '')).not.toContain('\n');
  });
  it('escapes text', () => {
    expect(file).toContain('SUMMARY:Суп\\; с\\, хлебом');
    expect(escapeText('a\\b\nc')).toBe('a\\\\b\\nc');
  });
  it('folds long Cyrillic lines at 75 octets without breaking a letter', () => {
    const line = `SUMMARY:${'щ'.repeat(100)}`;
    const folded = fold(line);
    for (const part of folded.split('\r\n')) expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
    expect(folded.replace(/\r\n /g, '')).toBe(line);
  });
});

describe('demo house', () => {
  it('has every window state to show and nobody real in it', async () => {
    const demo = await createDemo('en');
    const posts = [...(demo.data.posts.get(DEMO_KEY)?.values() ?? [])];
    expect(posts.some((p) => p.left === 0)).toBe(true);
    expect(posts.some((p) => p.kind === 'ask')).toBe(true);
    expect(posts.some((p) => p.kind === 'offer' && p.portions === undefined)).toBe(true);
    expect(demo.store.me()).toBe(DEMO_USER);
    expect(posts.every((p) => p.author !== DEMO_USER)).toBe(true);
  });
  it('changes language without losing what the visitor did', async () => {
    const demo = await createDemo('en');
    await demo.store.claim(DEMO_KEY, 'soup', { name: 'Me' });
    demo.setLang('ru');
    const soup = await demo.store.getPost(DEMO_KEY, 'soup');
    expect(soup?.what).toBe('Томатный супчик');
    expect(soup?.responses[DEMO_USER]?.name).toBe('Me');
  });
});
