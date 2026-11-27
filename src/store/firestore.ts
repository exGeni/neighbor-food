// The real database. Loaded only on real entrance addresses, so the demo never asks Firebase
// anything. The rules in firestore.rules are what protects the data.
import { initializeApp, type FirebaseOptions } from 'firebase/app';
import {
  browserLocalPersistence,
  connectAuthEmulator,
  indexedDBLocalPersistence,
  initializeAuth,
  signInAnonymously,
  type Auth,
  type Persistence,
} from 'firebase/auth';
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  deleteField,
  doc,
  getDocFromServer,
  getDocsFromServer,
  initializeFirestore,
  limit,
  memoryLocalCache,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { StoreError, type ScreenErrorCode } from '../errors';
import { KEY_PATTERN, LIMITS } from '../limits';
import { systemClock, type Clock } from '../time';
import type { CancelOutcome, ClaimOutcome, Entrance, NewEntrance, NewPost, Post, PostsSnapshot, Reply, Store } from './types';

export interface Connection {
  config: FirebaseOptions;
  /** Local emulators instead of the real project. */
  emulator?: { host: string; authPort: number; firestorePort: number };
  persistence?: Persistence[];
  /** Tests open one app per person. */
  appName?: string;
  clock?: Clock;
  /** Keeps the database library quiet: its messages carry document paths. */
  quiet?: boolean;
}

/** Enough for a whole entrance pressing at the same moment. */
const RETRIES = 8;

const sdkCode = (error: unknown): string => String((error as { code?: unknown } | null)?.code ?? '');

function authProblem(code: string): ScreenErrorCode {
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') return 'NF-AUTH-OFF';
  if (code === 'auth/too-many-requests') return 'NF-AUTH-LIMIT';
  if (code === 'auth/network-request-failed') return 'NF-NET-UNCONFIRMED';
  if (code.includes('api-key') || code.includes('are-blocked') || code.includes('unauthorized')) return 'NF-KEY-BLOCKED';
  return 'NF-UNEXPECTED';
}

export class FirestoreStore implements Store {
  readonly mode = 'live' as const;

  constructor(
    private readonly auth: Auth,
    readonly db: Firestore,
    private readonly clock: Clock = systemClock,
    private readonly emulated = false,
  ) {}

  private problem(error: unknown, fallback: ScreenErrorCode = 'NF-UNEXPECTED'): StoreError {
    if (error instanceof StoreError) return error;
    const code = sdkCode(error);
    if (code === 'permission-denied') return new StoreError('NF-ENTRY-DENIED', code);
    if (code === 'resource-exhausted') return new StoreError('NF-QUOTA', code);
    if (code === 'unavailable' || code === 'deadline-exceeded') return new StoreError(this.emulated ? 'NF-EMU-DOWN' : 'NF-NET-UNCONFIRMED', code);
    return new StoreError(fallback, code);
  }

  me(): string | null {
    return this.auth.currentUser?.uid ?? null;
  }

  ready(): Promise<void> {
    return this.auth.authStateReady();
  }

  async signIn(): Promise<void> {
    await this.auth.authStateReady();
    if (this.auth.currentUser) return;
    try {
      await signInAnonymously(this.auth);
    } catch (error) {
      const code = sdkCode(error);
      const problem = authProblem(code);
      throw new StoreError(problem === 'NF-NET-UNCONFIRMED' && this.emulated ? 'NF-EMU-DOWN' : problem, code);
    }
  }

  private entrance(key: string): DocumentReference {
    return doc(this.db, 'entrances', key);
  }

  private post(key: string, id: string): DocumentReference {
    return doc(this.db, 'entrances', key, 'posts', id);
  }

  async getEntrance(key: string): Promise<Entrance | null> {
    if (!KEY_PATTERN.test(key)) return null;
    try {
      const snapshot = await getDocFromServer(this.entrance(key));
      if (!snapshot.exists()) return null;
      const data = snapshot.data();
      if (data.closed !== false) return null;
      return { key, name: String(data.name), floors: Number(data.floors), contact: String(data.contact), closed: false };
    } catch (error) {
      // A closed entrance may not be read at all.
      if (sdkCode(error) === 'permission-denied') return null;
      throw this.problem(error);
    }
  }

