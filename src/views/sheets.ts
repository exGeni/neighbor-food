// The small sheets: take or reply, send to the chat, make your own, confirm, contact.
import { lang, plural, t } from '../i18n';
import { clean, LIMITS } from '../limits';
import { replyCount, timeLabel } from '../model';
import { demoUrl } from '../router';
import { share } from '../share';
import type { Post } from '../store/types';
import { button, h, link, uid } from '../ui/dom';
import { qrSvg } from '../ui/qr';
import { openSheet } from '../ui/sheet';
import { checkText, type FieldError } from '../validate';
import { foodLine, README_URL } from './common';

export const fieldErrorText = (error: FieldError, max = 0): string =>
  error === 'required'
    ? t('errRequired')
    : error === 'tooLong'
      ? t('errTooLong', { n: max })
      : error === 'pastTime'
        ? t('errPastTime')
        : error === 'badPortions'
          ? t('errBadPortions')
          : t('errBadTime');

export interface Field {
  element: HTMLElement;
  show(message: string): void;
}

/** A labelled control with its own error line next to it. */
export function field(label: string, control: HTMLElement, hint = ''): Field {
  const id = uid('field');
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  control.id ||= id;
  const error = h('p', { class: 'field-error', id: errorId, hidden: true });
  if (hint) control.setAttribute('aria-describedby', hintId);
  const element = h('div', { class: 'field' }, h('label', { for: control.id }, label), control, hint ? h('p', { class: 'note', id: hintId }, hint) : null, error);
  return {
    element,
    show(message) {
      error.textContent = message;
      error.hidden = !message;
      if (message) {
        control.setAttribute('aria-invalid', 'true');
        control.setAttribute('aria-describedby', hint ? `${errorId} ${hintId}` : errorId);
      } else {
        control.removeAttribute('aria-invalid');
        if (hint) control.setAttribute('aria-describedby', hintId);
        else control.removeAttribute('aria-describedby');
      }
    },
  };
}

export function takeSheet(post: Post, savedName: string, confirm: (reply: { name: string; note?: string }) => void): void {
  const ask = post.kind === 'ask';
  const title = ask ? t('iCan') : post.portions === undefined ? t('imComing') : t('take');
  openSheet(title, (close) => {
    const name = h('input', { type: 'text', autocomplete: 'given-name', value: savedName });
    const nameField = field(t('yourName'), name, t('nameVisible'));
    const note = h('input', { type: 'text' });
    const noteField = field(t('note'), note, `${t('noteHint')} ${t('noFlat')}`);

    const submit = (event: Event) => {
      event.preventDefault();
      const reply = { name: clean(name.value), note: clean(note.value) };
      const nameError = checkText(reply.name, LIMITS.name);
      const noteError = ask ? checkText(reply.note, LIMITS.note, true) : undefined;
      nameField.show(nameError ? fieldErrorText(nameError, LIMITS.name) : '');
      noteField.show(noteError ? fieldErrorText(noteError, LIMITS.note) : '');
      if (nameError) return name.focus();
      if (noteError) return note.focus();
      close();
      confirm(ask ? reply : { name: reply.name });
    };

    return [
      h('p', { class: 'big' }, post.what),
      h('p', null, timeLabel(post, Date.now(), lang())),
      post.where ? h('p', null, t('where', { where: post.where })) : null,
      post.allergens ? h('p', null, t('allergensLine', { allergens: post.allergens })) : null,
      h(
        'form',
        { class: 'stack', novalidate: true, onsubmit: submit },
        ask ? noteField.element : null,
        nameField.element,
        ask ? null : foodLine(),
        h('button', { type: 'submit', class: 'button button-primary button-big' }, t('confirm')),
      ),
    ];
  });
}

export function sendSheet(text: string, url: string, lead = ''): void {
  openSheet(t('sendTitle'), () => {
    const status = h('div', { class: 'stack', role: 'status' });
    const send = button(
      t('send'),
      () =>
        void share(text, url).then((result) => {
          status.replaceChildren();
          if (result === 'copied') status.append(h('p', null, t('copied')));
          if (result === 'manual') {
            const copy = h('textarea', { class: 'copy', readonly: true, 'aria-label': t('copyThis') });
            copy.value = `${text}\n${url}`;
            status.append(h('p', null, t('copyThis')), copy);
            copy.select();
          }
        }),
      { class: 'button button-primary button-big' },
    );
    return [lead ? h('p', null, lead) : null, h('p', { class: 'banner banner-warn' }, t('sendWarning')), send, status];
  });
}

export function makeOwnSheet(): void {
  openSheet(t('makeOwn'), () => [
    qrSvg(demoUrl(), 'qr'),
    h('p', null, t('makeText')),
    h('p', null, link(demoUrl(), demoUrl())),
    link(t('setup'), README_URL, { class: 'button button-primary button-big', rel: 'noopener', target: '_blank' }),
  ]);
}

export function deleteSheet(post: Post, confirm: () => void): void {
  const count = replyCount(post);
  openSheet(t('deleteConfirm'), (close) => [
    h('p', { class: 'big' }, post.what),
    count > 0 ? h('p', null, plural('deleteTaken', count)) : null,
    h(
      'div',
      { class: 'actions' },
      button(
        t('delete'),
        () => {
          close();
          confirm();
        },
        { class: 'button button-primary' },
      ),
      button(t('cancel'), close),
    ),
  ]);
}

export function contactSheet(contact: string): void {
  openSheet(t('contact'), () => [h('p', { class: 'big' }, contact)]);
}
