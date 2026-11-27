// In-memory store: the public demo and the tests. It mirrors the database rules, including the
// pending and "not from the server yet" states, so one contract suite covers both stores.
import { StoreError } from '../errors';
import { KEY_PATTERN, LIMITS, length } from '../limits';
import { systemClock, type Clock } from '../time';
import { checkPost, checkText } from '../validate';
import type { CancelOutcome, ClaimOutcome, Entrance, NewEntrance, NewPost, Post, PostsSnapshot, Store } from './types';

export interface MemoryData {
  ownerCode: string;
  entrances: Map<string, Entrance>;
  posts: Map<string, Map<string, Post>>;
  listeners: Set<() => void>;
}

export const memoryData = (ownerCode = 'demo-organiser-code-0000'): MemoryData => ({
  ownerCode,
  entrances: new Map(),
  posts: new Map(),
  listeners: new Set(),
});

/** The "network" of a memory store: while paused, nothing reaches the server. */
export interface Gate {
  wait(): Promise<void>;
  paused(): boolean;
  pause(): void;
  resume(): void;
}

export function gate(): Gate {
  let paused = false;
  const waiting: (() => void)[] = [];
  return {
    wait: () => (paused ? new Promise<void>((resolve) => waiting.push(resolve)) : Promise.resolve()),
    paused: () => paused,
    pause: () => {
      paused = true;
    },
    resume: () => {
      paused = false;
      for (const resolve of waiting.splice(0)) resolve();
    },
  };
}

const copy = (post: Post): Post => ({
  ...post,
  responses: Object.fromEntries(Object.entries(post.responses).map(([id, reply]) => [id, { ...reply }])),
});

const refused = (code: 'NF-ENTRY-DENIED' | 'NF-NEW-REFUSED' = 'NF-ENTRY-DENIED') => new StoreError(code, 'permission-denied');

export class MemoryStore implements Store {
  private uid: string | null = null;
  /** Own writes the server has not confirmed: only this user sees their effect. */
  private readonly pendingCreates = new Map<string, Post>();
  private readonly pendingDeletes = new Set<string>();

  constructor(
    private readonly data: MemoryData,
    private readonly userId: string,
    private readonly clock: Clock = systemClock,
    readonly mode: 'demo' | 'live' = 'demo',
    private readonly net: Gate = gate(),
  ) {}

  me(): string | null {
    return this.uid;
  }

  async ready(): Promise<void> {}

  async signIn(): Promise<void> {
    await this.net.wait();
    this.uid = this.userId;
  }

  async getEntrance(key: string): Promise<Entrance | null> {
    await this.net.wait();
    const entrance = this.data.entrances.get(key);
    return entrance && !entrance.closed ? { ...entrance } : null;
  }

  async createEntrance({ key, name, floors, contact, code }: NewEntrance): Promise<void> {
    await this.net.wait();
    const no = () => refused('NF-NEW-REFUSED');
    if (!this.uid || !KEY_PATTERN.test(key) || this.data.entrances.has(key)) throw no();
    if (length(this.data.ownerCode) < LIMITS.ownerCodeMin || code !== this.data.ownerCode) throw no();
    if (checkText(name, LIMITS.entranceName, true) || checkText(contact, LIMITS.contact, true)) throw no();
    if (!Number.isInteger(floors) || floors < LIMITS.floorsMin || floors > LIMITS.floorsMax) throw no();
    this.data.entrances.set(key, { key, name, floors, contact, closed: false });
  }

  private open(key: string): Map<string, Post> {
    const entrance = this.data.entrances.get(key);
    if (!this.uid || !entrance || entrance.closed) throw refused();
    let posts = this.data.posts.get(key);
    if (!posts) this.data.posts.set(key, (posts = new Map()));
    return posts;
  }

  private changed(): void {
    for (const listener of [...this.data.listeners]) listener();
  }

