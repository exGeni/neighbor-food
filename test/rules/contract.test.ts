// The same suite as for the memory store, over the real client code and the emulators.
import { deleteApp, getApps } from 'firebase/app';
import { inMemoryPersistence } from 'firebase/auth';
import { disableNetwork, doc, enableNetwork, setDoc, Timestamp } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { randomId } from '../../src/limits';
import { connect, type FirestoreStore } from '../../src/store/firestore';
import { EMULATOR, EMULATOR_CONFIG } from '../../src/store/live';
import type { PostsSnapshot } from '../../src/store/types';
import { contract, newOffer, OWNER_CODE, snapshot } from '../contract';
import { environment, setOwnerCode } from './emulator';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await environment();
});
afterAll(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
  await env.cleanup();
});

async function user(): Promise<FirestoreStore> {
  const store = connect({ config: EMULATOR_CONFIG, emulator: EMULATOR, persistence: [inMemoryPersistence], appName: randomId(), quiet: true });
  await store.signIn();
  return store;
}

contract('Firestore', async () => {
  await env.clearFirestore();
  await setOwnerCode(env, OWNER_CODE);
  return { user, close: async () => {} };
});

describe('Firestore store', () => {
  it('shows an unconfirmed post as pending and confirms it later', async () => {
    await setOwnerCode(env, OWNER_CODE);
    const author = await user();
    const key = randomId();
    await author.createEntrance({ key, name: 'Hall', floors: 2, contact: 'Ann', code: OWNER_CODE });
    const seen: PostsSnapshot[] = [];
    const stop = author.watchPosts(key, (next) => seen.push(next), () => undefined);
    await snapshot(author, key, (s) => s.fromServer);

    await disableNetwork(author.db);
    const post = newOffer();
    const written = author.createPost(key, post);
    await expect.poll(() => seen.at(-1)?.posts[0]?.pending).toBe(true);
    await enableNetwork(author.db);
    await written;
    await expect.poll(() => seen.at(-1)?.posts[0]?.pending).toBeUndefined();
    stop();
  });

  it('reads an unknown or ill-formed key as no entrance', async () => {
    const store = await user();
    expect(await store.getEntrance('nonsense')).toBeNull();
    expect(await store.getEntrance(randomId())).toBeNull();
  });

  it('deletes what is already gone without complaint', async () => {
    await setOwnerCode(env, OWNER_CODE);
    const author = await user();
    const key = randomId();
    await author.createEntrance({ key, name: 'Hall', floors: 2, contact: 'Ann', code: OWNER_CODE });
    await expect(author.deletePost(key, 'never-was')).resolves.toBeUndefined();
  });
});

describe('a crowded entrance', () => {
  async function entrance(): Promise<{ author: FirestoreStore; key: string }> {
    await env.clearFirestore();
    await setOwnerCode(env, OWNER_CODE);
    const author = await user();
    const key = randomId();
    await author.createEntrance({ key, name: 'Hall', floors: 2, contact: 'Ann', code: OWNER_CODE });
    return { author, key };
  }

  it('gives three portions to exactly three of twenty at once', async () => {
    const { author, key } = await entrance();
    const post = newOffer({ portions: 3 });
    await author.createPost(key, post);
    const guests = await Promise.all(Array.from({ length: 20 }, () => user()));
    const outcomes = await Promise.all(guests.map((guest) => guest.claim(key, post.id, { name: '' }).catch((error) => 'refused:' + error.sdkCode)));
    expect(outcomes.filter((outcome) => outcome === 'taken')).toHaveLength(3);
    expect(outcomes.filter((outcome) => outcome.startsWith('refused'))).toEqual([]);
    const after = await author.getPost(key, post.id);
    expect(after?.left).toBe(0);
    expect(Object.keys(after?.responses ?? {})).toHaveLength(3);
  }, 120_000);

  it('finds posts that are over with its own query', async () => {
    const { author, key } = await entrance();
    await author.createPost(key, newOffer());
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore() as never, 'entrances', key, 'posts', 'old'), { expiresAt: Timestamp.fromMillis(Date.now() - 1000), createdAt: Timestamp.now() });
    });
    expect(await author.expired(key, 5)).toEqual(['old']);
  });

  it('reads a closed entrance as no entrance', async () => {
    const { key } = await entrance();
    await env.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore() as never, 'entrances', key), { closed: true }, { merge: true });
    });
    expect(await (await user()).getEntrance(key)).toBeNull();
  });
});
