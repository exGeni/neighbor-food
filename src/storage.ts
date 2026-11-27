// Browser storage that works in private mode too. Every key starts with "nf:" and carries the
// base path, because all project pages of one account share a single storage area.
const memory = new Map<string, string>();

const prefix = `nf:${import.meta.env?.BASE_URL ?? '/'}:`;

export function read(key: string): string | null {
  try {
    const value = window.localStorage.getItem(prefix + key);
    if (value !== null) return value;
  } catch {
    // Storage is blocked: fall back to memory.
  }
  return memory.get(prefix + key) ?? null;
}

export function write(key: string, value: string): void {
  memory.set(prefix + key, value);
  try {
    window.localStorage.setItem(prefix + key, value);
  } catch {
    // Kept in memory for this visit only.
  }
}

export function remove(key: string): void {
  memory.delete(prefix + key);
  try {
    window.localStorage.removeItem(prefix + key);
  } catch {
    // Nothing to remove.
  }
}

export function readJson<T>(key: string, fallback: T): T {
  const raw = read(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export const writeJson = (key: string, value: unknown): void => write(key, JSON.stringify(value));
