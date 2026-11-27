// Hash routes: GitHub Pages serves one file, and the entrance key never reaches a server log.
import { ID_PATTERN } from './limits';

export type Route =
  | { name: 'demo' }
  | { name: 'entrance'; key: string; post?: string }
  | { name: 'new' }
  | { name: 'poster'; key: string | null }
  | { name: 'about'; key: string | null };

export function parseRoute(hash: string): Route {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?', 2);
  const parts = path.split('/').filter(Boolean);
  const [first, second, third] = parts;
  if (first === 'new') return { name: 'new' };
  if (first === 'about') return { name: 'about', key: null };
  if (first === 'demo') return second === 'poster' ? { name: 'poster', key: null } : { name: 'demo' };
  if (first === 'e' && second) {
    if (third === 'poster') return { name: 'poster', key: second };
    if (third === 'about') return { name: 'about', key: second };
    const post = new URLSearchParams(query).get('p');
    return { name: 'entrance', key: second, ...(post && ID_PATTERN.test(post) ? { post } : {}) };
  }
  return { name: 'demo' };
}

/** Links are built from origin and base path only: no query a visitor arrived with is passed on. */
export const siteUrl = (origin: string = location.origin, base: string = import.meta.env.BASE_URL): string => `${origin}${base}`;

export const demoUrl = (site = siteUrl()): string => `${site}#/demo`;
export const entranceUrl = (key: string, site = siteUrl()): string => `${site}#/e/${key}`;
export const postUrl = (key: string, post: string, site = siteUrl()): string => `${entranceUrl(key, site)}?p=${post}`;
