// Which post lights which window. The same on every phone: it depends only on the posts.
import type { Post } from './store/types';

export const WINDOWS_PER_FLOOR = 4;
export const MAX_DRAWN_FLOORS = 6;

export const drawnFloors = (floors: number): number => Math.max(1, Math.min(MAX_DRAWN_FLOORS, Math.floor(floors) || 1));

/** FNV-1a: a small stable hash of the post id. */
export function hash(value: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The newest posts up to the number of windows are shown; they are placed oldest first, starting
 * from a slot derived from the id and moving to the next free slot on a clash.
 */
export function assignWindows(posts: Post[], windows: number, now: number): Map<number, Post> {
  const byAge = (a: Post, b: Post) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : 1);
  const shown = posts
    .filter((post) => post.expiresAt > now)
    .sort(byAge)
    .slice(-windows);
  const taken = new Map<number, Post>();
  for (const post of shown) {
    let slot = hash(post.id) % windows;
    while (taken.has(slot)) slot = (slot + 1) % windows;
    taken.set(slot, post);
  }
  return taken;
}

export type WindowState = 'dark' | 'offer' | 'ask' | 'mine' | 'full';

export function windowState(post: Post | undefined, me: string | null): WindowState {
  if (!post) return 'dark';
  if (post.left === 0) return 'full';
  if (me && (post.author === me || post.responses[me])) return 'mine';
  return post.kind === 'ask' ? 'ask' : 'offer';
}
