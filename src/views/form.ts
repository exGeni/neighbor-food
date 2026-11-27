// "Treat or ask": one form for both. It closes only after the server has the post.
import { logProblem, StoreError } from '../errors';
import { t } from '../i18n';
import { clean, LIMITS, randomId } from '../limits';
import type { Kind, NewPost, Store } from '../store/types';
import { askExpiry, HOUR, offerAt, offerExpiry, type AskUntil, type Clock } from '../time';
import { button, h, uid } from '../ui/dom';
import { openSheet } from '../ui/sheet';
import { checkPost, type PostErrors } from '../validate';
import { errorBox, foodLine } from './common';
import { field, fieldErrorText, type Field } from './sheets';

export const CONFIRM_WAIT = 10_000;

export interface FormContext {
  store: Store;
  entranceKey: string;
  clock: Clock;
  name: string;
  /** Called once the server has confirmed the post. */
  published(post: NewPost, name: string): void;
}

function choices<T extends string>(legend: string, options: [T, string][], initial: T, changed: (value: T) => void): HTMLFieldSetElement {
  const group = uid('choice');
  return h(
    'fieldset',
    { class: 'field' },
    h('legend', null, legend),
    h(
      'div',
      { class: 'choices' },
      ...options.map(([value, label]) =>
        h(
          'label',
          { class: 'choice' },
          h('input', { type: 'radio', name: group, value, checked: value === initial, onchange: () => changed(value) }),
          h('span', null, label.charAt(0).toLocaleUpperCase() + label.slice(1)),
        ),
      ),
    ),
  );
}

