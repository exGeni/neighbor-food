import { expect, test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';

export const OWNER_CODE = 'e2e-organiser-code-000';
const DOCUMENTS = 'http://127.0.0.1:8080/v1/projects/demo-nf/databases/(default)/documents';

/** What the organiser does by hand in the console. */
export async function setOwnerCode(): Promise<void> {
  const response = await fetch(`${DOCUMENTS}/config/owner`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { code: { stringValue: OWNER_CODE } } }),
  });
  expect(response.ok).toBe(true);
}

export interface Watched {
  requests: string[];
  problems: string[];
  /** Everything written to the console. */
  console: string[];
}

/** Records every request, page error and security-policy violation. */
export async function watch(page: Page): Promise<Watched> {
  const seen: Watched = { requests: [], problems: [], console: [] };
  page.on('request', (request) => seen.requests.push(request.url()));
  page.on('pageerror', (error) => seen.problems.push(String(error)));
  page.on('console', (message) => {
    seen.console.push(message.text());
    if (message.type() === 'error' || /content security policy/i.test(message.text())) seen.problems.push(message.text());
  });
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (event) => console.error(`content security policy: ${event.violatedDirective}`));
  });
  return seen;
}

export async function phone(browser: Browser): Promise<{ context: BrowserContext; page: Page; seen: Watched }> {
  const context = await browser.newContext(base.info().project.use);
  const page = await context.newPage();
  return { context, page, seen: await watch(page) };
}

/** Fills the organiser's form and returns the new entrance key. */
export async function createEntrance(page: Page, name = 'Test hall', contact = 'Ann in the chat'): Promise<string> {
  await page.goto('#/new');
  await page.getByLabel('Organiser code').fill(OWNER_CODE);
  await page.getByLabel('Entrance name').fill(name);
  await page.getByLabel(/How to reach you/).fill(contact);
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page).toHaveURL(/#\/e\/[A-Za-z0-9_-]{22}\/poster$/);
  return (page.url().match(/#\/e\/([A-Za-z0-9_-]+)\//) as RegExpMatchArray)[1] as string;
}

export async function enter(page: Page, key: string): Promise<void> {
  await page.goto(`#/e/${key}`);
  await page.getByRole('button', { name: /^Enter/ }).click();
  await expect(page.getByRole('button', { name: 'Treat or ask' })).toBeVisible();
}

export const row = (page: Page, what: string) => page.locator('.row', { hasText: what });
export const openRow = (page: Page, what: string) => row(page, what).locator('.row-head').click();

/** What the organiser could do in the console of the real project. */
export async function admin(path: string, fields: Record<string, object>, mask = false): Promise<void> {
  const query = mask ? `?${Object.keys(fields).map((name) => `updateMask.fieldPaths=${name}`).join('&')}` : '';
  const response = await fetch(`${DOCUMENTS}/${path}${query}`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  expect(response.ok).toBe(true);
}

export async function exists(path: string): Promise<boolean> {
  return (await fetch(`${DOCUMENTS}/${path}`, { headers: { Authorization: 'Bearer owner' } })).ok;
}