  async createEntrance({ key, name, floors, contact, code }: NewEntrance): Promise<void> {
    const batch = writeBatch(this.db);
    batch.set(this.entrance(key), { name, floors, contact, closed: false, createdAt: serverTimestamp() });
    batch.set(doc(this.db, 'entrances', key, 'private', 'create'), { code });
    try {
      await batch.commit();
    } catch (error) {
      if (sdkCode(error) === 'permission-denied') throw new StoreError('NF-NEW-REFUSED', 'permission-denied');
      throw this.problem(error, 'NF-NEW-UNCONFIRMED');
    }
  }

  watchPosts(key: string, onPosts: (snapshot: PostsSnapshot) => void, onError: (error: unknown) => void): () => void {
    const newest = query(collection(this.db, 'entrances', key, 'posts'), orderBy('createdAt', 'desc'), limit(LIMITS.readLimit));
    return onSnapshot(
      newest,
      { includeMetadataChanges: true },
      (snapshot) => {
        onPosts({
          posts: snapshot.docs.map((item) => toPost(item.id, item.data({ serverTimestamps: 'estimate' }), item.metadata.hasPendingWrites)),
          fromServer: !snapshot.metadata.fromCache,
        });
      },
      (error) => onError(this.problem(error, 'NF-LIVE-STOPPED')),
    );
  }

  private async read(key: string, id: string): Promise<Post | null> {
    const snapshot = await getDocFromServer(this.post(key, id));
    return snapshot.exists() ? toPost(id, snapshot.data({ serverTimestamps: 'estimate' }), false) : null;
  }

  async getPost(key: string, id: string): Promise<Post | null> {
    try {
      return await this.read(key, id);
    } catch (error) {
      throw this.problem(error);
    }
  }

  async expired(key: string, count: number): Promise<string[]> {
    try {
      const over = query(
        collection(this.db, 'entrances', key, 'posts'),
        where('expiresAt', '<=', Timestamp.fromMillis(this.clock())),
        orderBy('expiresAt'),
        limit(count),
      );
      return (await getDocsFromServer(over)).docs.map((item) => item.id);
    } catch (error) {
      throw this.problem(error);
    }
  }

  async createPost(key: string, post: NewPost): Promise<void> {
    const { id, at, expiresAt, portions, ...text } = post;
    try {
      await setDoc(this.post(key, id), {
        ...text,
        author: this.me(),
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(expiresAt),
        responses: {},
        ...(at === undefined ? {} : { at: Timestamp.fromMillis(at) }),
        ...(portions === undefined ? {} : { portions, left: portions }),
      });
    } catch (error) {
      throw this.problem(error);
    }
  }

  async deletePost(key: string, id: string): Promise<void> {
    try {
      await deleteDoc(this.post(key, id));
    } catch (error) {
      // Deleting what is already gone is refused by the rules; that is a success here.
      if (sdkCode(error) === 'permission-denied' && (await this.read(key, id).catch(() => undefined)) === null) return;
      throw this.problem(error);
    }
  }

