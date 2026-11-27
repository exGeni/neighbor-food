// Every rule has an allow and a deny case. Limits come from the same table as the page.
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { LIMITS } from '../../src/limits';
import { DAY, HOUR } from '../../src/time';
import { environment, setOwnerCode } from './emulator';

const CODE = 'c'.repeat(LIMITS.ownerCodeMin);
const KEY = 'k'.repeat(22);
const CLOSED = 'z'.repeat(22);
const FRESH = 'n'.repeat(22);

let env: RulesTestEnvironment;

const as = (uid: string | null): Firestore =>
  (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore() as unknown as Firestore;

const admin = (act: (db: Firestore) => Promise<unknown>) =>
  env.withSecurityRulesDisabled(async (context) => {
    await act(context.firestore() as unknown as Firestore);
  });

const entranceData = (extra: object = {}) => ({ name: 'Hall', floors: 5, contact: 'Ann', closed: false, createdAt: serverTimestamp(), ...extra });

function create(uid: string | null, key: string, extra: object = {}, code: string | null = CODE) {
  const db = as(uid);
  const batch = writeBatch(db);
  batch.set(doc(db, 'entrances', key), entranceData(extra));
  if (code !== null) batch.set(doc(db, 'entrances', key, 'private', 'create'), { code });
  return batch.commit();
}

const soon = () => Date.now() + HOUR;

function offer(extra: Record<string, unknown> = {}, at = soon()) {
  return {
    kind: 'offer',
    what: 'Soup',
    where: 'in the hall',
    name: 'Ann',
    allergens: '',
    author: 'author',
    createdAt: serverTimestamp(),
    at: Timestamp.fromMillis(at),
    expiresAt: Timestamp.fromMillis(at + LIMITS.offerHoursAfter * HOUR),
    responses: {},
    portions: 3,
    left: 3,
    ...extra,
  };
}

function ask(extra: Record<string, unknown> = {}) {
  return {
    kind: 'ask',
    what: 'Flour',
    where: '',
    name: '',
    allergens: '',
    author: 'author',
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + DAY),
    responses: {},
    ...extra,
  };
}

const without = <T extends object>(value: T, ...fields: string[]) => Object.fromEntries(Object.entries(value).filter(([name]) => !fields.includes(name)));

const posts = (uid: string | null, key = KEY) => collection(as(uid), 'entrances', key, 'posts');
const post = (uid: string | null, id: string, key = KEY) => doc(as(uid), 'entrances', key, 'posts', id);
const make = (data: object, id = 'p1', uid: string | null = 'author', key = KEY) => setDoc(post(uid, id, key), data);

/** A post already in the database, written past the rules. */
const seed = (id: string, data: object) => admin((db) => setDoc(doc(db, 'entrances', KEY, 'posts', id), data));
const stored = (extra: Record<string, unknown> = {}) => offer({ createdAt: Timestamp.now(), ...extra });
const storedAsk = (extra: Record<string, unknown> = {}) => ask({ createdAt: Timestamp.now(), ...extra });

const reply = (extra: object = {}) => ({ name: 'Bo', at: serverTimestamp(), ...extra });
const claim = (uid: string, id: string, change: Record<string, unknown> = {}, entry: object = reply()) =>
  updateDoc(post(uid, id), { [`responses.${uid}`]: entry, left: 2, ...change });

beforeAll(async () => {
  env = await environment();
});
afterAll(() => env.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await setOwnerCode(env, CODE);
  await admin(async (db) => {
    await setDoc(doc(db, 'entrances', KEY), { name: 'Hall', floors: 5, contact: 'Ann', closed: false, createdAt: Timestamp.now() });
    await setDoc(doc(db, 'entrances', CLOSED), { name: 'Old', floors: 5, contact: 'Ann', closed: true, createdAt: Timestamp.now() });
  });
});

describe('organiser code', () => {
  it('is never readable or writable by anyone using the page', async () => {
    await assertFails(getDoc(doc(as('author'), 'config', 'owner')));
    await assertFails(getDoc(doc(as(null), 'config', 'owner')));
    await assertFails(setDoc(doc(as('author'), 'config', 'owner'), { code: 'x'.repeat(20) }));
  });
});

