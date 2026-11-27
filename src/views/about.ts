// What is stored, in plain words.
import { dict, fill, t } from '../i18n';
import { h, link } from '../ui/dom';
import { langSwitch, README_URL } from './common';

export interface AboutOptions {
  root: HTMLElement;
  /** Null: the demonstration, or no entrance known. */
  entranceKey: string | null;
  contact: string;
  changeLanguage(): void;
}

export function aboutView(options: AboutOptions): () => void {
  const { root, entranceKey } = options;
  const [first = '', ...rest] = dict().data;
  const items = options.contact ? [fill(first, { contact: options.contact }), ...rest] : rest;
  root.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('div', { class: 'top' }, link(t('backToHouse'), entranceKey ? `#/e/${entranceKey}` : '#/demo', { class: 'button' }), langSwitch(options.changeLanguage)),
      h('h1', null, t('dataTitle')),
      entranceKey ? null : h('p', { class: 'banner banner-warn' }, t('dataDemo')),
      h('ul', { class: 'data-list' }, ...items.map((text) => h('li', null, text))),
      h('p', null, link('GitHub', README_URL, { rel: 'noopener', target: '_blank' })),
      h('footer', { class: 'version' }, t('buildId', { id: __BUILD_ID__ })),
    ),
  );
  return () => undefined;
}
