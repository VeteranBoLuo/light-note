/** Verifies directory links on the real file table using isolated in-memory API fixtures. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-cloud-folder-navigation';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ width: 1440, theme, density })),
  ),
  { width: 1280, theme: 'day', density: 'large', lang: 'en' },
  ...['day', 'night'].map((theme) => ({ width: 390, theme, density: 'medium' })),
];
const results = [];
const waitFolder = (page, id, total) =>
  page.waitForFunction(
    ({ id, total }) => {
      const cloud = window.__cloudBatchFixture?.cloud;
      return cloud && cloud.folder.id === id && cloud.fileTotal === total && !cloud.loading;
    },
    { id, total },
  );
async function showAll(page) {
  await page.evaluate(async () => {
    const cloud = window.__cloudBatchFixture.cloud;
    cloud.folder = { id: 'all', name: '全部文件' };
    await cloud.queryFieldList();
  });
  await waitFolder(page, 'all', 60);
}
try {
  for (const profile of profiles) {
    const page = await browser.newPage({ viewport: { width: profile.width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const query = new URLSearchParams({
      scope: '1',
      view: 'table',
      count: '60',
      theme: profile.theme,
      density: profile.density,
      lang: profile.lang || 'zh',
      renderProfile: profile.width < 768 ? 'mobile' : 'desktop',
    });
    await page.goto(`${origin}/e2e/cloud-scroll.html?${query}`);
    await waitFolder(page, '1', 1);
    await showAll(page);
    if (profile.width < 768) {
      assert.equal(await page.locator('.file-table-folder').count(), 0, 'desktop links stay out of mobile rows');
      assert((await page.locator('.field-item').count()) > 0);
    } else {
      const target = page
        .locator('.file-table-folder .cloud-folder-breadcrumb__link')
        .filter({ hasText: '原片' })
        .first();
      await target.waitFor();
      const defaultColor = await target.evaluate((el) => getComputedStyle(el).color);
      assert.equal(defaultColor, await target.evaluate((el) => getComputedStyle(el.closest('.default-area')).color));
      await page.screenshot({ path: `${output}/${profile.width}-${profile.theme}-${profile.density}.png` });
      await target.hover();
      await page.waitForFunction(
        ({ color }) => {
          const el = [...document.querySelectorAll('.file-table-folder .cloud-folder-breadcrumb__link')].find((el) =>
            el.textContent.includes('原片'),
          );
          return el && getComputedStyle(el).color !== color;
        },
        { color: defaultColor },
      );
      assert.equal(await target.locator('span').evaluate((el) => getComputedStyle(el).textDecorationLine), 'underline');
      await target.focus();
      await page.screenshot({ path: `${output}/${profile.width}-${profile.theme}-${profile.density}-focus.png` });
      await page.mouse.move(0, 0);
      await page.waitForFunction(
        ({ color }) => {
          const el = [...document.querySelectorAll('.file-table-folder .cloud-folder-breadcrumb__link')].find((el) =>
            el.textContent.includes('原片'),
          );
          return el && getComputedStyle(el).color === color;
        },
        { color: defaultColor },
      );
      await page.locator('.cloud-scope-trigger').click();
      await page.locator('.cloud-scope-option').nth(1).click();
      await page.waitForFunction(() => window.__cloudBatchFixture.cloud.includeDescendants);
      await page.evaluate(() => {
        const cloud = window.__cloudBatchFixture.cloud;
        cloud.searchFileName = '滚动验收资料';
        cloud.typeCheckValue = ['compress'];
      });
      await target.click();
      await waitFolder(page, '3', 30);
      assert.equal(
        await page.locator('.cloud-folder-row.is-current .cloud-folder-row__name').textContent(),
        '原片',
        'sidebar selection stays synchronized',
      );
      const state = await page.evaluate(() => {
        const f = window.__cloudBatchFixture;
        return {
          folder: f.cloud.folder,
          search: f.cloud.searchFileName,
          types: f.cloud.typeCheckValue,
          descendants: f.cloud.includeDescendants,
          request: f.requests.filter((r) => r.url.endsWith('/queryFiles')).at(-1).body,
        };
      });
      assert.equal(state.folder.name, '原片');
      assert.equal(state.search, '滚动验收资料');
      assert.deepEqual(state.types, ['compress']);
      assert.equal(state.descendants, true);
      assert.equal(state.request.filters.folderId, '3');
      assert.equal(state.request.filters.includeDescendants, true);
      assert.equal(state.request.currentPage, 1);
      assert.equal(await page.locator('.fullscreen-preview').count(), 0);

      await showAll(page);
      const path = page.locator('.file-table-folder').filter({ hasText: '原片' }).first();
      await path.locator('.cloud-folder-breadcrumb__separator').first().click();
      assert.equal(await page.evaluate(() => window.__cloudBatchFixture.cloud.folder.id), 'all');
      assert.equal(await page.locator('.fullscreen-preview').count(), 0);
      await path
        .locator('button')
        .filter({ hasText: /^旅游$/ })
        .click();
      await waitFolder(page, '1', 60);
      await showAll(page);
      await path
        .locator('button')
        .filter({ hasText: /^2026 旅行$/ })
        .click();
      await waitFolder(page, '2', 59);
      await showAll(page);
      await page.evaluate(() => window.__cloudBatchFixture.enterBatch());
      await page.waitForFunction(() => !document.querySelector('.file-table-folder'));
      await page.locator('.field-item .default-area > div').first().click();
      assert.equal(await page.evaluate(() => window.__cloudBatchFixture.selection.count), 1);
      assert.equal(await page.evaluate(() => window.__cloudBatchFixture.cloud.folder.id), 'all');
      await page.evaluate(() => window.__cloudBatchFixture.selection.end());
      await target.waitFor();
      await page.evaluate(() => {
        window.__cloudBatchFixture.cloud.loading = true;
      });
      assert.equal(await target.isDisabled(), true);
      await page.evaluate(() => {
        window.__cloudBatchFixture.cloud.loading = false;
      });
      for (const key of ['Enter', 'Space']) {
        await target.focus();
        await page.keyboard.press(key);
        await waitFolder(page, '3', 30);
        assert.equal(await page.getByRole('menu').count(), 0, 'keyboard activation does not open the file menu');
        assert.equal(await page.locator('.fullscreen-preview').count(), 0);
        await showAll(page);
      }
      // A missing directory stays plain text; long paths remain inside their table cell.
      await page.evaluate(() => {
        const cloud = window.__cloudBatchFixture.cloud;
        cloud.fileList[0].folderId = undefined;
        cloud.fileList[0].folderName = '';
        const folder = cloud.folderList.find((item) => item.id === '3');
        folder.name = '很长的旅行资料目录名称用于检查换行 / 原片';
        folder.fullPath = '旅游 / 2026 旅行 / ' + folder.name;
      });
      assert.equal(await page.locator('.field-item').first().locator('.file-table-folder').count(), 0);
      const bounds = await target.evaluate((el) => ({
        width: el.getBoundingClientRect().width,
        cell: el.parentElement.getBoundingClientRect().width,
        overflow: el.scrollWidth > el.clientWidth,
      }));
      assert(bounds.width <= bounds.cell && !bounds.overflow);
      await page.screenshot({ path: `${output}/${profile.width}-${profile.theme}-${profile.density}-long.png` });
    }
    assert.deepEqual(errors, []);
    results.push({ ...profile, passed: true });
    await page.close();
  }
  for (const width of [1440, 390])
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      await page.goto(
        `${origin}/e2e/cloud-scroll.html?scope&view=card&count=60&theme=${theme}&renderProfile=${width < 768 ? 'mobile' : 'desktop'}`,
      );
      await waitFolder(page, '1', 1);
      await showAll(page);
      const path = page.locator('.file-card-folder').filter({ hasText: '原片' }).first();
      assert.equal(await path.locator('button').count(), 3);
      for (const [name, id, total] of [
        ['旅游', '1', 1],
        ['2026 旅行', '2', 29],
        ['原片', '3', 30],
      ]) {
        await path.locator('button').filter({ hasText: name }).click();
        await waitFolder(page, id, total);
        assert.equal(await page.locator('.fullscreen-preview').count(), 0);
        await showAll(page);
      }
      await page.screenshot({ path: `${output}/${width}-${theme}-card.png` });
      await page.evaluate(() => window.__cloudBatchFixture.enterBatch());
      assert.equal(await path.locator('button:enabled').count(), 0);
      await path.locator('.cloud-folder-breadcrumb__separator').first().click();
      assert.equal(await page.evaluate(() => window.__cloudBatchFixture.cloud.folder.id), 'all');
      assert.deepEqual(errors, []);
      results.push({ width, theme, view: 'card', passed: true });
      await page.close();
    }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }));
} finally {
  await browser.close();
}
