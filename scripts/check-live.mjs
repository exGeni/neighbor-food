// A check of the published site against its real database, after the rules were pasted:
//   npm run check:live -- https://<you>.github.io/neighbor-food/ <entrance key>
// Two invisible browsers enter the entrance, one posts a test offer, the other takes it, and the
// test offer is deleted. Then it asks the database for things it must refuse.
// Use it on a test entrance, or before the poster is on the wall.
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { emulatorEnv, root } from './env.mjs';

Object.assign(process.env, emulatorEnv());
const { chromium, devices } = await import('@playwright/test');

const [site, key] = process.argv.slice(2);
if (!site || !key) {
  console.error('usage: npm run check:live -- <site address ending in /> <entrance key>');
  process.exit(2);
}

function config() {
  const file = join(root, '.env.local');
  const line = existsSync(file) ? readFileSync(file, 'utf8').split(/\r?\n/).find((l) => l.startsWith('VITE_FIREBASE_CONFIG=')) : undefined;
  const raw = process.env.FIREBASE_CONFIG ?? line?.slice('VITE_FIREBASE_CONFIG='.length).replace(/^'|'$/g, '');
  return raw ? JSON.parse(raw) : null;
}

let failed = false;
const report = (ok, what) => {
  failed ||= !ok;
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${what}`);
};

const browser = await chromium.launch();
/** Database projects the site itself talked to. */
const projects = new Set();
const enter = async () => {
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-GB' });
  const page = await context.newPage();
  page.on('request', (request) => {
    const match = decodeURIComponent(request.url()).match(/projects\/([a-z0-9-]+)(\/|%2F)/);
    if (match) projects.add(match[1]);
  });
  await page.goto(`${site}#/e/${key}`);
  await page.getByRole('button', { name: /^Enter/ }).click();
  await page.getByRole('button', { name: 'Treat or ask' }).waitFor();
  return page;
};

try {
  const author = await enter();
  const guest = await enter();
  report(true, 'two phones signed in and see the house');

  const title = `Check ${Date.now().toString(36)}`;
  await author.getByRole('button', { name: 'Treat or ask' }).click();
  await author.getByLabel('What?').fill(title);
  await author.locator('dialog label.choice', { hasText: 'Tomorrow' }).click();
  await author.getByRole('button', { name: 'Light the window' }).click();
  await author.getByRole('heading', { name: 'Send it to the building chat' }).waitFor();
  await author.getByRole('button', { name: 'Close' }).click();
  report(true, 'a test offer was published');

  const row = (page) => page.locator('.row', { hasText: title });
  await row(guest).locator('.row-head').click();
  await row(guest).getByRole('button', { name: 'Take a portion' }).click();
  await guest.getByRole('button', { name: 'Confirm' }).click();
  await row(guest).getByText('Your portion', { exact: true }).waitFor();
  report(true, 'the other phone took a portion');

  await row(author).locator('.row-head').click();
  await row(author).getByRole('button', { name: 'Delete' }).click();
  await author.locator('dialog').getByRole('button', { name: 'Delete' }).click();
  await row(guest).waitFor({ state: 'detached' });
  report(true, 'the test offer was deleted');
} catch (error) {
  report(false, `the two-phone walk stopped: ${String(error.message).split('\n')[0]}`);
} finally {
  await browser.close();
}

const web = config();
if (!web) {
  report(false, 'refusals not checked: no FIREBASE_CONFIG here (environment or .env.local)');
} else {
  report(projects.size === 1 && projects.has(web.projectId), `the site uses the project you configured (${web.projectId}; seen: ${[...projects].join(', ') || 'not visible'})`);
  const documents = `https://firestore.googleapis.com/v1/projects/${web.projectId}/databases/(default)/documents`;
  // The key is limited to the site's address, so the same address is sent along.
  const headers = { Referer: new URL(site).href };
  const ask = (path, options = {}) =>
    fetch(`${documents}/${path}${path.includes('?') ? '&' : '?'}key=${web.apiKey}`, { ...options, headers: { ...headers, ...options.headers } });
  const refused = async (what, path, who, options) => {
    const response = await ask(path, options);
    report(response.status === 401 || response.status === 403, `refused ${who}: ${what} (${response.status})`);
  };
  const secrets = [
    ['the organiser code', 'config/owner'],
    ['the list of entrances', 'entrances'],
    ['the create record', `entrances/${key}/private/create`],
  ];
  for (const [what, path] of secrets) await refused(what, path, 'without sign-in');
  await refused('the posts of the entrance', `entrances/${key}/posts?pageSize=1`, 'without sign-in');

  // The same questions from someone who did sign in: rules that only ask for that would pass above.
  const signUp = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${web.apiKey}`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const { idToken } = await signUp.json();
  if (!idToken) {
    report(false, `could not sign in to ask as a neighbour (${signUp.status})`);
  } else {
    const signedIn = { headers: { Authorization: `Bearer ${idToken}` } };
    for (const [what, path] of secrets) await refused(what, path, 'to a signed-in stranger', signedIn);
    await refused('creating an entrance without the code', `entrances?documentId=refused-check-${Date.now()}`, 'to a signed-in stranger', {
      method: 'POST',
      headers: { ...signedIn.headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { name: { stringValue: 'check' } } }),
    });
  }
}

process.exit(failed ? 1 : 0);
