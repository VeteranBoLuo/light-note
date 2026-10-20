/** Real cloud UI with in-memory API fixtures. No business service or object storage is contacted. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.CLOUD_BATCH_TEST_ORIGIN || 'http://127.0.0.1:5182';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use the local Web dev server');
const output = process.env.CLOUD_BATCH_TEST_OUTPUT || join(tmpdir(), 'lightnote-cloud-batch');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ width: 1440, theme, density })),
  ),
  { width: 1280, theme: 'day', density: 'large', lang: 'en' },
  ...[320, 390].flatMap((width) => ['day', 'night'].map((theme) => ({ width, theme, mobile: true, baseline: true }))),
  { width: 390, theme: 'day', mobile: true },
  { width: 390, theme: 'night', mobile: true, baseline: true, lang: 'en' },
  { width: 320, height: 568, theme: 'night', mobile: true, baseline: true, lang: 'en' },
  { width: 1440, theme: 'day', density: 'medium', view: 'card' },
  { width: 1440, theme: 'night', density: 'medium', view: 'card' },
  { width: 390, theme: 'night', mobile: true, baseline: true, view: 'card' },
];
const labels = {
  more: /^(更多|More)$/i,
  move: /^(移动|批量移动|Move|Batch Move)$/i,
  tags: /^(管理标签|Manage Tags)$/i,
  add: /^(加入待整理|Add to inbox)$/i,
  complete: /^(标记整理完成|Mark as organized)$/i,
};
const errors = [];
const report = [];
async function ready(page) {
  await page.waitForFunction(() => {
    const x = window.__cloudBatchFixture;
    return x && !x.selection.busy && !x.cloud.loading && !x.cloud.loadingMore;
  });
}
function stable(before, after, label) {
  for (const field of ['x', 'y', 'width', 'height'])
    assert(Math.abs(before[field] - after[field]) < 0.5, `${label}: ${field} ${before[field]} → ${after[field]}`);
}
async function openMenu(page, bar, mobile) {
  await bar.getByRole('button', { name: labels.more }).click();
  const menu = mobile ? page.getByRole('dialog') : page.getByRole('menu', { name: labels.more });
  await menu.waitFor();
  if (mobile) await page.locator('.b-drawer-wrapper.is-settled').waitFor();
  return menu;
}
async function choose(page, bar, profile, action) {
  const writing = action === 'add' || action === 'complete';
  const beforeWrites = writing
    ? await page.evaluate(
        () =>
          window.__cloudBatchFixture.requests.filter((x) =>
            /\/(?:enqueue|complete|batchAddResourcesToInbox)$/.test(x.url),
          ).length,
      )
    : 0;
  if (profile.mobile || action === 'add' || action === 'complete') {
    const menu = await openMenu(page, bar, profile.mobile);
    await menu.getByRole('menuitem', { name: labels[action] }).click();
  } else await bar.getByRole('button', { name: labels[action] }).click();
  if (writing)
    await page.waitForFunction(
      (before) =>
        window.__cloudBatchFixture.requests.filter((x) =>
          /\/(?:enqueue|complete|batchAddResourcesToInbox)$/.test(x.url),
        ).length > before,
      beforeWrites,
    );
}
async function newCase(profile, count = 72) {
  const page = await browser.newPage({
    viewport: { width: profile.width, height: profile.height || 900 },
    hasTouch: !!profile.mobile,
    reducedMotion: 'reduce',
  });
  page.setDefaultTimeout(30000);
  page.setDefaultNavigationTimeout(60000);
  page.on('pageerror', (error) => {
    errors.push(error.message);
    console.error('Browser error:', error.message);
  });
  const url = new URL('/e2e/cloud-scroll.html', origin);
  for (const [key, value] of Object.entries({
    batch: '',
    count,
    theme: profile.theme,
    density: profile.density || 'medium',
    lang: profile.lang || 'zh',
    view: profile.view || 'table',
    ...(profile.baseline ? { renderProfile: 'mobile' } : {}),
  }))
    url.searchParams.set(key, String(value));
  await page.goto(url.href, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__cloudBatchFixture);
  await ready(page);
  if (profile.mobile) await page.evaluate(() => window.__cloudBatchFixture.enterBatch());
  else await page.getByRole('button', { name: /^(批量操作|Batch actions)$/i }).click();
  const bar = page.locator(profile.mobile ? '.resource-batch-action-bar--mobile' : '.resource-batch-action-bar');
  await bar.waitFor();
  await bar.locator('.batch-action-select-all [role=checkbox]').click();
  await page.waitForFunction((expected) => window.__cloudBatchFixture.selection.count === expected, count);
  await bar.evaluate(async (element) => {
    // Vue removes the enter classes after two frames, including with reduced motion.
    while ([...element.classList].some((name) => name.startsWith('resource-batch-action-bar-enter-')))
      await new Promise(requestAnimationFrame);
    await Promise.all(element.getAnimations().map((animation) => animation.finished));
  });
  return { page, bar };
}

try {
  for (const profile of profiles.slice(Number(process.env.CLOUD_BATCH_PROFILE_START) || 0)) {
    const { page, bar } = await newCase(profile);
    const id = `${profile.width}-${profile.theme}-${profile.density || 'mobile'}-${profile.lang || 'zh'}-${profile.baseline ? 'baseline' : 'browser'}${profile.height ? `-${profile.height}` : ''}${profile.view ? `-${profile.view}` : ''}`;
    const before = await bar.boundingBox();
    if (!profile.mobile) {
      const buttons = await bar
        .locator('.resource-batch-action-bar__actions button, .resource-batch-action-bar__primary')
        .count();
      assert.equal(buttons, 7, 'PC retains seven direct actions including More');
    }
    const menu = await openMenu(page, bar, profile.mobile);
    assert.equal(await menu.getByRole('menuitem', { name: labels.add }).count(), 1);
    assert.equal(await menu.getByRole('menuitem', { name: labels.complete }).count(), 1);
    await page.screenshot({ path: join(output, `${id}-menu.png`) });
    if (profile.height) {
      const bounds = await menu.boundingBox();
      assert(
        bounds.y >= 0 && bounds.y + bounds.height <= profile.height + 1,
        'Short-screen menu stays within viewport',
      );
      const lastAction = menu.getByRole('menuitem', { name: /^(批量删除|Batch Delete)$/i });
      await lastAction.scrollIntoViewIfNeeded();
      const lastBounds = await lastAction.boundingBox();
      assert(lastBounds.y >= 0 && lastBounds.y + lastBounds.height <= profile.height, 'Last action remains reachable');
    }
    await page.keyboard.press('Escape');
    await menu.waitFor({ state: 'hidden' });

    await choose(page, bar, profile, 'move');
    const move = page.locator('.mask-container');
    await move.waitFor();
    stable(before, await bar.boundingBox(), `${id} move open`);
    await move.getByRole('button', { name: /^(取消|Cancel)$/i }).click();
    await move.waitFor({ state: 'hidden' });
    await ready(page);
    stable(before, await bar.boundingBox(), `${id} move close`);

    await choose(page, bar, profile, 'tags');
    const tags = page.getByRole('dialog');
    await tags.waitFor();
    await page.locator('.b-drawer-wrapper.is-settled').waitFor();
    stable(before, await bar.boundingBox(), `${id} tags open`);
    await tags.locator('.b-drawer-close').last().click();
    await tags.waitFor({ state: 'hidden' });
    await ready(page);
    stable(before, await bar.boundingBox(), `${id} tags close`);

    await choose(page, bar, profile, 'complete');
    await ready(page);
    assert.equal(await page.evaluate(() => window.__cloudBatchFixture.files.filter((x) => x.isPending).length), 0);
    assert.equal(await page.evaluate(() => window.__cloudBatchFixture.selection.count), 72);
    const submitted = await page.evaluate(() =>
      window.__cloudBatchFixture.requests.filter((x) => x.url.endsWith('/complete')).map((x) => x.body.items.length),
    );
    assert.deepEqual(submitted, [72], 'One complete request covers all selected files');

    await choose(page, bar, profile, 'add');
    await ready(page);
    assert.equal(await page.evaluate(() => window.__cloudBatchFixture.files.filter((x) => x.isPending).length), 72);
    assert.equal(await page.evaluate(() => window.__cloudBatchFixture.selection.count), 72);
    stable(before, await bar.boundingBox(), `${id} inbox writes`);
    assert(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${id}: horizontal overflow`,
    );
    await page.screenshot({ path: join(output, `${id}-complete.png`) });
    report.push({ id, selected: 72, bar: before, stable: true });
    console.log(`PASS ${id}: bulk states, move/tags geometry, selection retained`);
    await page.close();
  }

  const profile = { width: 1440, theme: 'day' };
  const { page, bar } = await newCase(profile, 1000);
  await choose(page, bar, profile, 'complete');
  await ready(page);
  assert.equal(
    await page.evaluate(
      () => window.__cloudBatchFixture.requests.find((x) => x.url.endsWith('/complete')).body.items.length,
    ),
    1000,
  );
  await choose(page, bar, profile, 'complete');
  await ready(page);
  assert.equal(await page.evaluate(() => window.__cloudBatchFixture.selection.count), 1000);
  await page.evaluate(() => {
    window.__cloudBatchFixture.controls.failNextWrite = true;
  });
  await choose(page, bar, profile, 'add');
  await ready(page);
  assert.equal(await page.evaluate(() => window.__cloudBatchFixture.files.filter((x) => x.isPending).length), 0);
  assert.equal(await page.evaluate(() => window.__cloudBatchFixture.selection.count), 1000);
  await choose(page, bar, profile, 'add');
  await ready(page);
  assert.equal(await page.evaluate(() => window.__cloudBatchFixture.files.filter((x) => x.isPending).length), 1000);
  await page.close();
  report.push({
    id: '1000-files',
    atomicRequest: true,
    zeroChange: true,
    failedWriteRetainsSelection: true,
    retry: true,
  });

  const scoped = await newCase(profile);
  await scoped.page
    .getByRole('treeitem', { name: /^项目资料/ })
    .first()
    .click();
  await ready(scoped.page);
  assert.equal(await scoped.page.evaluate(() => window.__cloudBatchFixture.cloud.fileList.length), 36);
  await choose(scoped.page, scoped.bar, profile, 'complete');
  await ready(scoped.page);
  assert.equal(
    await scoped.page.evaluate(
      () => window.__cloudBatchFixture.requests.find((x) => x.url.endsWith('/complete')).body.items.length,
    ),
    72,
  );
  assert.equal(await scoped.page.evaluate(() => window.__cloudBatchFixture.files.filter((x) => x.isPending).length), 0);
  assert.equal(await scoped.page.evaluate(() => window.__cloudBatchFixture.selection.count), 72);
  await scoped.page.close();
  report.push({ id: 'cross-folder-selection', submitted: 72, visible: 36 });

  const pending = await newCase(profile);
  await pending.page.evaluate(() => {
    const x = window.__cloudBatchFixture;
    x.cloud.pendingOnly = true;
    return x.cloud.queryFieldList();
  });
  await ready(pending.page);
  await choose(pending.page, pending.bar, profile, 'complete');
  await ready(pending.page);
  assert.deepEqual(
    await pending.page.evaluate(() => {
      const x = window.__cloudBatchFixture;
      return { visible: x.cloud.fileList.length, total: x.cloud.fileTotal, selected: x.selection.count };
    }),
    { visible: 0, total: 0, selected: 72 },
  );
  await choose(pending.page, pending.bar, profile, 'add');
  await ready(pending.page);
  assert.equal(await pending.page.evaluate(() => window.__cloudBatchFixture.cloud.fileList.length), 72);
  await pending.page.close();
  report.push({ id: 'pending-filter-empty', selectionRetained: true, addFromEmpty: true });

  const slow = await newCase(profile);
  const slowBefore = await slow.bar.boundingBox();
  await slow.page.evaluate(() => {
    window.__cloudBatchFixture.controls.holdWrite = true;
  });
  await choose(slow.page, slow.bar, profile, 'complete');
  await slow.page.waitForTimeout(350);
  assert.equal(await slow.page.evaluate(() => window.__cloudBatchFixture.selection.busy), true);
  stable(slowBefore, await slow.bar.boundingBox(), 'in-flight inbox write');
  assert.equal(await slow.bar.locator('.resource-batch-action-bar__primary').getAttribute('aria-busy'), null);
  await slow.page.evaluate(() => window.__cloudBatchFixture.controls.releaseWrite());
  await ready(slow.page);
  stable(slowBefore, await slow.bar.boundingBox(), 'completed slow inbox write');
  await slow.page.close();
  report.push({ id: 'slow-write', stable: true, unrelatedPrimaryLoading: false });

  const stale = await newCase(profile);
  await stale.page.evaluate(() => {
    window.__cloudBatchFixture.controls.holdWrite = true;
  });
  await choose(stale.page, stale.bar, profile, 'complete');
  await stale.page.evaluate(() => {
    const x = window.__cloudBatchFixture;
    x.selection.end();
    x.enterBatch();
    x.selection.setItems([{ type: 'file', id: '1', title: '新选择' }]);
  });
  await stale.page.evaluate(() => window.__cloudBatchFixture.controls.releaseWrite());
  await stale.page.waitForFunction(() => window.__cloudBatchFixture.files.every((x) => !x.isPending));
  assert.deepEqual(await stale.page.evaluate(() => window.__cloudBatchFixture.selection.items.map((x) => x.id)), ['1']);
  assert.equal(
    await stale.page.evaluate(() => window.__cloudBatchFixture.cloud.fileList.filter((x) => x.isPending).length),
    48,
  );
  await stale.page.close();
  report.push({ id: 'stale-receipt', newSelectionRetained: true, oldReceiptIgnored: true });
  assert.deepEqual(errors, [], 'No browser runtime errors');
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`PASS ${report.length} browser scenarios. Screenshots and report: ${output}`);
} finally {
  await browser.close();
}
