// Behaviour a neighbour or the organiser can hit: retries, wording, what is hidden or reported.
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { logProblem, StoreError } from '../src/errors';
import { followClaims, group, timeLabel } from '../src/model';
import { reusable, signature } from '../src/pending';
import { share } from '../src/share';
import { MemoryStore, memoryData } from '../src/store/memory';
import type { Post, Store } from '../src/store/types';
import { askExpiry, daysFrom, defaultWhen, HOUR } from '../src/time';
import { checkPost } from '../src/validate';
import { publishOnce } from '../src/views/form';
import { newOffer, OWNER_CODE } from './contract';

const KEY = 'g'.repeat(22);

async function house(clock: () => number = Date.now) {
  const data = memoryData(OWNER_CODE);
  const author = new MemoryStore(data, 'author', clock, 'live');
  const guest = new MemoryStore(data, 'guest', clock, 'live');
  await author.signIn();
  await guest.signIn();
  await author.createEntrance({ key: KEY, name: 'Hall', floors: 3, contact: 'Ann', code: OWNER_CODE });
  return { data, author, guest };
}

const post = (id: string, extra: Partial<Post> = {}): Post => ({
  id,
  kind: 'offer',
  what: id,
  where: '',
  name: '',
  allergens: '',
  author: 'a',
  createdAt: 0,
  expiresAt: 10_000,
  responses: {},
  ...extra,
});

afterEach(() => vi.unstubAllGlobals());

describe('publishing again after a lost answer', () => {
  it('leaves exactly one post', async () => {
    const { data, author } = await house();
    const lost: Store = Object.create(author);
    lost.createPost = async (key, input) => {
      await author.createPost(key, input);
      throw new StoreError('NF-NET-UNCONFIRMED');
    };
    const offer = newOffer();
    await expect(publishOnce(lost, KEY, offer, false)).rejects.toBeInstanceOf(StoreError);
    await publishOnce(author, KEY, offer, true);
    expect(data.posts.get(KEY)?.size).toBe(1);
  });
  it('publishes when the first attempt never arrived', async () => {
    const { data, author } = await house();
    await publishOnce(author, KEY, newOffer(), true);
    expect(data.posts.get(KEY)?.size).toBe(1);
  });
});

describe('an unanswered post remembered on the phone', () => {
  const offer = newOffer({ portions: 3 });
  const kept = { id: offer.id, sig: signature(offer), since: 1000 };
  it('is the same post only while nothing changed and it is recent', () => {
    expect(reusable(kept, { ...offer, id: 'new' }, 2000)).toBe(true);
    expect(reusable(kept, { ...offer, portions: 4 }, 2000)).toBe(false);
    expect(reusable(kept, { ...offer, at: (offer.at as number) + HOUR }, 2000)).toBe(false);
    expect(reusable(kept, offer, 1000 + HOUR)).toBe(false);
    expect(reusable(null, offer, 2000)).toBe(false);
  });
});

describe('clearing out', () => {
  it('finds posts that are over, oldest first, whatever their age in the list', async () => {
    let now = Date.now();
    const { author } = await house(() => now);
    const first = newOffer();
    const second = newOffer({ at: now + 2 * HOUR, expiresAt: now + 5 * HOUR });
    await author.createPost(KEY, second);
    await author.createPost(KEY, first);
    expect(await author.expired(KEY, 5)).toEqual([]);
    now += 6 * HOUR;
    expect(await author.expired(KEY, 5)).toEqual([first.id, second.id]);
    expect(await author.expired(KEY, 1)).toEqual([first.id]);
  });
});

describe('the page and a restricted browser key', () => {
  it('sends the site origin to the database, and nothing more', () => {
    const page = readFileSync('src/index.html', 'utf8');
    expect(page).toContain('<meta name="referrer" content="strict-origin-when-cross-origin" />');
  });
});

describe('after the post is over', () => {
  it('answers "expired" to a reply and a cancel and keeps the count', async () => {
    let now = Date.now();
    const { data, author, guest } = await house(() => now);
    const offer = newOffer({ portions: 2 });
    await author.createPost(KEY, offer);
    await guest.claim(KEY, offer.id, { name: '' });
    now += 5 * HOUR;
    expect(await guest.cancel(KEY, offer.id)).toBe('expired');
    const late = new MemoryStore(data, 'late', () => now, 'live');
    await late.signIn();
    expect(await late.claim(KEY, offer.id, { name: '' })).toBe('expired');
    expect(data.posts.get(KEY)?.get(offer.id)?.left).toBe(1);
  });
});

