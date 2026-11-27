// What the house screen shows, worked out from the posts alone.
import { dateText, clockText, daysBetween } from './time';
import { fill, plural, t, type Lang } from './i18n';
import { LIMITS } from './limits';
import type { Post } from './store/types';

export interface Groups {
  yours: Post[];
  offers: Post[];
  asks: Post[];
  hidden: Post[];
}

export const isMine = (post: Post, me: string | null): boolean => !!me && (post.author === me || !!post.responses[me]);

export function group(posts: Post[], me: string | null, hidden: ReadonlySet<string>, now: number): Groups {
  const groups: Groups = { yours: [], offers: [], asks: [], hidden: [] };
  const soonest = (a: Post, b: Post) => (a.at ?? a.expiresAt) - (b.at ?? b.expiresAt) || a.createdAt - b.createdAt;
  for (const post of [...posts].sort(soonest)) {
    if (post.expiresAt <= now) continue;
    if (isMine(post, me)) groups.yours.push(post);
    else if (hidden.has(post.id)) groups.hidden.push(post);
    else groups[post.kind === 'ask' ? 'asks' : 'offers'].push(post);
  }
  return groups;
}

export function timeLabel(post: Post, now: number, lang: Lang): string {
  if (post.kind === 'ask') return t(daysBetween(now, post.expiresAt) <= 0 ? 'today' : 'thisWeek', {}, lang);
  const at = post.at ?? post.expiresAt;
  const time = clockText(at, lang);
  if (at <= now) return t('startedAt', { time }, lang);
  const days = daysBetween(now, at);
  const day = days === 0 ? t('today', {}, lang) : days === 1 ? t('tomorrow', {}, lang) : dateText(at, lang);
  return t('at', { day, time }, lang);
}

export const replyCount = (post: Post): number => Object.keys(post.responses).length;

/** The second line of a row: time, then how much is left. */
export function summary(post: Post, now: number, lang: Lang): string {
  const parts = [timeLabel(post, now, lang)];
  const count = replyCount(post);
  if (post.kind === 'ask') {
    if (count > 0) parts.push(plural('repliesCount', count, lang));
  } else if (post.left === undefined) {
    parts.push(t('noCount', {}, lang));
    if (count > 0) parts.push(plural('coming', count, lang));
  } else {
    parts.push(post.left === 0 ? t('allTaken', {}, lang) : plural('portionsLeft', post.left, lang));
  }
  return parts.join(' · ');
}

/** Why a neighbour cannot answer a post, or null when they can. */
export function closedReason(post: Post): 'allTaken' | 'full' | null {
  if (post.left === 0) return 'allTaken';
  return replyCount(post) >= LIMITS.responses ? 'full' : null;
}

/** Replies oldest first, with "neighbour 1, 2" for those who gave no name. */
export function replies(post: Post, lang: Lang): { name: string; note: string }[] {
  let unnamed = 0;
  return Object.entries(post.responses)
    .sort(([a, x], [b, y]) => x.at - y.at || (a < b ? -1 : 1))
    .map(([, reply]) => ({
      name: reply.name || t('neighbourN', { n: ++unnamed }, lang),
      note: reply.note ?? '',
    }));
}

export function shareText(post: Post, now: number, lang: Lang): string {
  return fill(t('shareText', {}, lang), {
    name: post.name || t('aNeighbour', {}, lang),
    what: post.what,
    when: timeLabel(post, now, lang),
    where: post.where ? `, ${post.where}` : '',
  });
}

export interface Claim {
  what: string;
  expiresAt: number;
}

export type Claims = Record<string, Claim>;

export interface ClaimNews {
  claims: Claims;
  /** Answered posts that disappeared since last time. */
  lost: { what: string; reason: 'removed' | 'ended' }[];
}

/** Call with server data only: from the phone's own data nothing can be called "removed". */
export function followClaims(before: Claims, posts: Post[], me: string, now: number): ClaimNews {
  const claims: Claims = {};
  for (const post of posts) {
    if (post.expiresAt > now && post.responses[me]) claims[post.id] = { what: post.what, expiresAt: post.expiresAt };
  }
  const lost: ClaimNews['lost'] = [];
  for (const [id, claim] of Object.entries(before)) {
    if (claims[id]) continue;
    const post = posts.find((p) => p.id === id);
    if (claim.expiresAt <= now) lost.push({ what: claim.what, reason: 'ended' });
    else if (!post) lost.push({ what: claim.what, reason: 'removed' });
    // Still there without my reply: I cancelled it myself.
  }
  return { claims, lost };
}
