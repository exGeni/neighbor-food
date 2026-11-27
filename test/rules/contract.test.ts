// The same suite as for the memory store, over the real client code and the emulators.
import { deleteApp, getApps } from 'firebase/app';
import { inMemoryPersistence } from 'firebase/auth';
import { disableNetwork, enableNetwork } from 'firebase/firestore';
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
