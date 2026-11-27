// Chooses the database of this copy. Without one, only the demonstration works.
import type { Store } from './types';

export const EMULATOR = { host: '127.0.0.1', authPort: 9099, firestorePort: 8080 };
export const EMULATOR_CONFIG = { apiKey: 'demo-key', projectId: 'demo-nf', appId: 'demo-app' };

let store: Promise<Store> | null = null;

export async function liveStore(): Promise<Store | null> {
  const emulated = import.meta.env.VITE_FIREBASE_EMULATOR === '1';
  // Checked by the build (config/firebase-config.ts).
  const raw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (!emulated && !raw?.trim()) return null;
  store ??= import('./firestore').then(({ connect }) =>
    connect(
      emulated
        ? { config: EMULATOR_CONFIG, emulator: EMULATOR }
        : { config: JSON.parse(raw as string), quiet: import.meta.env.PROD },
    ),
  );
  // A failed load (no network) may be tried again.
  store.catch(() => (store = null));
  return store;
}
