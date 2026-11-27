import { expect, test } from '@playwright/test';
import { openRow, row, watch } from './helpers';

test('the demonstration works without asking anyone outside the site', async ({ page, baseURL }) => {
  const seen = await watch(page);
  await page.goto('');
  await expect(page.getByRole('heading', { level: 1, name: '4 Sunny Street' })).toBeVisible();
  await expect(page.getByText(/the neighbours are invented/)).toBeVisible();
  await expect(page.getByRole('group', { name: /The house: \d treats, 2 requests/ })).toBeVisible();

  // The first row is on screen without scrolling, and the house keeps to its share.
  const viewport = page.viewportSize() as { width: number; height: number };
  const house = await page.locator('svg.house').boundingBox();
  expect(house?.height).toBeLessThanOrEqual(viewport.height * 0.43);
  await expect(page.locator('.row').first()).toBeInViewport();

  await openRow(page, 'Tomato soup');
  await row(page, 'Tomato soup').getByRole('button', { name: 'Take a portion' }).click();
  await page.getByRole('button', { name: 'Confirm' }).click();
  await expect(row(page, 'Tomato soup').getByText('Your portion', { exact: true })).toBeVisible();

  const download = page.waitForEvent('download');
  await row(page, 'Tomato soup').getByRole('button', { name: 'Add to calendar' }).click();
  expect((await download).suggestedFilename()).toBe('neighbor-food.ics');

  await page.getByRole('button', { name: 'Treat or ask' }).click();
  await page.getByRole('button', { name: 'Light the window' }).click();
  await expect(page.getByText('Fill this in')).toBeVisible();
  await page.getByLabel('What?').fill('Borscht');
  await page.locator('dialog label.choice', { hasText: 'Tomorrow' }).click();
  await page.getByRole('button', { name: 'Light the window' }).click();
  await expect(page.getByRole('heading', { name: 'Send it to the building chat' })).toBeVisible();
  await page.goBack();
  await expect(page.locator('dialog')).toHaveCount(0);
  await expect(row(page, 'Borscht')).toBeVisible();

  await page.getByRole('button', { name: 'Menu' }).click();
  await page.locator('dialog [data-lang="ru"]').click();
  await expect(page.getByRole('button', { name: 'Угостить или попросить' })).toBeVisible();
  await expect(row(page, 'Томатный супчик')).toBeVisible();
  await expect(row(page, 'Borscht')).toBeVisible();

  const origin = new URL(baseURL as string).origin;
  expect(seen.requests.filter((url) => !url.startsWith(origin) && !url.startsWith('blob:'))).toEqual([]);
  expect(seen.requests.filter((url) => /firestore-|\/firestore\./.test(url))).toEqual([]);
  expect(seen.problems).toEqual([]);
});

test('the demonstration poster is one A4 page', async ({ page }) => {
  await page.goto('#/demo/poster');
  const sheet = page.locator('main.poster');
  await expect(sheet.locator('svg.poster-qr')).toBeVisible();
  expect(await sheet.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true);
  const pdf = (await page.pdf({ preferCSSPageSize: true })).toString('latin1');
  expect(pdf.match(/\/Type\s*\/Page[^s]/g)).toHaveLength(1);
});

test('works on a narrow screen with enlarged text', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 640 });
  for (const code of ['pl', 'ru']) {
    await page.goto('');
    await page.evaluate((lang) => localStorage.setItem('nf:/neighbor-food/:lang', lang), code);
    await page.reload();
    await page.addStyleTag({ content: 'html{font-size:20px}' }).catch(() => undefined);
    await page.evaluate(() => (document.documentElement.style.fontSize = '20px'));
    await expect(page.locator('.row').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320);
  }
});

test('says what is stored', async ({ page }) => {
  await page.goto('#/about');
  await expect(page.getByRole('heading', { name: 'What is stored' })).toBeVisible();
  await expect(page.getByText(/United States/)).toBeVisible();
});

test('markup typed into a field stays text', async ({ page }) => {
  const seen = await watch(page);
  await page.goto('');
  const markup = '<img src=x onerror=alert(1)>';
  await page.getByRole('button', { name: 'Treat or ask' }).click();
  await page.getByLabel('What?').fill(markup);
  await page.getByLabel('Where?').fill('<b>bold</b>');
  await page.getByLabel(/Your name/).fill('<i>me</i>');
  await page.locator('dialog label.choice', { hasText: 'Tomorrow' }).click();
  await page.getByRole('button', { name: 'Light the window' }).click();
  await expect(page.getByRole('heading', { name: 'Send it to the building chat' })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await openRow(page, markup);
  await expect(row(page, markup)).toContainText('<b>bold</b>');
  await expect(page.locator('.list img, .list b, .list i')).toHaveCount(0);
  expect(seen.problems).toEqual([]);
});
