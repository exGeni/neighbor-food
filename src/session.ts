// What this phone remembers. Demo entries live in memory only, so the demo saves nothing.
import type { Claims } from './model';
import { read, readJson, write, writeJson } from './storage';

export interface Session {
  entered(): boolean;
  enter(): void;
  name(): string;
  setName(name: string): void;
  hidden(): Set<string>;
  setHidden(ids: Set<string>): void;
  seen(): Record<string, number>;
  setSeen(counts: Record<string, number>): void;
  claims(): Claims;
  setClaims(claims: Claims): void;
}

export function session(key: string, demo: boolean): Session {
  const memory = new Map<string, unknown>();
  const get = <T>(item: string, fallback: T): T => (demo ? ((memory.get(item) as T | undefined) ?? fallback) : readJson(`${item}:${key}`, fallback));
  const set = (item: string, value: unknown): void => {
    if (demo) memory.set(item, value);
    else writeJson(`${item}:${key}`, value);
  };
  return {
    entered: () => get('entered', false),
    enter: () => set('entered', true),
    // The name is the same in every entrance of this phone.
    name: () => (demo ? get('name', '') : (read('name') ?? '')),
    setName: (name) => (demo ? set('name', name) : write('name', name)),
    hidden: () => new Set(get<string[]>('hidden', [])),
    setHidden: (ids) => set('hidden', [...ids]),
    seen: () => get('seen', {}),
    setSeen: (counts) => set('seen', counts),
    claims: () => get('claims', {}),
    setClaims: (claims) => set('claims', claims),
  };
}