const pad = (n: number): string => String(n).padStart(2, '0');
const dayValue = (at: number): string => {
  const date = new Date(at);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export function postForm(context: FormContext): void {
  const { store, entranceKey, clock } = context;
  // Kept across retries, so one post is never published twice.
  const id = randomId();
  let attempted = false;
  let sending = false;
  let kind: Kind = 'offer';
  let day: 'today' | 'tomorrow' | 'other' = 'today';
  let until: AskUntil = 'today';

  const soon = new Date(clock() + 2 * HOUR);
  const defaultTime = `${pad(soon.getHours())}:00`;
  // Late in the evening two hours ahead is already tomorrow.
  if (soon.getDate() !== new Date(clock()).getDate()) day = 'tomorrow';

  openSheet(t('newTitle'), (close) => {
    const what = h('input', { type: 'text', autocomplete: 'off', placeholder: t('whatOfferHint') });
    const where = h('input', { type: 'text', value: t('whereDefault'), autocomplete: 'off' });
    const allergens = h('input', { type: 'text', autocomplete: 'off' });
    const name = h('input', { type: 'text', autocomplete: 'given-name', value: context.name });
    const date = h('input', { type: 'date', min: dayValue(clock()), max: dayValue(clock() + LIMITS.offerDaysAhead * 24 * HOUR), value: dayValue(clock() + 48 * HOUR) });
    const time = h('input', { type: 'time', value: defaultTime });
    const portions = h('input', { type: 'number', inputmode: 'numeric', min: LIMITS.portionsMin, max: LIMITS.portionsMax, value: 3 });
    const noLimit = h('input', { type: 'checkbox' });

    const whatField = field(t('what'), what);
    const whereField = field(t('whereField'), where, t('whereHint'));
    const allergensField = field(t('allergens'), allergens);
    const nameField = field(t('yourName'), name, t('nameVisible'));
    const dateField = field(t('day'), date);
    const timeField = field(t('time'), time);

    const step = (by: number) => {
      const value = Math.round(Number(portions.value)) || LIMITS.portionsMin;
      portions.value = String(Math.min(LIMITS.portionsMax, Math.max(LIMITS.portionsMin, value + by)));
    };
    const minus = button('−', () => step(-1), { 'aria-label': t('fewer') });
    const plus = button('+', () => step(1), { 'aria-label': t('more') });
    noLimit.addEventListener('change', () => {
      for (const control of [portions, minus, plus]) control.disabled = noLimit.checked;
    });
    portions.id = uid('portions');
    const portionsError = h('p', { class: 'field-error', hidden: true });
    const portionsBlock = h(
      'div',
      { class: 'field' },
      h('label', { for: portions.id }, t('portions')),
      h('div', { class: 'stepper' }, minus, portions, plus),
      h('label', { class: 'check' }, noLimit, t('noLimit')),
      portionsError,
    );

    const offerWhen = h(
      'div',
      { class: 'stack' },
      choices(
        t('when'),
        [
          ['today', t('today')],
          ['tomorrow', t('tomorrow')],
          ['other', t('otherDay')],
        ],
        day,
        (value) => {
          day = value;
          dateField.element.hidden = day !== 'other';
        },
      ),
      dateField.element,
      timeField.element,
    );
    dateField.element.hidden = true;
    const askWhen = choices<AskUntil>(
      t('when'),
      [
        ['today', t('today')],
        ['week', t('thisWeek')],
      ],
      until,
      (value) => (until = value),
    );
    askWhen.hidden = true;

    const submit = h('button', { type: 'submit', class: 'button button-primary button-big' }, t('publish'));
    const status = h('div', { class: 'stack', role: 'status' });
    const food = foodLine();

    const switchKind = (next: Kind) => {
      kind = next;
      const offer = kind === 'offer';
      offerWhen.hidden = !offer;
      askWhen.hidden = offer;
      portionsBlock.hidden = !offer;
      allergensField.element.hidden = !offer;
      food.hidden = !offer;
      what.placeholder = offer ? t('whatOfferHint') : t('whatAskHint');
      submit.textContent = offer ? t('publish') : t('publishAsk');
    };

    const daysAhead = (): number => {
      if (day !== 'other') return day === 'today' ? 0 : 1;
      const [year, month, dayOfMonth] = date.value.split('-').map(Number);
      if (!year || !month || !dayOfMonth) return -1;
      const now = new Date(clock());
      return Math.round((Date.UTC(year, month - 1, dayOfMonth) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / (24 * HOUR));
    };

    const read = (): { post: NewPost; errors: PostErrors } => {
      const offer = kind === 'offer';
      const base = {
        id,
        kind,
        what: clean(what.value),
        where: clean(where.value),
        name: clean(name.value),
        allergens: offer ? clean(allergens.value) : '',
      };
      if (!offer) {
        const post: NewPost = { ...base, expiresAt: askExpiry(clock(), until) };
        return { post, errors: checkPost(post, clock()) };
      }
      const at = offerAt(clock(), daysAhead(), time.value);
      const post: NewPost = {
        ...base,
        at: at ?? clock(),
        expiresAt: offerExpiry(at ?? clock()),
        ...(noLimit.checked ? {} : { portions: Number(portions.value) }),
      };
      const errors = checkPost(post, clock());
      if (at === null) errors.at = 'badTime';
      return { post, errors };
    };

    const showErrors = (errors: PostErrors): boolean => {
      const rows: [Field, HTMLElement, string][] = [
        [whatField, what, errors.what ? fieldErrorText(errors.what, LIMITS.what) : ''],
        [timeField, time, errors.at ? fieldErrorText(errors.at) : ''],
        [whereField, where, errors.where ? fieldErrorText(errors.where, LIMITS.where) : ''],
        [allergensField, allergens, errors.allergens ? fieldErrorText(errors.allergens, LIMITS.allergens) : ''],
        [nameField, name, errors.name ? fieldErrorText(errors.name, LIMITS.name) : ''],
      ];
      for (const [row, , message] of rows) row.show(message);
      portionsError.textContent = errors.portions ? fieldErrorText(errors.portions) : '';
      portionsError.hidden = !errors.portions;
      const first = rows.find(([, , message]) => message)?.[1] ?? (errors.portions ? portions : undefined);
      first?.focus();
      return !!first;
    };

    const send = async (event: Event) => {
      event.preventDefault();
      if (sending) return;
      const { post, errors } = read();
      if (showErrors(errors)) return;
      sending = true;
      submit.disabled = true;
      submit.textContent = t('publishing');
      status.replaceChildren();
      const slow = setTimeout(() => status.replaceChildren(h('p', { class: 'banner banner-warn' }, t('notConfirmed'))), CONFIRM_WAIT);
      try {
        // A first attempt may have reached the server even though no answer came back.
        const exists = attempted && (await store.getPost(entranceKey, post.id)) !== null;
        attempted = true;
        if (!exists) await store.createPost(entranceKey, post);
        const stillOpen = form.isConnected;
        if (stillOpen) close();
        context.published(post, post.name);
      } catch (error) {
        logProblem('publish', error);
        const code = error instanceof StoreError ? error.code : 'NF-UNEXPECTED';
        status.replaceChildren(errorBox(code, code === 'NF-ENTRY-DENIED' ? h('p', null, t('checkClock')) : null));
        submit.disabled = false;
        submit.textContent = kind === 'offer' ? t('publish') : t('publishAsk');
      } finally {
        sending = false;
        clearTimeout(slow);
      }
    };

    const form = h(
      'form',
      { class: 'stack', novalidate: true, onsubmit: send },
      choices<Kind>(
        t('newTitle'),
        [
          ['offer', t('kindOffer')],
          ['ask', t('kindAsk')],
        ],
        kind,
        switchKind,
      ),
      whatField.element,
      offerWhen,
      askWhen,
      portionsBlock,
      whereField.element,
      allergensField.element,
      nameField.element,
      food,
      status,
      submit,
    );
    // The heading above already says what this is.
    form.querySelector('fieldset legend')?.classList.add('sr-only');
    return [form];
  });
}
