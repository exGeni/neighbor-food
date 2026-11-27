// What every store must do. Run against memory here and against Firestore in test/rules.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { StoreError } from '../src/errors';
import { LIMITS, randomId } from '../src/limits';
import type { NewPost, Post, PostsSnapshot, Store } from '../src/store/types';
import { HOUR, offerExpiry } from '../src/time';

export const OWNER_CODE = 'contract-organiser-code';

export interface Harness {
  /** A signed-in store for a new person. */
  user(): Promise<Store>;
  close(): Promise<void>;
}

export const newOffer = (extra: Partial<NewPost> = {}): NewPost => {
  const at = Date.now() + HOUR;
  return { id: randomId(), kind: 'offer', what: 'Soup', where: 'in the hall', name: 'Ann', allergens: '', at, expiresAt: offerExpiry(at), ...extra };
};

export const newAsk = (extra: Partial<NewPost> = {}): NewPost => ({
  id: randomId(),
  kind: 'ask',
  what: 'Flour',
  where: '',
  name: '',
  allergens: '',
  expiresAt: Date.now() + 24 * HOUR,
  ...extra,
});

/** Resolves with the first server snapshot that satisfies `until`. */
export function snapshot(store: Store, key: string, until: (snapshot: PostsSnapshot) => boolean): Promise<PostsSnapshot> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('no matching snapshot')), 5000);
    const stop = store.watchPosts(
      key,
      (next) => {
        if (!until(next)) return;
        clearTimeout(timer);
        resolve(next);
        queueMicrotask(() => stop());
      },
      reject,
    );
  });
}

export function contract(name: string, harness: () => Promise<Harness>): void {
  describe(`store contract: ${name}`, () => {
    let h: Harness;
    let author: Store;
    let guest: Store;
    let other: Store;
    let key: string;

    beforeEach(async () => {
      h = await harness();
      author = await h.user();
      guest = await h.user();
      other = await h.user();
      key = randomId();
      await author.createEntrance({ key, name: 'Hall', floors: 5, contact: 'Ann', code: OWNER_CODE });
    });
    afterEach(() => h.close());

    const read = async (id: string): Promise<Post> => (await guest.getPost(key, id)) as Post;

    it('creates an entrance and finds it by key only', async () => {
      expect(await guest.getEntrance(key)).toEqual({ key, name: 'Hall', floors: 5, contact: 'Ann', closed: false });
      expect(await guest.getEntrance(randomId())).toBeNull();
    });

    it('refuses an entrance with a wrong organiser code and creates nothing', async () => {
      const bad = randomId();
      await expect(author.createEntrance({ key: bad, name: 'Hall', floors: 5, contact: 'Ann', code: 'wrong-code-wrong-code' })).rejects.toBeInstanceOf(StoreError);
      expect(await guest.getEntrance(bad)).toBeNull();
    });

    it('shows a new offer to a neighbour, with its portions', async () => {
      const post = newOffer({ portions: 3 });
      await author.createPost(key, post);
      const seen = await snapshot(guest, key, (s) => s.fromServer && s.posts.length === 1);
      expect(seen.posts[0]).toMatchObject({ id: post.id, what: 'Soup', portions: 3, left: 3, author: author.me(), responses: {} });
    });

    it('counts portions down and up, once per person', async () => {
      const post = newOffer({ portions: 2 });
      await author.createPost(key, post);
      expect(await guest.claim(key, post.id, { name: 'Bo' })).toBe('taken');
      expect(await guest.claim(key, post.id, { name: 'Bo' })).toBe('already');
      expect((await read(post.id)).left).toBe(1);
      expect(await guest.cancel(key, post.id)).toBe('cancelled');
      expect(await guest.cancel(key, post.id)).toBe('cancelled');
      expect((await read(post.id)).left).toBe(2);
    });

    it('gives the last portion to one of two', async () => {
      const post = newOffer({ portions: 1 });
      await author.createPost(key, post);
      const outcomes = await Promise.all([guest.claim(key, post.id, { name: '' }), other.claim(key, post.id, { name: '' })]);
      expect(outcomes.sort()).toEqual(['full', 'taken']);
      expect((await read(post.id)).left).toBe(0);
    });

    it('answers "gone" for a removed post', async () => {
      const post = newOffer();
      await author.createPost(key, post);
      await author.deletePost(key, post.id);
      expect(await guest.claim(key, post.id, { name: '' })).toBe('gone');
      expect(await guest.cancel(key, post.id)).toBe('gone');
    });

    it('keeps no count on an offer without portions', async () => {
      const post = newOffer();
      await author.createPost(key, post);
      expect(await guest.claim(key, post.id, { name: '' })).toBe('taken');
      const after = await read(post.id);
      expect(after.left).toBeUndefined();
      expect(Object.keys(after.responses)).toHaveLength(1);
    });

    it('takes a reply to a request with its note', async () => {
      const post = newAsk();
      await author.createPost(key, post);
      expect(await guest.claim(key, post.id, { name: 'Bo', note: 'At 7 in the hall' })).toBe('taken');
      expect((await read(post.id)).responses[guest.me() as string]).toMatchObject({ name: 'Bo', note: 'At 7 in the hall' });
    });

    it('refuses a request reply without a note', async () => {
      const post = newAsk();
      await author.createPost(key, post);
      await expect(guest.claim(key, post.id, { name: 'Bo' })).rejects.toBeInstanceOf(StoreError);
    });

    it('does not let the author take their own offer', async () => {
      const post = newOffer({ portions: 2 });
      await author.createPost(key, post);
      await expect(author.claim(key, post.id, { name: '' })).rejects.toBeInstanceOf(StoreError);
    });

    it('stops at the limit of replies', async () => {
      const post = newOffer();
      await author.createPost(key, post);
      for (let i = 0; i < LIMITS.responses; i++) {
        expect(await (await h.user()).claim(key, post.id, { name: '' })).toBe('taken');
      }
      expect(await guest.claim(key, post.id, { name: '' })).toBe('full');
    }, 60_000);

    it('lets only the author delete a post that is not over', async () => {
      const post = newOffer();
      await author.createPost(key, post);
      await expect(guest.deletePost(key, post.id)).rejects.toBeInstanceOf(StoreError);
      await author.deletePost(key, post.id);
      expect(await guest.getPost(key, post.id)).toBeNull();
    });

    it('refuses a post in the past and one that lives too long', async () => {
      await expect(author.createPost(key, newOffer({ at: Date.now() - 4 * HOUR, expiresAt: Date.now() - HOUR }))).rejects.toBeInstanceOf(StoreError);
      await expect(author.createPost(key, newAsk({ expiresAt: Date.now() + (LIMITS.expiryDays + 1) * 24 * HOUR }))).rejects.toBeInstanceOf(StoreError);
    });
  });
}
