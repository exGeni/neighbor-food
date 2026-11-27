export type Kind = 'offer' | 'ask';

export interface Entrance {
  key: string;
  name: string;
  floors: number;
  contact: string;
  closed: boolean;
}

export interface Reply {
  name: string;
  at: number;
  note?: string;
}

export interface Post {
  id: string;
  kind: Kind;
  what: string;
  where: string;
  name: string;
  allergens: string;
  author: string;
  createdAt: number;
  expiresAt: number;
  /** Offers only: when the food is ready. */
  at?: number;
  portions?: number;
  left?: number;
  responses: Record<string, Reply>;
  /** Written on this phone and not yet confirmed by the server. */
  pending?: boolean;
}

export interface NewPost {
  id: string;
  kind: Kind;
  what: string;
  where: string;
  name: string;
  allergens: string;
  expiresAt: number;
  at?: number;
  portions?: number;
}

export interface PostsSnapshot {
  posts: Post[];
  /** False while the list comes from this phone only: then "empty" or "removed" mean nothing. */
  fromServer: boolean;
}

export type ClaimOutcome = 'taken' | 'already' | 'full' | 'gone' | 'expired' | 'unknown';
export type CancelOutcome = 'cancelled' | 'gone' | 'expired' | 'unknown';

export interface NewEntrance {
  key: string;
  name: string;
  floors: number;
  contact: string;
  /** Typed once, sent with the create, never kept on the phone. */
  code: string;
}

/** The only way views reach data. Two implementations: memory (demo) and Firestore. */
export interface Store {
  readonly mode: 'demo' | 'live';
  me(): string | null;
  /** Resolves once a previous sign-in has been restored (or there was none). */
  ready(): Promise<void>;
  signIn(): Promise<void>;
  /** null: wrong or closed link. Throws StoreError when it cannot be known. */
  getEntrance(key: string): Promise<Entrance | null>;
  createEntrance(entrance: NewEntrance): Promise<void>;
  watchPosts(key: string, onPosts: (snapshot: PostsSnapshot) => void, onError: (error: unknown) => void): () => void;
  getPost(key: string, id: string): Promise<Post | null>;
  /** Ids of posts that are over, oldest first, whatever their place in the list. */
  expired(key: string, count: number): Promise<string[]>;
  createPost(key: string, post: NewPost): Promise<void>;
  deletePost(key: string, id: string): Promise<void>;
  claim(key: string, id: string, reply: { name: string; note?: string }): Promise<ClaimOutcome>;
  cancel(key: string, id: string): Promise<CancelOutcome>;
}