describe('times', () => {
  it('refuses an offer time already past although the post would still live', () => {
    const now = Date.now();
    expect(checkPost(newOffer({ at: now - HOUR, expiresAt: now + 2 * HOUR }), now)).toHaveProperty('at', 'pastTime');
  });
  it('proposes tomorrow late in the evening', () => {
    expect(defaultWhen(new Date(2026, 10, 27, 12, 10).getTime())).toEqual({ day: 'today', time: '14:00' });
    expect(defaultWhen(new Date(2026, 10, 27, 23, 0).getTime())).toEqual({ day: 'tomorrow', time: '01:00' });
  });
  it('counts the days to a chosen date', () => {
    const late = new Date(2026, 10, 27, 23, 59).getTime();
    expect(daysFrom(late, '2026-11-28')).toBe(1);
    expect(daysFrom(late, '2026-12-02')).toBe(5);
    expect(daysFrom(late, '')).toBe(-1);
  });
  it('changes the words across midnight', () => {
    const evening = new Date(2026, 10, 27, 23, 50).getTime();
    const at = new Date(2026, 10, 28, 0, 10).getTime();
    const offer = post('p', { at, expiresAt: at + 3 * HOUR });
    expect(timeLabel(offer, evening, 'en')).toBe('tomorrow at 00:10');
    expect(timeLabel(offer, at - 5 * 60_000, 'en')).toBe('today at 00:10');
    expect(timeLabel(offer, at, 'en')).toBe('started at 00:10');
    expect(timeLabel(offer, evening - 3 * 24 * HOUR, 'en')).toMatch(/28 Nov.* at 00:10|Nov.*28.* at 00:10/);
    expect(new Date(askExpiry(evening, 'today')).getDate()).toBe(27);
  });
});

describe('what a neighbour sees of their own', () => {
  it('hides a post, but never one that was answered', () => {
    const answered = post('answered', { responses: { me: { name: '', at: 1 } } });
    const groups = group([post('other'), answered], 'me', new Set(['other', 'answered']), 0);
    expect(groups.hidden.map((p) => p.id)).toEqual(['other']);
    expect(groups.yours.map((p) => p.id)).toEqual(['answered']);
    expect(groups.offers).toEqual([]);
  });
  it('says ended or removed, and nothing for an own cancel', () => {
    const before = { over: { what: 'Soup', expiresAt: 5 }, taken: { what: 'Pie', expiresAt: 100 }, mine: { what: 'Tea', expiresAt: 100 } };
    const news = followClaims(before, [post('mine', { expiresAt: 100 })], 'me', 10);
    expect(news.lost).toEqual([
      { what: 'Soup', reason: 'ended' },
      { what: 'Pie', reason: 'removed' },
    ]);
    expect(news.claims).toEqual({});
  });
});

describe('sending to the building chat', () => {
  it('shares, copies, or asks to copy by hand', async () => {
    vi.stubGlobal('navigator', { share: () => Promise.reject(Object.assign(new Error('closed'), { name: 'AbortError' })) });
    expect(await share('Soup', 'https://x.test/')).toBe('shared');
    const written: string[] = [];
    vi.stubGlobal('navigator', { clipboard: { writeText: async (text: string) => void written.push(text) } });
    expect(await share('Soup', 'https://x.test/')).toBe('copied');
    expect(written).toEqual(['Soup\nhttps://x.test/']);
    vi.stubGlobal('navigator', { clipboard: { writeText: () => Promise.reject(new Error('no')) } });
    expect(await share('Soup', 'https://x.test/')).toBe('manual');
  });
});

describe('logs', () => {
  it('never repeat an address, key or text from an error', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    logProblem('claim', new Error(`failed for entrances/${KEY} Soup`));
    logProblem('claim', new StoreError('NF-ENTRY-DENIED', 'permission-denied'));
    expect(warn.mock.calls.flat().join(' ')).not.toContain(KEY);
    expect(warn.mock.calls.flat().join(' ')).toContain('NF-ENTRY-DENIED (permission-denied)');
    warn.mockRestore();
  });
});

describe('a copy without a database', () => {
  it('offers the demonstration only', async () => {
    const { liveStore } = await import('../src/store/live');
    expect(await liveStore()).toBeNull();
  });
});
