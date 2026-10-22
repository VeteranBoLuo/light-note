/** Real cloud list/card interactions with in-memory API fixtures; no business writes. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.CLOUD_RANGE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local Web dev server');
const output = process.env.CLOUD_RANGE_TEST_OUTPUT || join(tmpdir(), 'lightnote-cloud-range-selection');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const report = [];
const mobilePages = new WeakSet();
const profiles = [
  ...['table', 'card'].flatMap((view) =>
    ['day', 'night'].flatMap((theme) =>
      ['small', 'medium', 'large'].map((density) => ({ view, theme, density, width: 1440 })),
    ),
  ),
  ...['table', 'card'].flatMap((view) =>
    ['day', 'night'].map((theme) => ({ view, theme, width: 390, mobile: true, baseline: true })),
  ),
  { view: 'table', theme: 'night', width: 320, height: 568, mobile: true, baseline: true, lang: 'en' },
  { view: 'card', theme: 'day', width: 767, mobile: true, baseline: true },
  { view: 'table', theme: 'day', width: 390, mobile: true },
].filter((profile) => !process.env.CLOUD_RANGE_TEST_MOBILE_ONLY || profile.mobile);
const names = (id) => `滚动验收资料 ${id}.zip`;
const checkbox = (page, id) => page.getByRole('checkbox', { name: names(id), exact: true });
const selected = (page) =>
  page.evaluate(() => window.__cloudBatchFixture.selection.items.map((item) => item.id).sort());
const range = (start, end) => Array.from({ length: end - start + 1 }, (_, i) => String(start + i));
async function screenshot(page, path) {
  await page.mouse.move(0, 0);
  await page.waitForTimeout(200);
  await page.screenshot({ path });
}
async function scroll(page, top) {
  await page.locator('[data-mobile-resource-scroll]').evaluate((element, top) => {
    element.scrollTop = top;
  }, top);
  await page.waitForTimeout(80);
}
async function reach(page, id) {
  await scroll(page, 0);
  for (let step = 0; step < 240; step++) {
    const target = checkbox(page, id);
    if (await target.count()) {
      await target.evaluate((element) => element.scrollIntoView({ block: 'center' }));
      return target;
    }
    await page.locator('[data-mobile-resource-scroll]').evaluate((element) => {
      element.scrollTop += element.clientHeight * 0.7;
    });
    await page.waitForTimeout(80);
  }
  throw new Error(`Unable to reach file ${id}`);
}
async function pick(page, id, modifiers = []) {
  const target = await reach(page, id);
  if (mobilePages.has(page)) await target.tap();
  else await target.click({ modifiers });
}
async function checkSelection(page, ids) {
  try {
    await page.waitForFunction(
      (ids) => {
        const actual = window.__cloudBatchFixture.selection.items.map((item) => item.id).sort();
        return JSON.stringify(actual) === JSON.stringify(ids);
      },
      [...ids].sort(),
      { timeout: 5000 },
    );
  } catch (error) {
    assert.deepEqual(await selected(page), [...ids].sort(), `Selection did not settle: ${error.message}`);
    throw error;
  }
  assert.deepEqual(await selected(page), [...ids].sort());
}

try {
  for (const profile of profiles) {
    const id = [
      profile.view,
      profile.width,
      profile.theme,
      profile.density || 'standard',
      profile.lang || 'zh',
      profile.baseline ? 'baseline' : 'browser',
    ].join('-');
    const page = await browser.newPage({
      viewport: { width: profile.width, height: profile.height || 900 },
      hasTouch: !!profile.mobile,
      reducedMotion: 'reduce',
    });
    if (profile.mobile) mobilePages.add(page);
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const url = new URL('/e2e/cloud-scroll.html', origin);
    for (const [key, value] of Object.entries({
      ...profile,
      count: 144,
      paged: '',
      batch: '',
      numericIds: '',
      renderProfile: profile.baseline ? 'mobile' : '',
    }))
      url.searchParams.set(key, String(value));
    await page.goto(url.toString());
    await page.waitForFunction(() => window.__cloudBatchFixture && !window.__cloudBatchFixture.cloud.loading);
    await page.evaluate(() => window.__cloudBatchFixture.enterBatch());
    await checkbox(page, 1).waitFor();
    await pick(page, 1);
    if (profile.mobile) {
      const toggle = page.locator('.range-selection-toggle');
      await toggle.click();
      assert.equal(await toggle.getAttribute('aria-pressed'), 'true');
      await page
        .getByRole('status')
        .filter({ hasText: profile.lang ? 'Choose the first item' : '请点选起点' })
        .waitFor();
      await pick(page, 3);
      await checkSelection(page, ['1']);
      assert.equal(await checkbox(page, 3).getAttribute('aria-checked'), 'false');
      await page.locator('.file-range-start').waitFor();
      assert.equal(await page.locator('.resource-batch-action-bar__mobile-more').isDisabled(), true);
      await screenshot(page, join(output, `${id}-start.png`));
      await reach(page, 144);
      await page.locator('[data-mobile-resource-scroll]').evaluate((element) => {
        element.scrollTop = element.scrollHeight;
      });
      await page.waitForTimeout(200);
      const lastRowBottom = await checkbox(page, 144).evaluate(
        (element) => element.closest('.field-item,.file-card').getBoundingClientRect().bottom,
      );
      const barTop = (await page.locator('.resource-batch-action-bar--mobile').boundingBox()).y;
      assert(lastRowBottom <= barTop, `${id}: last file is hidden behind the batch bar`);
      await screenshot(page, join(output, `${id}-tail.png`));
      await pick(page, 70);
      assert.equal(await toggle.getAttribute('aria-pressed'), 'false');
    } else {
      await pick(page, 3);
      await pick(page, 7, ['Shift']);
      await checkSelection(page, ['1', ...range(3, 7)]);
      await (await reach(page, 9)).evaluate((element) => element.focus());
      await page.keyboard.press('Space');
      await (await reach(page, 12)).evaluate((element) => element.focus());
      await page.keyboard.press('Shift+Space');
      await checkSelection(page, ['1', ...range(3, 7), ...range(9, 12)]);
      await pick(page, 3); // Ordinary deselection also establishes the next anchor.
      await pick(page, 70, ['Shift']);
    }
    await checkSelection(page, ['1', ...range(3, 70)]);
    const crossPageLoaded = await page.evaluate(() => window.__cloudBatchFixture.cloud.fileList.length);
    assert(crossPageLoaded >= 70, `${id}: continuation pages were not loaded`);
    await pick(page, 6);
    await checkSelection(page, ['1', ...range(3, 70).filter((id) => id !== '6')]);
    await screenshot(page, join(output, `${id}-selected.png`));

    if (profile.mobile) {
      const before = await selected(page);
      await page.locator('.range-selection-toggle').click();
      await pick(page, 4);
      await page.locator('.range-selection-toggle').click();
      await checkSelection(page, before);
      assert.equal(await page.locator('.file-range-start').count(), 0);
      await page.locator('.range-selection-toggle').click();
      await pick(page, 4);
    }
    await page.evaluate(async () => {
      const fixture = window.__cloudBatchFixture;
      await fixture.cloud.setFileSort('fileName');
    });
    await page.waitForFunction(() => !window.__cloudBatchFixture.cloud.loading);
    if (profile.mobile) assert.equal(await page.locator('.range-selection-toggle').getAttribute('aria-pressed'), 'false');
    const beforeSingle = await selected(page);
    await pick(page, 2, profile.mobile ? [] : ['Shift']);
    await checkSelection(page, [...beforeSingle, '2']);

    await page.evaluate(() => window.__cloudBatchFixture.selection.clear());
    await checkSelection(page, []);
    if (profile.mobile) await page.locator('.range-selection-toggle').click();
    await pick(page, 12);
    await pick(page, 3, profile.mobile ? [] : ['Shift']);
    await checkSelection(page, range(3, 12));
    if (profile.mobile) {
      await page.locator('.range-selection-toggle').click();
      await pick(page, 20);
      await pick(page, 20);
      await checkSelection(page, [...range(3, 12), '20']);
    } else {
      await reach(page, 15);
      const nameSelector = profile.view === 'table' ? '.file-name' : '.file-card-name';
      const row = (id) => page.locator('.field-item,.file-card').filter({ has: checkbox(page, id) });
      await row(15).locator(nameSelector).click();
      await reach(page, 18);
      await row(18)
        .locator(nameSelector)
        .click({ modifiers: ['Shift'] });
      await checkSelection(page, [...range(3, 12), ...range(15, 18)]);
      assert.equal(
        await page.evaluate(() => window.getSelection()?.toString() || ''),
        '',
        `${id}: native text selection conflicts with Shift selection`,
      );
      await reach(page, 22);
      const bodySelector = profile.view === 'table' ? '.default-area' : '.file-card-placeholder';
      await row(22).locator(bodySelector).click();
      await pick(page, 25, ['Shift']);
      await checkSelection(page, [...range(3, 12), ...range(15, 18), ...range(22, 25)]);
    }
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1),
      false,
      `${id}: horizontal overflow`,
    );
    const metrics = await page.evaluate(() => ({
      rows: document.querySelectorAll('.field-item,.file-card').length,
      loaded: window.__cloudBatchFixture.cloud.fileList.length,
    }));
    assert(metrics.rows < metrics.loaded, `${id}: virtualization was lost`);
    assert.deepEqual(errors, [], `${id}: browser errors`);
    report.push({ id, ...metrics, crossPageLoaded });
    console.log('PASS', id);
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(join(output, 'results.json'), JSON.stringify(report, null, 2));
}
console.log(`Range selection screenshots: ${output}`);
