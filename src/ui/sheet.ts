// One bottom sheet at a time, on a native dialog. The phone's Back button closes it.
import { t } from '../i18n';
import { button, h, uid, type Child } from './dom';

export interface Sheet {
  /** Closes it and gives the history step back. */
  close(): void;
  isOpen(): boolean;
}

let current: { dialog: HTMLDialogElement; done: () => void } | null = null;
let pushed = false;
/** history.back() was called and its popstate has not arrived yet. */
let goingBack = false;

function pushStep(): void {
  history.pushState({ sheet: true }, '');
  pushed = true;
}

function remove(): void {
  const closing = current;
  if (!closing) return;
  current = null;
  closing.dialog.close();
  closing.dialog.remove();
  closing.done();
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', () => {
    if (goingBack) {
      goingBack = false;
      // A sheet opened while the previous one was giving its step back needs its own.
      if (current) pushStep();
      return;
    }
    pushed = false;
    remove();
  });
}

/** Drops an open sheet without touching history (the address is changing anyway). */
export function discardSheet(): void {
  pushed = false;
  remove();
}

/** Follows a link from inside a sheet, replacing the sheet's history step. */
export function leaveSheet(href: string): void {
  const hadStep = pushed;
  discardSheet();
  if (hadStep) location.replace(href);
  else location.assign(href);
}

export function openSheet(title: string, content: (close: () => void) => Child[], done: () => void = () => undefined): Sheet {
  remove();
  const heading = uid('sheet');
  const dialog = h('dialog', { class: 'sheet', 'aria-labelledby': heading });
  const close = () => {
    if (current?.dialog !== dialog) return;
    remove();
    if (pushed) {
      pushed = false;
      goingBack = true;
      history.back();
    }
  };
  dialog.append(
    h(
      'div',
      { class: 'sheet-body' },
      h('div', { class: 'sheet-head' }, h('h2', { id: heading }, title), button(t('close'), close, { class: 'button button-small' })),
      ...content(close).filter((child): child is Node | string => child !== false && child !== null && child !== undefined && typeof child !== 'number'),
    ),
  );
  // Escape and a tap outside close it the same way as the button.
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) close();
  });
  document.body.append(dialog);
  current = { dialog, done };
  if (!pushed && !goingBack) pushStep();
  dialog.showModal();
  return { close, isOpen: () => current?.dialog === dialog };
}
