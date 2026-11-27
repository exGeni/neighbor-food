import { describe, expect, it } from 'vitest';
import { randomId } from '../src/limits';
import { gate, MemoryStore, memoryData } from '../src/store/memory';
import type { PostsSnapshot } from '../src/store/types';
import { HOUR } from '../src/time';
import { contract, newOffer, OWNER_CODE } from './contract';

contract('memory', async () => {
  const data = memoryData(OWNER_CODE);
  return {
    async user() {
      const store = new MemoryStore(data, randomId(), Date.now, 'live');
      await store.signIn();
      return store;
    },
    async close() {},
  };
});

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

async function pair() {
  const data = memoryData(OWNER_CODE);
  const net = gate();
  const author = new MemoryStore(data, 'author', Date.now, 'live', net);
  const guest = new MemoryStore(data, 'guest', Date.now, 'live');
  await author.signIn();
  await guest.signIn();
  const key = randomId();
  await author.createEntrance({ key, name: 'Hall', floors: 5, contact: 'Ann', code: OWNER_CODE });
  return { data, net, author, guest, key };
}

const watch = (store: MemoryStore, key: string) => {
  const seen: PostsSnapshot[] = [];
  store.watchPosts(key, (snapshot) => seen.push(snapshot), () => undefined);
  return seen;
};

describe('memory store without a network', () => {
  it('shows an unconfirmed post to its writer only, marked pending', async () => {
    const { net, author, guest, key } = await pair();
    const mine = watch(author, key);
    const theirs = watch(guest, key);
    await tick();

    net.pause();
    const post = newOffer();
    const written = author.createPost(key, post);
    await tick();
    expect(mine.at(-1)?.posts).toMatchObject([{ id: post.id, pending: true }]);
    expect(theirs.at(-1)?.posts).toEqual([]);

    net.resume();
    await written;
    await tick();
    expect(mine.at(-1)?.posts[0]?.pending).toBeUndefined();
    expect(theirs.at(-1)?.posts).toHaveLength(1);
  });

  it('answers from the phone alone first, saying so', async () => {
    const { net, author, key } = await pair();
    net.pause();
    const seen = watch(author, key);
    await tick();
    expect(seen).toEqual([{ posts: [], fromServer: false }]);
    net.resume();
    await tick();
    expect(seen.at(-1)).toEqual({ posts: [], fromServer: true });
  });

  it('refuses a late write the rules no longer allow', async () => {
    const data = memoryData(OWNER_CODE);
    const net = gate();
    let now = Date.now();
    const author = new MemoryStore(data, 'author', () => now, 'live', net);
    await author.signIn();
    const key = randomId();
    await author.createEntrance({ key, name: 'Hall', floors: 5, contact: 'Ann', code: OWNER_CODE });
    net.pause();
    const written = author.createPost(key, newOffer({ at: now + HOUR, expiresAt: now + 4 * HOUR }));
    now += 5 * HOUR;
    net.resume();
    await expect(written).rejects.toMatchObject({ code: 'NF-ENTRY-DENIED' });
  });

  it('closes the entrance for everyone', async () => {
    const { data, guest, key } = await pair();
    (data.entrances.get(key) as { closed: boolean }).closed = true;
    expect(await guest.getEntrance(key)).toBeNull();
    await expect(guest.createPost(key, newOffer())).rejects.toMatchObject({ code: 'NF-ENTRY-DENIED' });
  });

  it('refuses every create when the organiser code is short', async () => {
    const data = memoryData('short');
    const store = new MemoryStore(data, 'a', Date.now, 'live');
    await store.signIn();
    await expect(store.createEntrance({ key: randomId(), name: 'Hall', floors: 5, contact: 'Ann', code: 'short' })).rejects.toMatchObject({ code: 'NF-NEW-REFUSED' });
  });
});
