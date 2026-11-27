// One A4 page for the entrance wall, in all three languages at once.
import { lang, LANGS, t } from '../i18n';
import { demoUrl, entranceUrl } from '../router';
import { button, h, link, s } from '../ui/dom';
import { qrSvg } from '../ui/qr';
import type { Entrance } from '../store/types';
import { langSwitch } from './common';

export interface PosterOptions {
  root: HTMLElement;
  /** Null for the demonstration poster. */
  entrance: Entrance | null;
  demoName: string;
  demoContact: string;
  changeLanguage(): void;
}

/** The house as black line art: it needs no background colours to print. */
function art(): SVGSVGElement {
  const window = (x: number, y: number, lit: boolean) => [
    s('rect', { x, y, width: 28, height: 24, rx: 3 }),
    lit
      ? s('path', { d: `M${x + 7} ${y + 14}h14v3a4 4 0 0 1-4 4h-6a4 4 0 0 1-4-4zM${x + 11} ${y + 11}c-2-3 2-3 0-6M${x + 17} ${y + 11}c-2-3 2-3 0-6` })
      : s('path', { d: `M${x + 14} ${y}v24M${x} ${y + 12}h28` }),
  ];
  return s(
    'svg',
    { class: 'poster-art', viewBox: '0 0 220 130', 'aria-hidden': 'true' },
    s('path', { d: 'M28 42L58 14h104l30 28zM160 14V6h12v18' }),
    s('path', { d: 'M40 42v82h140V42' }),
    ...window(52, 52, true),
    ...window(96, 52, false),
    ...window(140, 52, true),
    ...window(52, 90, false),
    ...window(140, 90, true),
    s('path', { d: 'M98 124V90h24v34' }),
    s('circle', { class: 'solid', cx: 116, cy: 108, r: 2 }),
    s('path', { d: 'M6 124h208' }),
  );
}

export function posterView(options: PosterOptions): () => void {
  const { root, entrance } = options;
  const url = entrance ? entranceUrl(entrance.key) : demoUrl();
  const name = entrance?.name ?? options.demoName;
  const contact = entrance?.contact ?? options.demoContact;
  const inAll = (key: 'posterHeadline' | 'posterNothing' | 'posterFree' | 'foodLine' | 'posterDemo') =>
    LANGS.map((code) => h('span', { lang: code }, t(key, {}, code)));
  const lines = (parts: HTMLElement[]) => parts.flatMap((part, i) => (i ? [h('br'), part] : [part]));

  root.replaceChildren(
    h(
      'div',
      { class: 'poster-tools no-print' },
      h('div', { class: 'top' }, link(t('backToHouse'), entrance ? `#/e/${entrance.key}` : '#/demo', { class: 'button' }), langSwitch(options.changeLanguage)),
      entrance ? h('p', { class: 'banner banner-warn' }, t('posterWarning')) : null,
      button(t('print'), () => window.print(), { class: 'button button-primary' }),
    ),
    h(
      'div',
      { class: 'poster-screen' },
      h(
        'main',
        { class: 'poster', lang: lang() },
        art(),
        entrance ? null : h('p', null, ...lines(inAll('posterDemo'))),
        h('h1', null, name),
        h('p', { class: 'headline' }, ...lines(inAll('posterHeadline'))),
        qrSvg(url, 'poster-qr'),
        h('p', null, ...lines(inAll('posterNothing'))),
        h('p', null, ...lines(inAll('posterFree'))),
        h('p', null, ...lines(inAll('foodLine'))),
        h('p', null, LANGS.map((code) => t('posterQuestions', { contact: '' }, code).replace(/[:\s]+$/, '')).join(' · '), h('br'), h('strong', null, contact)),
      ),
    ),
  );
  return () => undefined;
}
