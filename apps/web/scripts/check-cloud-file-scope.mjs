/** Exercises the real cloud page with isolated in-memory API fixtures; never writes business data. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-cloud-file-scope';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const results = [];
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ width: 1440, theme, density })),
  ),
  { width: 1280, theme: 'day', density: 'large', lang: 'en' },
  ...['day', 'night'].map((theme) => ({ width: 390, theme, density: 'medium' })),
];
const waitScope = (page, value, total) =>
  page.waitForFunction(
    ({ value, total }) => {
      const cloud = window.__cloudBatchFixture?.cloud;
      return cloud && cloud.includeDescendants === value && cloud.fileTotal === total && !cloud.loading;
    },
    { value, total },
  );
async function openScope(page, mobile) {
  if (mobile) await page.evaluate(() => window.__cloudBatchFixture.openMore());
  else await page.locator('.cloud-scope-trigger').click();
  await page.locator(mobile ? '.mobile-cloud-scope' : '.cloud-scope-menu').waitFor();
  await page.waitForTimeout(250);
}
async function choose(page, mobile, value) {
  if (mobile) await page.locator('.mobile-cloud-scope [role=switch]').click();
  else
    await page
      .locator('.cloud-scope-option')
      .nth(value ? 1 : 0)
      .click();
}
try {
  for (const profile of profiles) {
    const mobile = profile.width < 768;
    const page = await browser.newPage({ viewport: { width: profile.width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if (url.origin !== origin) return route.abort();
      if (url.pathname.startsWith('/__cloud-upload-fixture__/')) return route.fulfill({ status: 200, body: '' });
      return route.continue();
    });
    const query = new URLSearchParams({
      scope: '1',
      paged: '1',
      count: '125',
      view: 'card',
      theme: profile.theme,
      density: profile.density,
      renderProfile: mobile ? 'mobile' : 'desktop',
      lang: profile.lang || 'zh',
    });
    await page.goto(`${origin}/e2e/cloud-scroll.html?${query}`);
    await waitScope(page, false, 1);
    await page.waitForFunction(() => window.__cloudBatchFixture.cloud.folder.id === '1');
    const top = await page.locator('.content-area').evaluate((el) => el.getBoundingClientRect().top);
    if (!mobile && profile.theme === 'day' && profile.density === 'medium') {
      await page.locator('.cloud-scope-trigger').focus();
      await page.keyboard.press('ArrowDown');
      await page.waitForFunction(() => document.activeElement?.matches('.cloud-scope-option'));
      await page.keyboard.press('ArrowDown');
      assert.equal(
        await page
          .locator('.cloud-scope-option')
          .nth(1)
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => document.activeElement?.matches('.cloud-scope-trigger'));
    }
    await openScope(page, mobile);
    await page.screenshot({ path: `${output}/${profile.width}-${profile.theme}-${profile.density}-menu.png` });
    await page.evaluate(() => {
      const f = window.__cloudBatchFixture;
      f.enterBatch();
      f.selection.setItems([{ id: String(f.files[0].id), type: 'file', title: f.files[0].fileName }]);
    });
    await choose(page, mobile, true);
    await waitScope(page, true, 100);
    assert.equal(
      await page.evaluate(() => window.__cloudBatchFixture.selection.count),
      0,
      'scope change clears old batch selection',
    );
    await page.evaluate(() => window.__cloudBatchFixture.selection.end());
    if (mobile) {
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${output}/${profile.width}-${profile.theme}-${profile.density}-enabled.png` });
      await page.keyboard.press('Escape');
    }
    const after = await page.locator('.content-area').evaluate((el) => el.getBoundingClientRect().top);
    assert(Math.abs(top - after) < 2, 'changing scope must not add a content-area settings bar or header row');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false);
    assert.equal(
      await page.evaluate(() => window.__cloudBatchFixture.cloud.folder.id),
      '1',
      'upload destination remains the selected parent',
    );
    assert(
      (await page.locator('.file-card-folder').first().count()) || (await page.locator('.file-card').first().count()),
    );
    await page.screenshot({ path: `${output}/${profile.width}-${profile.theme}-${profile.density}-files.png` });

    // Pagination and refreshing loaded pages use the same scope, not merely the first visible page.
    await page.evaluate(async () => {
      const cloud = window.__cloudBatchFixture.cloud;
      await cloud.loadMoreFiles();
      await cloud.refreshLoadedFiles();
    });
    const queries = await page.evaluate(() =>
      window.__cloudBatchFixture.requests.filter((r) => r.url.endsWith('/queryFiles')).map((r) => r.body),
    );
    assert(queries.some((body) => body.currentPage === 2 && body.filters.includeDescendants === true));
    assert.equal(
      await page.evaluate(() => window.__cloudBatchFixture.cloud.fileList.some((item) => item.folderId === '4')),
      false,
    );

    // Search remains in the selected folder tree and cannot pull matching files from a sibling tree.
    await page.evaluate(async () => {
      const cloud = window.__cloudBatchFixture.cloud;
      cloud.searchFileName = '125.zip';
      await cloud.queryFieldList();
    });
    await waitScope(page, true, 0);
    assert.match(await page.locator('.file-empty-state').innerText(), /筛选|filters/);
    await page.evaluate(async () => {
      const cloud = window.__cloudBatchFixture.cloud;
      cloud.searchFileName = '';
      await cloud.queryFieldList();
    });
    await waitScope(page, true, 100);

    // Failed account save keeps both the previous choice and list intact; retry restores the intended choice.
    await openScope(page, mobile);
    await page.evaluate(() => {
      window.__cloudBatchFixture.controls.failNextPreferenceWrite = true;
    });
    await choose(page, mobile, false);
    await page.locator(mobile ? '.mobile-cloud-scope__error' : '.cloud-scope-error').waitFor();
    await waitScope(page, true, 100);
    await page.locator(mobile ? '.mobile-cloud-scope__error button' : '.cloud-scope-error button').click();
    await waitScope(page, false, 1);
    if (mobile) await page.keyboard.press('Escape');
    await page.reload();
    await waitScope(page, false, 1);
    await openScope(page, mobile);
    await choose(page, mobile, true);
    await waitScope(page, true, 100);
    if (mobile) await page.keyboard.press('Escape');
    await page.reload();
    await waitScope(page, true, 100);

    if (!mobile && profile.theme === 'day' && profile.density === 'medium') {
      // Use the real upload picker and confirmation path while the tree view is enabled.
      const picking = page.waitForEvent('filechooser');
      await page.locator('.upload-action').click();
      await (
        await picking
      ).setFiles({ name: 'scope-upload.zip', mimeType: 'application/zip', buffer: Buffer.from('cloud scope test') });
      await page.waitForFunction(() =>
        window.__cloudBatchFixture.requests.some((r) => r.url.endsWith('/confirmUpload')),
      );
      const uploads = await page.evaluate(() =>
        window.__cloudBatchFixture.requests.filter((r) => r.url.endsWith('/confirmUpload')),
      );
      assert.equal(
        String(uploads.at(-1).body.folderId),
        '1',
        'tree view must upload into the explicitly selected parent',
      );
    }
    assert.deepEqual(errors, []);
    results.push({ ...profile, passed: true });
    await page.close();
  }
  // An empty parent offers a clear one-click entry, while a failed query is never presented as empty.
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(`${origin}/e2e/cloud-scroll.html?scope&directEmpty&view=card&count=60`);
  await waitScope(page, false, 0);
  await page.getByRole('button', { name: '查看子文件夹里的 60 个文件', exact: true }).click();
  await waitScope(page, true, 60);
  await openScope(page, false);
  await page.evaluate(() => {
    window.__cloudBatchFixture.controls.failNextListRead = true;
  });
  await choose(page, false, false);
  await page.getByText('文件加载失败，请重试', { exact: true }).waitFor();
  assert.equal(await page.getByText('文件都放在子文件夹里', { exact: true }).count(), 0);
  await page.locator('.file-empty-state').getByRole('button', { name: '重新加载', exact: true }).click();
  await waitScope(page, false, 0);
  await page.getByText('文件都放在子文件夹里', { exact: true }).waitFor();
  await page.screenshot({ path: `${output}/empty-parent.png` });
  await page.goto(`${origin}/e2e/cloud-scroll.html?scope&view=card&count=60`);
  await waitScope(page, false, 1);
  await page.evaluate(() => {
    window.__cloudBatchFixture.controls.holdPreferenceWrite = true;
  });
  await openScope(page, false);
  await choose(page, false, true);
  await page.evaluate(() => {
    const f = window.__cloudBatchFixture;
    f.enterBatch();
    f.selection.setItems([{ id: String(f.files[0].id), type: 'file', title: f.files[0].fileName }]);
    f.pendingOperation = f.selection.beginOperation();
    f.controls.releasePreferenceWrite();
  });
  await page.waitForFunction(() => window.__cloudBatchFixture.cloud.includeDescendants);
  assert.equal(
    await page.evaluate(() => window.__cloudBatchFixture.selection.count),
    1,
    'confirmed preference cannot invalidate an in-flight batch operation',
  );
  assert.equal(
    await page.evaluate(() => window.__cloudBatchFixture.cloud.fileTotal),
    1,
    'defer list switch until the operation finishes',
  );
  assert.equal(
    await page.evaluate(() =>
      window.__cloudBatchFixture.selection.isCurrent(window.__cloudBatchFixture.pendingOperation),
    ),
    true,
  );
  await page.evaluate(() => {
    const f = window.__cloudBatchFixture;
    f.selection.finish(f.pendingOperation);
  });
  await waitScope(page, true, 60);
  assert.equal(await page.evaluate(() => window.__cloudBatchFixture.selection.count), 0);
  // The all-files view explains that the preference applies to individual folders, without reflowing the table.
  for (const theme of ['day', 'night']) {
    const allPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await allPage.goto(`${origin}/e2e/cloud-scroll.html?scope&view=table&count=125&theme=${theme}`);
    await waitScope(allPage, false, 1);
    await allPage.evaluate(async () => {
      const cloud = window.__cloudBatchFixture.cloud;
      cloud.folder = { id: 'all', name: '全部文件' };
      await cloud.queryFieldList();
    });
    await waitScope(allPage, false, 125);
    const contentTop = await allPage.locator('.content-area').evaluate((el) => el.getBoundingClientRect().top);
    await openScope(allPage, false);
    await allPage.getByText('“全部文件”始终显示所有文件，此设置用于具体文件夹。', { exact: true }).waitFor();
    const trigger = await allPage.locator('.cloud-scope-trigger').boundingBox();
    const panel = await allPage.locator('.cloud-scope-popover').boundingBox();
    assert(trigger && panel && Math.abs(trigger.x - panel.x) <= 1, 'menu follows the left edge of its trigger');
    assert(panel.x >= 0 && panel.x + panel.width <= 1440, 'menu stays within the viewport');
    assert.equal(await allPage.locator('.content-area').evaluate((el) => el.getBoundingClientRect().top), contentTop);
    await allPage.screenshot({ path: `${output}/all-files-table-${theme}.png` });
    results.push({ width: 1440, theme, view: 'table', scope: 'all', passed: true });
    await allPage.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }));
} finally {
  await browser.close();
}
