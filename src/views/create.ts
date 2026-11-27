// The organiser's one form. The new key is saved before writing, so a lost answer never leaves
// an entrance whose address nobody knows.
import { logProblem, StoreError, type ScreenErrorCode } from '../errors';
import { t } from '../i18n';
import { clean, LIMITS, randomId } from '../limits';
import { read, remove, write } from '../storage';
import type { Store } from '../store/types';
import { h } from '../ui/dom';
import { checkText } from '../validate';
import { errorBox, langSwitch } from './common';
import { CONFIRM_WAIT } from './form';
import { field, fieldErrorText } from './sheets';

const PENDING = 'new-entrance';

export interface CreateOptions {
  root: HTMLElement;
  store: Store;
  changeLanguage(): void;
}

export function createView(options: CreateOptions): () => void {
  const { root, store } = options;
  let gone = false;
  const status = h('div', { class: 'stack', role: 'status' });

  const toPoster = (key: string) => {
    remove(PENDING);
    write(`entered:${key}`, 'true');
    location.hash = `#/e/${key}/poster`;
  };

  /** A key from an earlier attempt whose answer never came. */
  const checkPending = async (): Promise<boolean> => {
    const key = read(PENDING);
    if (!key) return false;
    if ((await store.getEntrance(key)) === null) return false;
    if (!gone) toPoster(key);
    return true;
  };

  const code = h('input', { type: 'password', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
  const name = h('input', { type: 'text', autocomplete: 'off' });
  const floors = h('input', { type: 'number', inputmode: 'numeric', min: LIMITS.floorsMin, max: LIMITS.floorsMax, value: 5 });
  const contact = h('input', { type: 'text', autocomplete: 'off' });
  const codeField = field(t('ownerCode'), code);
  const nameField = field(t('entranceName'), name);
  const floorsField = field(t('floors'), floors);
  const contactField = field(t('contactField'), contact);
  const submit = h('button', { type: 'submit', class: 'button button-primary button-big' }, t('create'));

  const send = async (event: Event) => {
    event.preventDefault();
    const entrance = { name: clean(name.value), contact: clean(contact.value), floors: Number(floors.value), code: code.value.trim() };
    const nameError = checkText(entrance.name, LIMITS.entranceName, true);
    const contactError = checkText(entrance.contact, LIMITS.contact, true);
    const floorsBad = !Number.isInteger(entrance.floors) || entrance.floors < LIMITS.floorsMin || entrance.floors > LIMITS.floorsMax;
    codeField.show(entrance.code ? '' : fieldErrorText('required'));
    nameField.show(nameError ? fieldErrorText(nameError, LIMITS.entranceName) : '');
    floorsField.show(floorsBad ? `${LIMITS.floorsMin}–${LIMITS.floorsMax}` : '');
    contactField.show(contactError ? fieldErrorText(contactError, LIMITS.contact) : '');
    const first = !entrance.code ? code : nameError ? name : floorsBad ? floors : contactError ? contact : null;
    if (first) return first.focus();

    submit.disabled = true;
    submit.textContent = t('creating');
    status.replaceChildren();
    const fail = (problem: ScreenErrorCode) => {
      status.replaceChildren(errorBox(problem));
      submit.disabled = false;
      submit.textContent = t('create');
    };
    const slow = setTimeout(() => fail('NF-NEW-UNCONFIRMED'), CONFIRM_WAIT);
    try {
      await store.signIn();
      if (await checkPending()) return;
      const key = read(PENDING) ?? randomId();
      write(PENDING, key);
      await store.createEntrance({ key, ...entrance });
      if (!gone) toPoster(key);
    } catch (error) {
      logProblem('create-entrance', error);
      fail(error instanceof StoreError ? error.code : 'NF-UNEXPECTED');
    } finally {
      clearTimeout(slow);
    }
  };

  root.replaceChildren(
    h(
      'main',
      { class: 'page' },
      h('div', { class: 'top' }, h('span', { class: 'note' }, t('appName')), langSwitch(options.changeLanguage)),
      h('h1', null, t('createTitle')),
      h('form', { class: 'stack', novalidate: true, onsubmit: send }, codeField.element, nameField.element, floorsField.element, contactField.element, status, submit),
    ),
  );

  void checkPending().catch((error) => logProblem('check-pending', error));
  return () => {
    gone = true;
  };
}
