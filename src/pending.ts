// A post whose answer never came is remembered, so publishing the same thing again cannot make
// two of it. Anything else gets a new id: an old record must never swallow a new post.
import type { NewPost } from './store/types';
import { HOUR } from './time';

export interface Pending {
  id: string;
  sig: string;
  since: number;
}

/** What the person typed. A request's expiry moves with the clock, so only its day counts. */
export const signature = (post: NewPost): string =>
  JSON.stringify([post.kind, post.what, post.where, post.name, post.allergens, post.at ?? new Date(post.expiresAt).toDateString(), post.portions ?? null]);

export const reusable = (kept: Pending | null, post: NewPost, now: number): kept is Pending =>
  !!kept && kept.sig === signature(post) && now - kept.since < HOUR;
