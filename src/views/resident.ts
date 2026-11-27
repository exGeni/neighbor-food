// The first visit from the poster or a chat link: what this is, and one button.
import { logProblem, StoreError } from '../errors';
import { t } from '../i18n';
import type { Entrance, Store } from '../store/types';
import { h, link } from '../ui/dom';
import { createHouse } from '../ui/house';
import { errorBox, foodLine, langSwitch } from './common';

export interface ResidentOptions {
  root: HTMLElement;
  store: Store;
  entrance: Entrance;
  /** The link points at one offer. */
  toOffer: boolean;
  entered(): void;
  changeLanguage(): void;
}

export function residentView(options: ResidentOptions): () => void {
  const { root, store, entrance } = options;
  const label = options.toOffer ? t('enterOffer') : t('enter');
  const problem = h('div', { role: 'status' });
  const enter = h('button', { type: 'button', class: 'button button-primary button-big' }, label);
  enter.addEventListener('click', async () => {
    enter.disabled = true;
    enter.textContent = t('entering');
    problem.replaceChildren();
    try {
      await store.signIn();
      options.entered();
    } catch (error) {
      logProblem('sign-in', error);
      problem.replaceChildren(errorBox(error instanceof StoreError ? error.code : 'NF-UNEXPECTED'));
      enter.disabled = false;
      enter.textContent = label;
    }
  });

  const house = createHouse({ floors: entrance.floors });
  house.element.setAttribute('aria-label', entrance.name);

  root.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('div', { class: 'top' }, h('span', { class: 'note' }, t('appName')), langSwitch(options.changeLanguage)),
      h('h1', null, entrance.name),
      h('div', { class: 'house-box' }, house.element),
      h('p', { class: 'lead' }, t('tagline')),
      enter,
      problem,
      h('p', { class: 'note' }, t('visibility')),
      foodLine(),
      h('p', { class: 'note' }, t('organiser', { contact: entrance.contact })),
      h('p', { class: 'note' }, t('sameBrowser')),
      h('p', null, link(t('dataLink'), `#/e/${entrance.key}/about`)),
    ),
  );
  return () => undefined;
}
