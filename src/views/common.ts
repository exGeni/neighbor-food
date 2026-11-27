import type { ScreenErrorCode } from '../errors';
import { dict, lang, LANGS, setLang, t } from '../i18n';
import { button, h, type Child } from '../ui/dom';

export const README_URL = 'https://github.com/exGeni/neighbor-food#readme';

const NAMES = { pl: 'Polski', ru: 'Русский', en: 'English' };

/** `changed` redraws the current screen in the new language. */
export function langSwitch(changed: () => void): HTMLElement {
  return h(
    'div',
    { class: 'langs', role: 'group', 'aria-label': t('language') },
    ...LANGS.map((code) =>
      button(
        code,
        () => {
          if (code === lang()) return;
          setLang(code);
          changed();
        },
        { class: 'button button-small', lang: code, 'aria-pressed': String(code === lang()), 'aria-label': NAMES[code], 'data-lang': code },
      ),
    ),
  );
}

/** A plain sentence, what to do next, and the code to look up in the README. */
export function errorBox(code: ScreenErrorCode, ...actions: Child[]): HTMLElement {
  const { text, next } = dict().errors[code];
  return h('div', { class: 'banner error', role: 'alert', 'data-code': code }, h('p', null, text), h('p', null, next), h('code', null, code), ...actions);
}

export const foodLine = (): HTMLElement => h('p', { class: 'food' }, t('foodLine'));

export const retryButton = (retry: () => void): HTMLButtonElement => button(t('retry'), retry, { class: 'button button-small' });