describe('entrance', () => {
  it('is read by key without signing in', async () => {
    await assertSucceeds(getDoc(doc(as(null), 'entrances', KEY)));
    await assertSucceeds(getDoc(doc(as(null), 'entrances', FRESH)));
  });
  it('is not readable once closed, and never listed', async () => {
    await assertFails(getDoc(doc(as(null), 'entrances', CLOSED)));
    await assertFails(getDoc(doc(as('author'), 'entrances', CLOSED)));
    await assertFails(getDocs(collection(as('author'), 'entrances')));
    await assertFails(getDocs(query(collection(as('author'), 'entrances'), limit(1))));
  });

  it('is created with the organiser code', async () => {
    await assertSucceeds(create('author', FRESH));
  });
  it('accepts names and contacts at their limits', async () => {
    await assertSucceeds(create('author', FRESH, { name: 'я'.repeat(LIMITS.entranceName), contact: '🍲'.repeat(LIMITS.contact / 2), floors: LIMITS.floorsMax }));
  });
  it('is refused without sign-in, code, or the code document', async () => {
    await assertFails(create(null, FRESH));
    await assertFails(create('author', FRESH, {}, 'w'.repeat(LIMITS.ownerCodeMin)));
    await assertFails(create('author', FRESH, {}, null));
  });
  it('is refused while the organiser code is too short', async () => {
    const short = 's'.repeat(LIMITS.ownerCodeMin - 1);
    await setOwnerCode(env, short);
    await assertFails(create('author', FRESH, {}, short));
  });
  it('is refused with a short or ill-formed key', async () => {
    await assertFails(create('author', 'short'));
    await assertFails(create('author', `${'a'.repeat(21)}!`));
  });
  it.each([
    ['an empty name', { name: '' }],
    ['a blank name', { name: '   ' }],
    ['a long name', { name: 'x'.repeat(LIMITS.entranceName + 1) }],
    ['a name on two lines', { name: 'a\nb' }],
    ['too few floors', { floors: LIMITS.floorsMin - 1 }],
    ['too many floors', { floors: LIMITS.floorsMax + 1 }],
    ['half a floor', { floors: 1.5 }],
    ['floors as text', { floors: '5' }],
    ['an empty contact', { contact: '' }],
    ['a long contact', { contact: 'x'.repeat(LIMITS.contact + 1) }],
    ['closed from the start', { closed: true }],
    ['a chosen creation time', { createdAt: Timestamp.fromMillis(0) }],
    ['an extra field', { admin: true }],
  ])('is refused with %s', async (_case, extra) => {
    await assertFails(create('author', FRESH, extra));
  });

  it('cannot be changed or deleted from the page', async () => {
    await assertFails(updateDoc(doc(as('author'), 'entrances', KEY), { closed: true }));
    await assertFails(setDoc(doc(as('author'), 'entrances', KEY), entranceData()));
    await assertFails(deleteDoc(doc(as('author'), 'entrances', KEY)));
  });
  it('cannot be taken over through the create record', async () => {
    await assertFails(setDoc(doc(as('author'), 'entrances', KEY, 'private', 'create'), { code: CODE }));
    await assertFails(setDoc(doc(as('author'), 'entrances', FRESH, 'private', 'create'), { code: CODE }));
  });
  it('is not created over a left-behind create record', async () => {
    await admin((db) => setDoc(doc(db, 'entrances', FRESH, 'private', 'create'), { code: CODE }));
    await assertFails(create('author', FRESH));
  });
  it('keeps the create record unreadable and offers no other subcollection', async () => {
    await assertSucceeds(create('author', FRESH));
    await assertFails(getDoc(doc(as('author'), 'entrances', FRESH, 'private', 'create')));
    await assertFails(deleteDoc(doc(as('author'), 'entrances', FRESH, 'private', 'create')));
    await assertFails(setDoc(doc(as('author'), 'entrances', KEY, 'other', 'x'), { a: 1 }));
    await assertFails(getDoc(doc(as('author'), 'entrances', KEY, 'posts', 'p1', 'more', 'x')));
  });
});

describe('reading posts', () => {
  const newest = (uid: string | null, count: number, key = KEY) => getDocs(query(posts(uid, key), orderBy('createdAt', 'desc'), limit(count)));
  it('works for a signed-in neighbour up to the limit', async () => {
    await seed('p1', stored());
    await assertSucceeds(newest('guest', LIMITS.readLimit));
    await assertSucceeds(getDoc(post('guest', 'p1')));
    await assertSucceeds(getDoc(post('guest', 'missing')));
  });
  it('is refused without sign-in, without a limit or above it', async () => {
    await seed('p1', stored());
    await assertFails(newest(null, 1));
    await assertFails(getDoc(post(null, 'p1')));
    await assertFails(getDocs(posts('guest')));
    await assertFails(newest('guest', LIMITS.readLimit + 1));
  });
  it('stops for a closed or unknown entrance', async () => {
    await assertFails(newest('guest', 1, CLOSED));
    await assertFails(newest('guest', 1, FRESH));
    await assertFails(make(offer(), 'p1', 'author', CLOSED));
    await assertFails(make(offer(), 'p1', 'author', FRESH));
  });
});

