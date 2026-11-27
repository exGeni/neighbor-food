// Two phones against the local emulators.
import { expect, test } from '@playwright/test';
import { createEntrance, enter, OWNER_CODE, openRow, phone, row, setOwnerCode } from './helpers';

test.beforeAll(setOwnerCode);

/** Requests to anyone but the site itself and the database. */
const strangers = (urls: string[]) => urls.filter((url) => !/^(http:\/\/localhost:4174\/|http:\/\/127\.0\.0\.1:(9099|8080)\/|blob:)/.test(url));

async function publish(page: import('@playwright/test').Page, what: string, portions?: number): Promise<void> {
  await page.getByRole('button', { name: 'Treat or ask' }).click();
  await page.getByLabel('What?').fill(what);
  await page.locator('dialog label.choice', { hasText: 'Tomorrow' }).click();
  if (portions) await page.getByLabel('Portions', { exact: true }).fill(String(portions));
  await page.getByRole('button', { name: 'Light the window' }).click();
  await expect(page.getByRole('heading', { name: 'Send it to the building chat' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
}

test('offer and take, then cancel', async ({ browser }) => {
  const organiser = await phone(browser);
  const guest = await phone(browser);
  const key = await createEntrance(organiser.page);

  await guest.page.goto(`#/e/${key}`);
  await expect(guest.page.getByRole('heading', { name: 'Test hall' })).toBeVisible();
  await expect(guest.page.getByRole('button', { name: 'Enter', exact: true })).toBeInViewport();
  // Nobody is signed in before pressing Enter.
  expect(guest.seen.requests.filter((url) => url.includes(':9099'))).toEqual([]);
  await enter(guest.page, key);
  await expect(guest.page.getByText('Quiet for now. Treat first.')).toBeVisible();

  await organiser.page.goto(`#/e/${key}`);
  await publish(organiser.page, 'Soup', 2);

  await openRow(guest.page, 'Soup');
  await expect(row(guest.page, 'Soup')).toContainText('2 portions left');
  await row(guest.page, 'Soup').getByRole('button', { name: 'Take a portion' }).click();
  await guest.page.getByLabel(/Your name/).fill('Bo');
  await guest.page.getByRole('button', { name: 'Confirm' }).click();
  await expect(row(guest.page, 'Soup').getByText('Your portion', { exact: true })).toBeVisible();
  await expect(row(guest.page, 'Soup')).toContainText('1 portion left');

  await expect(row(organiser.page, 'Soup')).toContainText('1 new');
  await openRow(organiser.page, 'Soup');
  await expect(row(organiser.page, 'Soup').getByRole('listitem')).toHaveText('Bo');

  // A reload keeps the person.
  await guest.page.reload();
  await expect(row(guest.page, 'Soup')).toContainText('Your portion');
  await openRow(guest.page, 'Soup');
  await row(guest.page, 'Soup').getByRole('button', { name: 'Cancel' }).click();
  await expect(row(guest.page, 'Soup')).toContainText('2 portions left');
  await expect(row(organiser.page, 'Soup')).toContainText('2 portions left');

  // Deleting reaches the neighbour, who had replied.
  await row(guest.page, 'Soup').getByRole('button', { name: 'Take a portion' }).click();
  await guest.page.getByRole('button', { name: 'Confirm' }).click();
  await expect(row(organiser.page, 'Soup')).toContainText('1 portion left');
  await row(organiser.page, 'Soup').getByRole('button', { name: 'Delete' }).click();
  await expect(organiser.page.getByText('1 neighbour has answered it.')).toBeVisible();
  await organiser.page.locator('dialog').getByRole('button', { name: 'Delete' }).click();
  await expect(guest.page.getByText('"Soup" that you answered was removed.')).toBeVisible();
  await expect(row(guest.page, 'Soup')).toHaveCount(0);

  expect(organiser.seen.problems).toEqual([]);
  expect(guest.seen.problems).toEqual([]);
  expect(strangers([...organiser.seen.requests, ...guest.seen.requests])).toEqual([]);
  await organiser.context.close();
  await guest.context.close();
});

test('ask and reply', async ({ browser }) => {
  const organiser = await phone(browser);
  const guest = await phone(browser);
  const key = await createEntrance(organiser.page);
  await enter(guest.page, key);

  await guest.page.getByRole('button', { name: 'Treat or ask' }).click();
  await guest.page.locator('dialog label.choice', { hasText: "I'm asking" }).click();
  await guest.page.getByLabel('What?').fill('Flour');
  await guest.page.locator('dialog label.choice', { hasText: 'This week' }).click();
  await guest.page.getByRole('button', { name: 'Ask the neighbours' }).click();
  await expect(row(guest.page, 'Flour')).toBeVisible();

  await organiser.page.goto(`#/e/${key}`);
  await openRow(organiser.page, 'Flour');
  await row(organiser.page, 'Flour').getByRole('button', { name: 'I can' }).click();
  await organiser.page.getByRole('button', { name: 'Confirm' }).click();
  await expect(organiser.page.getByText('Fill this in')).toBeVisible();
  await organiser.page.getByLabel('When and where you can').fill('At 7 in the hall');
  await organiser.page.getByRole('button', { name: 'Confirm' }).click();
  await expect(row(organiser.page, 'Flour')).toContainText('You offered to help');

  await openRow(guest.page, 'Flour');
  await expect(row(guest.page, 'Flour').getByRole('listitem')).toHaveText('neighbour 1: At 7 in the hall');

  expect(organiser.seen.problems).toEqual([]);
  expect(guest.seen.problems).toEqual([]);
  expect(strangers([...organiser.seen.requests, ...guest.seen.requests])).toEqual([]);
  await organiser.context.close();
  await guest.context.close();
});

test('a link from the chat opens the offer; the poster fits long names', async ({ browser }) => {
  const organiser = await phone(browser);
  const guest = await phone(browser);
  const key = await createEntrance(organiser.page, 'Ж'.repeat(40), 'щ'.repeat(60));
  const sheet = organiser.page.locator('main.poster');
  expect(await sheet.evaluate((element) => element.scrollHeight <= element.clientHeight && element.scrollWidth <= element.clientWidth)).toBe(true);

  await organiser.page.goto(`#/e/${key}`);
  await publish(organiser.page, 'Pie');
  const id = await row(organiser.page, 'Pie').getAttribute('data-id');

  await guest.page.goto(`#/e/${key}?p=${id}`);
  await guest.page.getByRole('button', { name: 'Enter to see this offer' }).click();
  await expect(row(guest.page, 'Pie').getByRole('button', { name: 'Take a portion' })).toBeVisible();

  await guest.page.goto(`#/e/${key}?p=nothing-here`);
  await expect(guest.page.getByText('This treat is over. See the others.')).toBeVisible();

  await guest.context.setOffline(true);
  await expect(guest.page.getByText('No network. Posting and taking are off.')).toBeVisible();
  await expect(guest.page.getByRole('button', { name: 'Treat or ask' })).toBeDisabled();
  await guest.context.setOffline(false);
  await expect(guest.page.getByRole('button', { name: 'Treat or ask' })).toBeEnabled();

  await organiser.context.close();
  await guest.context.close();
});

test('refuses a wrong link and a wrong organiser code', async ({ page }) => {
  await page.goto(`#/e/${'x'.repeat(22)}`);
  await expect(page.getByText(/This link does not work any more/)).toBeVisible();
  await expect(page.getByRole('button', { name: /^Enter/ })).toHaveCount(0);

  await page.goto('#/new');
  await page.getByLabel('Organiser code').fill(`${OWNER_CODE}-wrong`);
  await page.getByLabel('Entrance name').fill('Hall');
  await page.getByLabel(/How to reach you/).fill('Ann');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await expect(page.locator('[data-code="NF-NEW-REFUSED"]')).toBeVisible();
});
