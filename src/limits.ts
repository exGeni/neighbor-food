// The one limits table. firestore.rules repeats these numbers; the rules tests are generated from
// this table, so a drift fails the build.
export const LIMITS = {
  entranceName: 40,
  floorsMin: 1,
  floorsMax: 30,
  contact: 60,
  ownerCodeMin: 16,
  what: 60,
  where: 60,
  name: 30,
  allergens: 100,
  note: 80,
  portionsMin: 1,
  portionsMax: 20,
  responses: 30,
  expiryDays: 9,
  offerHoursAfter: 3,
  offerDaysAhead: 7,
  readLimit: 100,
} as const;

/** Length the way the database rules count it (checked on the emulator): an emoji counts as two. */
export const length = (value: string): number => value.length;

export const KEY_PATTERN = /^[A-Za-z0-9_-]{22,}$/;
export const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Single-line field: no line breaks, no surrounding spaces. */
export const clean = (value: string): string => value.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();

/** 16 random bytes as base64url (22 characters). */
export function randomId(bytes = 16): string {
  const raw = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...raw)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