describe('a new post', () => {
  it('may be an offer with or without portions, or a request', async () => {
    await assertSucceeds(make(offer(), 'p1'));
    await assertSucceeds(make(without(offer(), 'portions', 'left'), 'p2'));
    await assertSucceeds(make(ask(), 'p3'));
  });
  it('may use every field to its limit, an emoji counting as two', async () => {
    await assertSucceeds(
      make(
        offer({
          what: '🍲'.repeat(LIMITS.what / 2),
          where: 'ж'.repeat(LIMITS.where),
          name: 'ł'.repeat(LIMITS.name),
          allergens: 'x'.repeat(LIMITS.allergens),
          portions: LIMITS.portionsMax,
          left: LIMITS.portionsMax,
        }),
      ),
    );
    await assertSucceeds(make(ask({ expiresAt: Timestamp.fromMillis(Date.now() + LIMITS.expiryDays * DAY - HOUR) }), 'p2'));
  });

  it.each([
    ['someone else as author', () => offer({ author: 'other' })],
    ['a chosen creation time', () => offer({ createdAt: Timestamp.fromMillis(Date.now()) })],
    ['an expiry in the past', () => offer({}, Date.now() - 4 * HOUR)],
    ['too long a life', () => ask({ expiresAt: Timestamp.fromMillis(Date.now() + (LIMITS.expiryDays + 1) * DAY) })],
    ['a reply already inside', () => offer({ responses: { x: { name: '' } } })],
    ['no replies map', () => without(offer(), 'responses')],
    ['an empty title', () => offer({ what: '' })],
    ['a blank title', () => offer({ what: '   ' })],
    ['a long title', () => offer({ what: 'x'.repeat(LIMITS.what + 1) })],
    ['a title of too many emoji', () => offer({ what: '🍲'.repeat(LIMITS.what / 2 + 1) })],
    ['a title on two lines', () => offer({ what: 'a\nb' })],
    ['a title that is not text', () => offer({ what: 5 })],
    ['a long place', () => offer({ where: 'x'.repeat(LIMITS.where + 1) })],
    ['a long name', () => offer({ name: 'x'.repeat(LIMITS.name + 1) })],
    ['long allergens', () => offer({ allergens: 'x'.repeat(LIMITS.allergens + 1) })],
    ['an extra field', () => offer({ price: 5 })],
    ['an unknown kind', () => offer({ kind: 'sale' })],
    ['an offer without a time', () => without(offer(), 'at')],
    ['an expiry not three hours after the time', () => offer({ expiresAt: Timestamp.fromMillis(Date.now() + DAY) })],
    ['no portions at all in a count', () => offer({ portions: LIMITS.portionsMin - 1, left: LIMITS.portionsMin - 1 })],
    ['too many portions', () => offer({ portions: LIMITS.portionsMax + 1, left: LIMITS.portionsMax + 1 })],
    ['half a portion', () => offer({ portions: 1.5, left: 1.5 })],
    ['a count already used', () => offer({ left: 2 })],
    ['portions without a count left', () => without(offer(), 'left')],
    ['a count without portions', () => without(offer(), 'portions')],
    ['a request with allergens', () => ask({ allergens: 'nuts' })],
    ['a request with a time', () => ask({ at: Timestamp.fromMillis(soon()) })],
    ['a request with portions', () => ask({ portions: 2, left: 2 })],
  ])('is refused with %s', async (_case, data) => {
    await assertFails(make(data()));
  });

  it('is refused under an ill-formed id', async () => {
    await assertFails(make(offer(), 'x'.repeat(65)));
    await assertFails(make(offer(), 'a b'));
  });
});

