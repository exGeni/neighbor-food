import './fonts.css';
import './styles.css';
import { createDemo, DEMO_KEY, type Demo } from './demo';
import { logProblem, StoreError, type ScreenErrorCode } from './errors';
import { lang, t } from './i18n';
import { parseRoute, type Route } from './router';
import { session } from './session';
import { liveStore } from './store/live';
import type { Entrance, Store } from './store/types';
import { systemClock } from './time';
import { h, link } from './ui/dom';
import { discardSheet } from './ui/sheet';
import { aboutView } from './views/about';
import { errorBox, langSwitch, retryButton } from './views/common';
import { createView } from './views/create';
import { homeView } from './views/home';
import { posterView } from './views/poster';
import { residentView } from './views/resident';

const root = document.getElementById('app') as HTMLElement;
let demo: Demo | null = null;
let leave: () => void = () => undefined;
/** Rises with every redraw, so a slow answer for an old address is dropped. */
let turn = 0;

async function theDemo(): Promise<Demo> {
  demo ??= await createDemo(lang());
  demo.setLang(lang());
  return demo;
}

function plain(...children: (Node | null)[]): void {
  root.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('div', { class: 'top' }, h('span', { class: 'note' }, t('appName')), langSwitch(() => void show())),
      ...children,
    ),
  );
}

function problem(code: ScreenErrorCode): void {
  plain(errorBox(code, retryButton(() => void show())));
}

/** No database in this copy: only the demonstration works. */
const noDatabase = (): void => plain(h('p', { class: 'lead' }, t('noDatabase')), link(t('seeDemo'), '#/demo', { class: 'button button-primary button-big' }));

const badLink = (): void => plain(h('p', { class: 'lead', 'data-code': 'bad-link' }, t('badLink')), link(t('seeDemo'), '#/demo', { class: 'button' }));

/** Finds an entrance, or draws the reason why not and returns null. */
async function find(store: Store, key: string, mine: number): Promise<Entrance | null> {
  plain(h('p', { class: 'empty', role: 'status' }, t('loading')));
  await store.ready();
  const entrance = await store.getEntrance(key);
  if (mine !== turn) return null;
  if (!entrance) badLink();
  return entrance;
}

async function draw(route: Route, mine: number): Promise<void> {
  const changeLanguage = () => void show();
  document.documentElement.lang = lang();
  document.title = t('appName');

  if (route.name === 'demo') {
    const { store } = await theDemo();
    const entrance = await store.getEntrance(DEMO_KEY);
    if (mine !== turn || !entrance) return;
    const stopLive = (demo as Demo).live();
    const stopHome = homeView({ root, store, entrance, session: demoSession, clock: systemClock, demo: true, changeLanguage });
    leave = () => {
      stopHome();
      stopLive();
    };
    return;
  }

  if (route.name === 'poster' && route.key === null) {
    const { store } = await theDemo();
    const entrance = await store.getEntrance(DEMO_KEY);
    if (mine !== turn || !entrance) return;
    leave = posterView({ root, entrance: null, demoName: entrance.name, demoContact: entrance.contact, changeLanguage });
    return;
  }

  if (route.name === 'about' && route.key === null) {
    leave = aboutView({ root, entranceKey: null, contact: '', changeLanguage });
    return;
  }

  const store = await liveStore();
  if (mine !== turn) return;
  if (!store) return noDatabase();

  if (route.name === 'new') {
    await store.ready();
    if (mine === turn) leave = createView({ root, store, changeLanguage });
    return;
  }

  const key = (route as { key: string }).key;
  const entrance = await find(store, key, mine);
  if (!entrance) return;

  if (route.name === 'poster') {
    leave = posterView({ root, entrance, demoName: '', demoContact: '', changeLanguage });
  } else if (route.name === 'about') {
    leave = aboutView({ root, entranceKey: key, contact: entrance.contact, changeLanguage });
  } else if (route.name === 'entrance') {
    const kept = session(key, false);
    if (store.me() && kept.entered()) {
      leave = homeView({ root, store, entrance, session: kept, clock: systemClock, demo: false, openPost: route.post, changeLanguage });
    } else {
      leave = residentView({
        root,
        store,
        entrance,
        toOffer: !!route.post,
        changeLanguage,
        entered: () => {
          kept.enter();
          void show();
        },
      });
    }
  }
}

const demoSession = session(DEMO_KEY, true);

async function show(): Promise<void> {
  const mine = ++turn;
  leave();
  leave = () => undefined;
  discardSheet();
  try {
    await draw(parseRoute(location.hash), mine);
  } catch (error) {
    if (mine !== turn) return;
    logProblem('show', error);
    problem(error instanceof StoreError ? error.code : 'NF-UNEXPECTED');
  }
}

/** Anything nobody caught still ends as a sentence, an action and a code. */
function unexpected(error: unknown): void {
  logProblem('unexpected', error);
  if (!root.querySelector('[data-code="NF-UNEXPECTED"]')) {
    root.prepend(errorBox('NF-UNEXPECTED', retryButton(() => location.reload())));
  }
}

window.addEventListener('error', (event) => unexpected(event.error));
window.addEventListener('unhandledrejection', (event) => unexpected(event.reason));
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  void show();
});
void show();