  watchPosts(key: string, onPosts: (snapshot: PostsSnapshot) => void, onError: (error: unknown) => void): () => void {
    let stopped = false;
    let fromServer = false;
    const emit = () => {
      if (stopped) return;
      let server: Post[];
      try {
        server = fromServer ? [...this.open(key).values()] : [];
      } catch (error) {
        stop();
        onError(error);
        return;
      }
      const posts = [
        ...server.filter((post) => !this.pendingDeletes.has(`${key}/${post.id}`)),
        ...[...this.pendingCreates].filter(([path]) => path.startsWith(`${key}/`)).map(([, post]) => post),
      ];
      posts.sort((a, b) => b.createdAt - a.createdAt);
      onPosts({ posts: posts.slice(0, LIMITS.readLimit).map(copy), fromServer });
    };
    const stop = () => {
      stopped = true;
      this.data.listeners.delete(emit);
    };
    this.data.listeners.add(emit);
    queueMicrotask(() => {
      // A paused network first answers from the phone alone, as the real database does.
      if (this.net.paused()) emit();
      void this.net.wait().then(() => {
        fromServer = true;
        emit();
      });
    });
    return stop;
  }

  async getPost(key: string, id: string): Promise<Post | null> {
    await this.net.wait();
    const post = this.open(key).get(id);
    return post ? copy(post) : null;
  }

  private build(input: NewPost, now: number): Post {
    const { at, portions, ...rest } = input;
    return {
      ...rest,
      ...(at === undefined ? {} : { at }),
      ...(portions === undefined ? {} : { portions, left: portions }),
      author: this.uid as string,
      createdAt: now,
      responses: {},
    };
  }

  async createPost(key: string, input: NewPost): Promise<void> {
    const path = `${key}/${input.id}`;
    const post = this.build(input, this.clock());
    this.pendingCreates.set(path, { ...post, pending: true });
    this.changed();
    try {
      await this.net.wait();
      const posts = this.open(key);
      if (posts.has(input.id) || Object.keys(checkPost(input, this.clock())).length > 0) throw refused();
      posts.set(input.id, post);
    } finally {
      this.pendingCreates.delete(path);
      this.changed();
    }
  }

  async deletePost(key: string, id: string): Promise<void> {
    const path = `${key}/${id}`;
    this.pendingDeletes.add(path);
    this.changed();
    try {
      await this.net.wait();
      const posts = this.open(key);
      const post = posts.get(id);
      if (!post) return;
      if (post.author !== this.uid && post.expiresAt > this.clock()) throw refused();
      posts.delete(id);
    } finally {
      this.pendingDeletes.delete(path);
      this.changed();
    }
  }

  async claim(key: string, id: string, reply: { name: string; note?: string }): Promise<ClaimOutcome> {
    await this.net.wait();
    const post = this.open(key).get(id);
    if (!post) return 'gone';
    const me = this.uid as string;
    if (post.responses[me]) return 'already';
    if (post.expiresAt <= this.clock()) return 'expired';
    if (post.left === 0 || Object.keys(post.responses).length >= LIMITS.responses) return 'full';
    const note = reply.note ?? '';
    const badNote = post.kind === 'ask' ? checkText(note, LIMITS.note, true) : note !== '';
    if (post.author === me || badNote || checkText(reply.name, LIMITS.name)) throw refused();
    post.responses[me] = { name: reply.name, at: this.clock(), ...(post.kind === 'ask' ? { note } : {}) };
    if (post.left !== undefined) post.left -= 1;
    this.changed();
    return 'taken';
  }

  async cancel(key: string, id: string): Promise<CancelOutcome> {
    await this.net.wait();
    const post = this.open(key).get(id);
    if (!post) return 'gone';
    const me = this.uid as string;
    if (!post.responses[me]) return 'cancelled';
    if (post.expiresAt <= this.clock()) return 'expired';
    delete post.responses[me];
    if (post.left !== undefined) post.left += 1;
    this.changed();
    return 'cancelled';
  }
}
