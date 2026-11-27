// The house and its list. One instance per visit of an entrance.
import { logProblem, StoreError, type ScreenErrorCode } from '../errors';
import { downloadCalendar } from '../ics';
import { dict, lang, plural, t } from '../i18n';
import { closedReason, followClaims, group, replies, replyCount, shareText, summary, timeLabel } from '../model';
import { demoUrl, postUrl } from '../router';
import type { Session } from '../session';
import type { Entrance, NewPost, Post, Store } from '../store/types';
import { clockText, type Clock } from '../time';
import { button, h, link, reducedMotion, type Child } from '../ui/dom';
import { createHouse } from '../ui/house';
import { leaveSheet, openSheet } from '../ui/sheet';
import { errorBox, foodLine, langSwitch, retryButton } from './common';
import { CONFIRM_WAIT, postForm } from './form';
import { contactSheet, deleteSheet, makeOwnSheet, sendSheet, takeSheet } from './sheets';

const STALLED_AFTER = 8_000;
const CLEAN_AT_ONCE = 5;
/** Entrances whose expired posts this visit has already tried to delete. */
const cleaned = new Set<string>();

export interface HomeOptions {
  root: HTMLElement;
  store: Store;
  entrance: Entrance;
  session: Session;
  clock: Clock;
  demo: boolean;
  /** From a shared link: the offer to open. */
  openPost?: string;
  /** Redraws the whole screen after a language change. */
  changeLanguage(): void;
}

interface Busy {
  action: 'claim' | 'cancel' | 'delete';
  since: number;
}

