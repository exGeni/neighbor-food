// The same checks as firestore.rules, used by the forms and by the memory store, so the demo
// refuses what the real database refuses.
import { ID_PATTERN, LIMITS, length } from './limits';
import { DAY, offerExpiry } from './time';
import type { NewPost } from './store/types';

export type FieldError = 'required' | 'tooLong' | 'pastTime' | 'badPortions' | 'badTime';
export type PostErrors = Partial<Record<'what' | 'where' | 'name' | 'allergens' | 'at' | 'portions' | 'id', FieldError>>;

const singleLine = (value: string): boolean => !/[\r\n\u2028\u2029]/.test(value);

export function checkText(value: string, max: number, required = false): FieldError | undefined {
  if (required && value.trim() === '') return 'required';
  if (length(value) > max || !singleLine(value)) return 'tooLong';
  return undefined;
}

export function checkPost(post: NewPost, now: number): PostErrors {
  const errors: PostErrors = {};
  const put = (field: keyof PostErrors, error: FieldError | undefined) => {
    if (error) errors[field] = error;
  };
  if (!ID_PATTERN.test(post.id)) errors.id = 'required';
  put('what', checkText(post.what, LIMITS.what, true));
  put('where', checkText(post.where, LIMITS.where));
  put('name', checkText(post.name, LIMITS.name));
  put('allergens', checkText(post.allergens, post.kind === 'ask' ? 0 : LIMITS.allergens));
  if (post.expiresAt <= now) errors.at = 'pastTime';
  if (post.expiresAt > now + LIMITS.expiryDays * DAY) errors.at = 'badTime';
  if (post.kind === 'offer') {
    if (post.at === undefined) errors.at = 'required';
    else if (post.expiresAt !== offerExpiry(post.at)) errors.at = 'badTime';
    else if (post.at < now - 60_000) errors.at = 'pastTime';
    const p = post.portions;
    if (p !== undefined && (!Number.isInteger(p) || p < LIMITS.portionsMin || p > LIMITS.portionsMax)) errors.portions = 'badPortions';
  } else if (post.at !== undefined || post.portions !== undefined) {
    errors.at = 'badTime';
  }
  return errors;
}
