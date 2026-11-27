import type { ScreenErrorCode } from '../errors';
import { read, write } from '../storage';
import { en } from './en';
import { pl } from './pl';
import { ru } from './ru';

export type Lang = 'pl' | 'ru' | 'en';
export const LANGS: Lang[] = ['pl', 'ru', 'en'];

export interface Plural {
  one: string;
  few?: string;
  many?: string;
  other: string;
}

const PLURALS = [
  'offerCount',
  'askCount',
  'portionsLeft',
  'coming',
  'repliesCount',
  'newTakers',
  'deleteTaken',
] as const;
export type PluralKey = (typeof PLURALS)[number];

type TextKeys =
  | 'appName' | 'tagline' | 'language' | 'menu' | 'close' | 'done' | 'back' | 'retry' | 'reload'
  | 'enter' | 'enterOffer' | 'entering' | 'visibility' | 'organiser' | 'sameBrowser' | 'foodLine' | 'dataLink' | 'badLink'
  | 'loading' | 'stalled' | 'empty' | 'offline' | 'mainButton' | 'yours' | 'offers' | 'asks' | 'showHidden'
  | 'houseLabel' | 'noCount' | 'allTaken' | 'startedAt' | 'today' | 'tomorrow' | 'thisWeek' | 'at'
  | 'where' | 'allergensLine' | 'from' | 'aNeighbour' | 'neighbourN'
  | 'take' | 'imComing' | 'iCan' | 'cancel' | 'yourPortion' | 'youReplied' | 'takers' | 'replies'
  | 'delete' | 'deleteConfirm' | 'hide' | 'contact' | 'send' | 'calendar' | 'calendarFallback' | 'full'
  | 'checking' | 'checkingLong' | 'notConfirmed'
  | 'justTaken' | 'gone' | 'expired' | 'already' | 'unknown' | 'treatOver' | 'claimRemoved' | 'claimEnded' | 'checkClock' | 'taken' | 'cancelled' | 'newPost'
  | 'yourName' | 'nameVisible' | 'confirm' | 'note' | 'noteHint' | 'noFlat'
  | 'newTitle' | 'kindOffer' | 'kindAsk' | 'what' | 'whatOfferHint' | 'whatAskHint' | 'when' | 'otherDay' | 'day' | 'time'
  | 'portions' | 'fewer' | 'more' | 'noLimit' | 'whereField' | 'whereDefault' | 'whereHint' | 'allergens' | 'publish' | 'publishAsk' | 'publishing'
  | 'errRequired' | 'errTooLong' | 'errPastTime' | 'errBadPortions' | 'errBadTime'
  | 'sendTitle' | 'sendWarning' | 'shareText' | 'copied' | 'copyThis' | 'makeOwn' | 'makeText' | 'setup'
  | 'demoStrip' | 'gotIt'
  | 'createTitle' | 'ownerCode' | 'entranceName' | 'floors' | 'contactField' | 'create' | 'creating' | 'noDatabase' | 'seeDemo'
  | 'poster' | 'posterHeadline' | 'posterNothing' | 'posterFree' | 'posterQuestions' | 'posterWarning' | 'posterDemo' | 'print' | 'backToHouse'
  | 'dataTitle' | 'dataDemo' | 'buildId' | 'somethingWrong';

export type Dict = Record<TextKeys, string> &
  Record<PluralKey, Plural> & {
    data: string[];
    errors: Record<ScreenErrorCode, { text: string; next: string }>;
  };

export const DICTS: Record<Lang, Dict> = { pl, ru, en };

export function pickLang(preferred: readonly string[], saved: string | null): Lang {
  if (saved && (LANGS as string[]).includes(saved)) return saved as Lang;
  for (const tag of preferred) {
    const base = tag.toLowerCase().split('-')[0];
    if (base === 'pl' || base === 'ru' || base === 'en') return base;
  }
  return 'en';
}

let current: Lang | null = null;

export function lang(): Lang {
  current ??= pickLang(typeof navigator === 'undefined' ? [] : navigator.languages, read('lang'));
  return current;
}

export function setLang(next: Lang): void {
  current = next;
  write('lang', next);
}

export const fill = (template: string, values: Record<string, string | number> = {}): string =>
  template.replace(/\{(\w+)\}/g, (all, key: string) => (key in values ? String(values[key]) : all));

export const t = (key: TextKeys, values?: Record<string, string | number>, inLang: Lang = lang()): string =>
  fill(DICTS[inLang][key], values);

export function plural(key: PluralKey, n: number, inLang: Lang = lang()): string {
  const forms = DICTS[inLang][key];
  const category = new Intl.PluralRules(inLang).select(n) as keyof Plural;
  return fill(forms[category] ?? forms.other, { n });
}

export const dict = (): Dict => DICTS[lang()];