describe('replying', () => {
  beforeEach(async () => {
    await seed('p1', stored());
    await seed('ask', storedAsk());
    await seed('open', without(stored(), 'portions', 'left'));
  });

  it('takes one portion, or one place on an offer without a count', async () => {
    await assertSucceeds(claim('guest', 'p1'));
    await assertSucceeds(updateDoc(post('guest', 'open'), { 'responses.guest': reply() }));
  });
  it('answers a request with a note', async () => {
    await assertSucceeds(updateDoc(post('guest', 'ask'), { 'responses.guest': reply({ note: 'x'.repeat(LIMITS.note) }) }));
  });

  it.each([
    ['without counting down', { left: 3 }],
    ['counting down twice', { left: 1 }],
    ['counting up', { left: 4 }],
    ['changing the title', { what: 'Cake' }],
    ['changing the expiry', { expiresAt: Timestamp.fromMillis(Date.now() + 5 * DAY) }],
    ['writing for another person', { 'responses.other': reply() }],
    ['becoming the author', { author: 'guest' }],
  ])('is refused %s', async (_case, change) => {
    await assertFails(claim('guest', 'p1', change));
  });

  it.each([
    ['an extra field', { phone: '1' }],
    ['a long name', { name: 'x'.repeat(LIMITS.name + 1) }],
    ['a name on two lines', { name: 'a\nb' }],
    ['a chosen time', { at: Timestamp.fromMillis(0) }],
    ['a note on an offer', { note: 'hello' }],
  ])('is refused with %s in the reply', async (_case, extra) => {
    await assertFails(claim('guest', 'p1', {}, reply(extra)));
  });

  it('is refused for a request without a note, with a blank or long one', async () => {
    const answer = (entry: object) => updateDoc(post('guest', 'ask'), { 'responses.guest': entry });
    await assertFails(answer(reply()));
    await assertFails(answer(reply({ note: '  ' })));
    await assertFails(answer(reply({ note: 'x'.repeat(LIMITS.note + 1) })));
  });
  it('is refused for the author, a stranger id, or without sign-in', async () => {
    await assertFails(claim('author', 'p1'));
    await assertFails(updateDoc(post('guest', 'p1'), { 'responses.other': reply(), left: 2 }));
    await assertFails(updateDoc(post(null, 'p1'), { 'responses.guest': reply(), left: 2 }));
  });
  it('is refused when nothing is left', async () => {
    await seed('none', stored({ left: 0 }));
    await assertFails(claim('guest', 'none', { left: -1 }));
  });
  it('is refused after the post expired', async () => {
    await seed('late', stored({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) }));
    await assertFails(claim('guest', 'late'));
  });
  it('stops at the limit of replies', async () => {
    const many = (count: number) => Object.fromEntries(Array.from({ length: count }, (_, i) => [`u${i}`, { name: '', at: Timestamp.now() }]));
    await seed('almost', without(stored({ responses: many(LIMITS.responses - 1) }), 'portions', 'left'));
    await seed('full', without(stored({ responses: many(LIMITS.responses) }), 'portions', 'left'));
    await assertSucceeds(updateDoc(post('guest', 'almost'), { 'responses.guest': reply() }));
    await assertFails(updateDoc(post('guest', 'full'), { 'responses.guest': reply() }));
  });
});

describe('cancelling', () => {
  beforeEach(() => seed('p1', stored({ left: 1, responses: { guest: { name: '', at: Timestamp.now() }, other: { name: '', at: Timestamp.now() } } })));

  it('gives the own portion back', async () => {
    await assertSucceeds(updateDoc(post('guest', 'p1'), { 'responses.guest': deleteField(), left: 2 }));
  });
  it('is refused for another person, or with a wrong count', async () => {
    await assertFails(updateDoc(post('guest', 'p1'), { 'responses.other': deleteField(), left: 2 }));
    await assertFails(updateDoc(post('guest', 'p1'), { 'responses.guest': deleteField(), left: 1 }));
    await assertFails(updateDoc(post('guest', 'p1'), { 'responses.guest': deleteField(), left: 3 }));
    await assertFails(updateDoc(post('guest', 'p1'), { left: 2 }));
    await assertFails(updateDoc(post('guest', 'p1'), { 'responses.guest': reply({ name: 'again' }) }));
  });
});

describe('deleting', () => {
  it('is for the author', async () => {
    await seed('p1', stored());
    await assertFails(deleteDoc(post('guest', 'p1')));
    await assertFails(deleteDoc(post(null, 'p1')));
    await assertSucceeds(deleteDoc(post('author', 'p1')));
  });
  it('is for anyone signed in once the post expired', async () => {
    await seed('old', stored({ expiresAt: Timestamp.fromMillis(Date.now() - 1000) }));
    await assertFails(deleteDoc(post(null, 'old')));
    await assertSucceeds(deleteDoc(post('guest', 'old')));
  });
});