  /**
   * Runs a reply transaction. When the database refuses or gives up, the post is read again to
   * say why. If nothing explains it, someone else was faster with another portion: the database
   * refuses the outdated count, so it is tried again after a growing random wait.
   */
  private async reply<T>(key: string, id: string, run: () => Promise<T>, explain: (post: Post | null) => T | undefined, lost: T): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await run();
      } catch (error) {
        const code = sdkCode(error);
        if (code === 'resource-exhausted') throw this.problem(error);
        if (code === 'unavailable' || code === 'deadline-exceeded') return lost;
        let post: Post | null;
        try {
          post = await this.read(key, id);
        } catch (readError) {
          if (sdkCode(readError) === 'permission-denied') throw this.problem(readError);
          return lost;
        }
        const outcome = explain(post);
        if (outcome !== undefined) return outcome;
        if (attempt >= RETRIES) throw this.problem(error);
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 300 * (attempt + 1)));
      }
    }
  }

  claim(key: string, id: string, reply: { name: string; note?: string }): Promise<ClaimOutcome> {
    const ref = this.post(key, id);
    const full = (post: Post) => post.left === 0 || Object.keys(post.responses).length >= LIMITS.responses;
    return this.reply<ClaimOutcome>(
      key,
      id,
      () =>
        runTransaction(this.db, async (transaction): Promise<ClaimOutcome> => {
          const me = this.me() as string;
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) return 'gone';
          const post = toPost(id, snapshot.data(), false);
          if (post.responses[me]) return 'already';
          if (full(post)) return 'full';
          transaction.update(ref, {
            [`responses.${me}`]: { name: reply.name, at: serverTimestamp(), ...(reply.note === undefined ? {} : { note: reply.note }) },
            ...(post.left === undefined ? {} : { left: post.left - 1 }),
          });
          return 'taken';
        }),
      (post) => {
        if (!post) return 'gone';
        // My reply is there: an earlier attempt got through.
        if (post.responses[this.me() as string]) return 'taken';
        if (post.expiresAt <= this.clock()) return 'expired';
        return full(post) ? 'full' : undefined;
      },
      'unknown',
    );
  }

  cancel(key: string, id: string): Promise<CancelOutcome> {
    const ref = this.post(key, id);
    return this.reply<CancelOutcome>(
      key,
      id,
      () =>
        runTransaction(this.db, async (transaction): Promise<CancelOutcome> => {
          const me = this.me() as string;
          const snapshot = await transaction.get(ref);
          if (!snapshot.exists()) return 'gone';
          const post = toPost(id, snapshot.data(), false);
          if (!post.responses[me]) return 'cancelled';
          transaction.update(ref, {
            [`responses.${me}`]: deleteField(),
            ...(post.left === undefined ? {} : { left: post.left + 1 }),
          });
          return 'cancelled';
        }),
      (post) => {
        if (!post) return 'gone';
        if (!post.responses[this.me() as string]) return 'cancelled';
        return post.expiresAt <= this.clock() ? 'expired' : undefined;
      },
      'unknown',
    );
  }
}

const millis = (value: unknown): number => (value instanceof Timestamp ? value.toMillis() : 0);
const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** Anyone with the link can write, so every field is read defensively. */
export function toPost(id: string, data: DocumentData, pending: boolean): Post {
  const responses: Record<string, Reply> = {};
  for (const [uid, value] of Object.entries((data.responses ?? {}) as Record<string, DocumentData>)) {
    responses[uid] = { name: text(value?.name), at: millis(value?.at), ...(typeof value?.note === 'string' ? { note: value.note } : {}) };
  }
  return {
    id,
    kind: data.kind === 'ask' ? 'ask' : 'offer',
    what: text(data.what),
    where: text(data.where),
    name: text(data.name),
    allergens: text(data.allergens),
    author: text(data.author),
    createdAt: millis(data.createdAt),
    expiresAt: millis(data.expiresAt),
    ...(data.at === undefined ? {} : { at: millis(data.at) }),
    ...(typeof data.portions === 'number' ? { portions: data.portions } : {}),
    ...(typeof data.left === 'number' ? { left: data.left } : {}),
    responses,
    ...(pending ? { pending: true } : {}),
  };
}

export function connect(connection: Connection): FirestoreStore {
  const app = initializeApp(connection.config, connection.appName);
  if (connection.quiet) setLogLevel('silent');
  // No popup or redirect resolver: only anonymous sign-in, so no helper frame is ever loaded.
  const auth = initializeAuth(app, { persistence: connection.persistence ?? [indexedDBLocalPersistence, browserLocalPersistence] });
  const db = initializeFirestore(app, { localCache: memoryLocalCache() });
  const { emulator } = connection;
  if (emulator) {
    connectAuthEmulator(auth, `http://${emulator.host}:${emulator.authPort}`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulator.host, emulator.firestorePort);
  }
  return new FirestoreStore(auth, db, connection.clock, !!emulator);
}