export function homeView(options: HomeOptions): () => void {
  const { root, store, entrance, session, clock, demo } = options;
  const key = entrance.key;
  const me = store.me();

  let posts: Post[] = [];
  let fromServer = false;
  let stalled = false;
  let failure: ScreenErrorCode | null = null;
  let stopWatch: () => void = () => undefined;
  let stalledTimer: ReturnType<typeof setTimeout> | undefined;
  let linked = options.openPost;
  let stripShown = demo;
  const open = new Set<string>();
  const busy = new Map<string, Busy>();
  const drawnRows = new Set<string>();
  /** Deletes in flight: the database already hides the post here, the row stays until it answers. */
  const deleting = new Map<string, Post>();
  /** When each unconfirmed post was first seen. */
  const unconfirmed = new Map<string, number>();
  const baseline = session.seen();
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const later = (ms: number, act: () => void) => {
    const timer = setTimeout(() => {
      timers.delete(timer);
      act();
    }, ms);
    timers.add(timer);
    return timer;
  };

  const house = createHouse({
    floors: entrance.floors,
    lightFirst: demo,
    label: (list) =>
      t('houseLabel', {
        offers: plural('offerCount', list.filter((post) => post.kind === 'offer').length),
        asks: plural('askCount', list.filter((post) => post.kind === 'ask').length),
      }),
    windowLabel: (post) => `${post.what}, ${timeLabel(post, clock(), lang())}`,
    onSelect: (id) => openRow(id),
  });

  const houseBox = h('div', { class: 'house-box house-loading' }, house.element);
  const banners = h('div', { class: 'stack' });
  const list = h('div', { class: 'list' });
  const toasts = h('div', { class: 'toasts', role: 'status', 'aria-live': 'polite' });
  const main = button(t('mainButton'), () => newPost(), { class: 'button button-primary button-big' });

  const menu = () =>
    openSheet(t('menu'), (close) => {
      const base = demo ? '#/demo' : `#/e/${key}`;
      const go = (label: string, href: string) =>
        link(label, href, {
          class: 'button',
          onclick: (event: Event) => {
            event.preventDefault();
            leaveSheet(href);
          },
        });
      return [
        go(t('poster'), `${base}/poster`),
        go(t('dataLink'), demo ? '#/about' : `${base}/about`),
        button(t('makeOwn'), () => makeOwnSheet()),
        demo ? null : button(t('contact'), () => contactSheet(entrance.contact)),
        langSwitch(() => {
          close();
          options.changeLanguage();
        }),
      ];
    });

  root.replaceChildren(
    h(
      'main',
      { class: 'home' },
      h('header', { class: 'top' }, h('h1', null, entrance.name), button(t('menu'), menu, { class: 'button button-small', 'data-key': 'menu' })),
      h(
        'div',
        { class: 'columns' },
        h('div', { class: 'side' }, houseBox, banners),
        list,
      ),
      h('div', { class: 'action-bar' }, main),
    ),
    toasts,
  );

  function toast(message: string, ms = 6000): void {
    const note = h('p', { class: 'toast' }, message);
    toasts.append(note);
    later(ms, () => note.remove());
  }

  function openRow(id: string): void {
    open.add(id);
    render();
    const head = list.querySelector<HTMLElement>(`[data-key="head:${CSS.escape(id)}"]`);
    head?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    head?.focus({ preventScroll: true });
  }

  function newPost(): void {
    postForm({
      store,
      entranceKey: key,
      clock,
      name: session.name(),
      published(post: NewPost, name: string) {
        session.setName(name);
        // After the sheet has given focus back, so the page does not jump away from the house.
        later(0, () => window.scrollTo({ top: 0 }));
        if (post.kind !== 'offer') return;
        const url = demo ? demoUrl() : postUrl(key, post.id);
        const shown: Post = { ...post, author: me ?? '', createdAt: clock(), responses: {} };
        // The window lights first; then the sheet comes up.
        later(reducedMotion() ? 0 : 1100, () => sendSheet(shareText(shown, clock(), lang()), url));
      },
    });
  }

  /** Runs an action on one post, marking its row until the database answers. */
  async function act(post: Post, action: Busy['action'], run: () => Promise<string>): Promise<void> {
    busy.set(post.id, { action, since: Date.now() });
    render();
    later(CONFIRM_WAIT, render);
    try {
      const message = await run();
      if (message) toast(message);
    } catch (error) {
      logProblem(action, error);
      const code = error instanceof StoreError ? error.code : 'NF-UNEXPECTED';
      const { text, next } = dict().errors[code];
      toast(`${text} ${code === 'NF-ENTRY-DENIED' ? t('checkClock') : next} (${code})`, 12_000);
    } finally {
      busy.delete(post.id);
      render();
    }
  }

  const claim = (post: Post) =>
    takeSheet(post, session.name(), (reply) => {
      session.setName(reply.name);
      void act(post, 'claim', async () => {
        const outcome = await store.claim(key, post.id, reply);
        return { taken: post.kind === 'ask' ? t('youReplied') : t('taken'), already: t('already'), full: t('justTaken'), gone: t('gone'), expired: t('expired'), unknown: t('unknown') }[outcome];
      });
    });

  const cancel = (post: Post) =>
    void act(post, 'cancel', async () => {
      const outcome = await store.cancel(key, post.id);
      return { cancelled: t('cancelled'), gone: t('gone'), expired: t('expired'), unknown: t('unknown') }[outcome];
    });

  const remove = (post: Post) =>
    deleteSheet(post, () => {
      deleting.set(post.id, post);
      void act(post, 'delete', async () => {
        try {
          await store.deletePost(key, post.id);
        } finally {
          deleting.delete(post.id);
        }
        return '';
      });
    });

  const calendar = (post: Post, parent: HTMLElement) => {
    const at = post.at ?? post.expiresAt;
    downloadCalendar({ uid: post.id, start: at, stamp: clock(), title: post.what, where: post.where });
    if (!parent.querySelector('.calendar-note')) {
      parent.append(h('p', { class: 'note calendar-note' }, t('calendarFallback', { time: timeLabel(post, clock(), lang()) })));
    }
  };

  const offline = (): boolean => !demo && navigator.onLine === false;

  function rowBody(post: Post): HTMLElement {
    const body = h('div', { class: 'row-body' });
    const own = post.author === me;
    const reply = me ? post.responses[me] : undefined;
    const waiting = busy.get(post.id);
    const slow = !!waiting && Date.now() - waiting.since >= CONFIRM_WAIT;
    const off = offline() || !!waiting || !!post.pending;
    const control = (label: string, run: () => void, id: string, primary = false, needsNetwork = true) =>
      button(label, run, {
        class: `button${primary ? ' button-primary' : ''}`,
        disabled: needsNetwork && off,
        'data-key': `${id}:${post.id}`,
      });
    const calendarButton = () => control(t('calendar'), () => calendar(post, body), 'calendar', false, false);
    const lines: Child[] = [];

    if (reply) {
      lines.push(
        h('p', { class: 'big' }, post.kind === 'ask' ? t('youReplied') : t('yourPortion')),
        h('p', { class: 'big' }, post.kind === 'ask' ? (reply.note ?? '') : `${timeLabel(post, clock(), lang())}${post.where ? `, ${post.where}` : ''}`),
      );
    }
    if (post.where && !(reply && post.kind === 'offer')) lines.push(h('p', null, t('where', { where: post.where })));
    if (post.allergens) lines.push(h('p', null, t('allergensLine', { allergens: post.allergens })));
    if (post.name && !own) lines.push(h('p', null, t('from', { name: post.name })));
    if (own && replyCount(post) > 0) {
      lines.push(
        h('p', { class: 'section-title' }, post.kind === 'ask' ? t('replies') : t('takers')),
        h('ul', { class: 'replies' }, ...replies(post, lang()).map((r) => h('li', null, r.note ? `${r.name}: ${r.note}` : r.name))),
      );
    }
    if (post.kind === 'offer' && !own) lines.push(foodLine());

    if (waiting && waiting.action !== 'delete') {
      lines.push(h('p', { class: 'banner', role: 'status' }, slow ? t('checkingLong') : t('checking'), slow ? button(t('reload'), () => location.reload(), { class: 'button button-small' }) : null));
    } else if (waiting) {
      lines.push(h('p', { class: 'banner', role: 'status' }, slow ? t('notConfirmed') : t('checking')));
    } else if (post.pending) {
      lines.push(h('p', { class: 'banner', role: 'status' }, stuck(post) ? t('notConfirmed') : t('checking')));
    }

    const actions = h('div', { class: 'actions' });
    if (own) {
      if (post.kind === 'offer') {
        actions.append(
          control(t('send'), () => sendSheet(shareText(post, clock(), lang()), demo ? demoUrl() : postUrl(key, post.id)), 'send', true, false),
          calendarButton(),
        );
      }
      actions.append(control(t('delete'), () => remove(post), 'delete'));
    } else if (reply) {
      if (post.kind === 'offer') actions.append(calendarButton());
      actions.append(control(t('cancel'), () => cancel(post), 'cancel'));
    } else {
      const reason = closedReason(post);
      if (reason) {
        actions.append(h('p', { class: 'note' }, t(reason)));
      } else {
        const label = post.kind === 'ask' ? t('iCan') : post.portions === undefined ? t('imComing') : t('take');
        actions.append(control(label, () => claim(post), 'take', true));
      }
      actions.append(
        button(
          t('hide'),
          () => {
            session.setHidden(session.hidden().add(post.id));
            open.delete(post.id);
            render();
          },
          { class: 'button button-link', 'data-key': `hide:${post.id}` },
        ),
        button(t('contact'), () => contactSheet(entrance.contact), { class: 'button button-link', 'data-key': `contact:${post.id}` }),
      );
    }
    body.append(...lines.filter((line): line is Node => line instanceof Node), actions);
    return body;
  }

  function stuck(post: Post): boolean {
    if (!post.pending) return false;
    let since = unconfirmed.get(post.id);
    if (since === undefined) {
      unconfirmed.set(post.id, (since = Date.now()));
      later(CONFIRM_WAIT, render);
    }
    return Date.now() - since >= CONFIRM_WAIT;
  }

  function row(post: Post): HTMLLIElement {
    const expanded = open.has(post.id);
    const fresh = drawnRows.size > 0 && !drawnRows.has(post.id);
    const own = post.author === me;
    const unseen = own ? replyCount(post) - (baseline[post.id] ?? 0) : 0;
    const waiting = busy.has(post.id) || !!post.pending;
    const mineAt = me && post.responses[me] && post.kind === 'offer' ? clockText(post.at ?? post.expiresAt, lang()) : '';
    const tag = stuck(post) ? t('notConfirmed') : waiting ? t('checking') : unseen > 0 ? plural('newTakers', unseen) : mineAt ? `${t('yourPortion')} · ${mineAt}` : '';
    return h(
      'li',
      { class: `row${fresh ? ' fresh' : ''}`, 'data-kind': post.kind, 'data-full': post.left === 0, 'data-id': post.id },
      h(
        'button',
        {
          type: 'button',
          class: 'row-head',
          'aria-expanded': String(expanded),
          'data-key': `head:${post.id}`,
          onclick: () => {
            if (expanded) open.delete(post.id);
            else open.add(post.id);
            render();
          },
        },
        h('span', { class: 'badge', 'aria-hidden': 'true' }),
        h(
          'span',
          { class: 'row-text' },
          h('span', { class: 'row-title' }, post.what),
          h('span', { class: 'row-meta' }, `${post.kind === 'ask' && (own || (me && post.responses[me])) ? `${t('kindAsk')} · ` : ''}${summary(post, clock(), lang())}`),
        ),
        tag ? h('span', { class: 'row-tag' }, tag) : null,
      ),
      expanded ? rowBody(post) : null,
    );
  }

  const section = (title: string, items: Post[]): Child[] =>
    items.length ? [h('h2', { class: 'section-title' }, title), h('ul', { class: 'rows' }, ...items.map(row))] : [];

  function renderBanners(): void {
    const shown: Child[] = [];
    if (stripShown) {
      shown.push(
        h(
          'div',
          { class: 'strip' },
          h(
            'p',
            null,
            `${t('demoStrip')} `,
            link(t('makeOwn'), '#', {
              'data-key': 'make-own',
              onclick: (event: Event) => {
                event.preventDefault();
                makeOwnSheet();
              },
            }),
          ),
          button(
            t('gotIt'),
            () => {
              stripShown = false;
              render();
            },
            { class: 'button button-small', 'data-key': 'got-it' },
          ),
        ),
      );
    }
    if (offline()) shown.push(h('p', { class: 'banner banner-warn', role: 'status' }, t('offline')));
    if (failure) shown.push(errorBox(failure, retryButton(watch)));
    else if (stalled && !fromServer) shown.push(h('div', { class: 'banner', role: 'status' }, h('p', null, t('stalled')), retryButton(watch)));
    banners.replaceChildren(...shown.filter((node): node is Node => node instanceof Node));
  }

  function render(): void {
    const focused = document.activeElement instanceof HTMLElement ? document.activeElement.dataset.key : undefined;
    const now = clock();
    const shown = [...posts, ...[...deleting.values()].filter((gone) => !posts.some((post) => post.id === gone.id))];
    const groups = group(shown, me, session.hidden(), now);
    const total = groups.yours.length + groups.offers.length + groups.asks.length;
    const content: Child[] = [
      ...section(t('yours'), groups.yours),
      ...section(t('offers'), groups.offers),
      ...section(t('asks'), groups.asks),
    ];
    if (total === 0) {
      if (fromServer) content.push(h('p', { class: 'empty' }, t('empty')));
      else if (!failure) content.push(h('p', { class: 'empty', role: 'status' }, t('loading')));
    }
    if (groups.hidden.length) {
      content.push(
        button(
          t('showHidden', { n: groups.hidden.length }),
          () => {
            session.setHidden(new Set());
            render();
          },
          { class: 'button button-link', 'data-key': 'show-hidden' },
        ),
      );
    }
    list.replaceChildren(...content.filter((node): node is Node => node instanceof Node));
    for (const post of posts) drawnRows.add(post.id);
    renderBanners();
    houseBox.classList.toggle('house-loading', !fromServer);
    if (fromServer) house.update(posts, me, now);
    main.disabled = offline() || failure !== null;
    if (focused) root.querySelector<HTMLElement>(`[data-key="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }

  /** What can only be judged on the server's answer. */
  function onServer(): void {
    if (!me) return;
    const now = clock();
    const news = followClaims(session.claims(), posts, me, now);
    session.setClaims(news.claims);
    for (const lost of news.lost) toast(t(lost.reason === 'ended' ? 'claimEnded' : 'claimRemoved', { what: lost.what }), 12_000);

    session.setSeen(Object.fromEntries(posts.filter((post) => post.author === me).map((post) => [post.id, replyCount(post)])));

    if (linked) {
      const id = linked;
      linked = undefined;
      if (posts.some((post) => post.id === id && post.expiresAt > now)) queueMicrotask(() => openRow(id));
      else toast(t('treatOver'), 12_000);
    }

    if (!demo && !cleaned.has(key)) {
      cleaned.add(key);
      for (const post of posts.filter((p) => p.expiresAt <= now).slice(0, CLEAN_AT_ONCE)) {
        store.deletePost(key, post.id).catch((error) => logProblem('clean-up', error));
      }
    }
  }

  function watch(): void {
    stopWatch();
    failure = null;
    stalled = false;
    clearTimeout(stalledTimer);
    stalledTimer = later(STALLED_AFTER, () => {
      stalled = true;
      renderBanners();
    });
    stopWatch = store.watchPosts(
      key,
      (snapshot) => {
        // A list from the phone alone never replaces what the server already said.
        if (!snapshot.fromServer && fromServer && snapshot.posts.length === 0) return;
        const first = !fromServer && snapshot.fromServer;
        posts = snapshot.posts;
        fromServer = fromServer || snapshot.fromServer;
        if (snapshot.fromServer) onServer();
        if (first) clearTimeout(stalledTimer);
        render();
      },
      (error) => {
        logProblem('listen', error);
        failure = error instanceof StoreError ? error.code : 'NF-LIVE-STOPPED';
        render();
      },
    );
    render();
  }

  const refresh = () => render();
  window.addEventListener('online', refresh);
  window.addEventListener('offline', refresh);
  document.addEventListener('visibilitychange', refresh);
  const minute = setInterval(refresh, 60_000);
  watch();

  return () => {
    stopWatch();
    clearInterval(minute);
    timers.forEach(clearTimeout);
    window.removeEventListener('online', refresh);
    window.removeEventListener('offline', refresh);
    document.removeEventListener('visibilitychange', refresh);
  };
}
