import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const screenshots = process.env.LIGHTNOTE_SCREENSHOT_DIR;
if (screenshots) await mkdir(screenshots, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const itemSelector = '[data-notification-id="preview-todo"]';

async function openFixture(page, params) {
  await page.goto(`${origin}/e2e/notification-center.html?${new URLSearchParams({ readToggle: '1', ...params })}`, {
    waitUntil: 'networkidle',
  });
  if (params.view !== 'page') await page.locator('.nt-bell').click();
  await page.locator(itemSelector).waitFor();
  await page.waitForFunction(() => {
    const panel = document.querySelector('.notification-popover');
    return !panel || getComputedStyle(panel).transform === 'none';
  });
}

try {
  for (const theme of ['day', 'night'])
    for (const density of ['small', 'medium', 'large'])
      for (const locale of ['zh-CN', 'en-US']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await openFixture(page, { theme, density, locale, writeDelay: '600' });
        const item = page.locator(itemSelector);
        const action = item.locator('.nt-read-state');
        const before = await page.locator('.notification-popover').boundingBox();
        const iconBefore = await action.innerHTML();
        const list = page.locator('.nt-list');
        await list.evaluate((el) => {
          el.scrollTop = Math.min(20, el.scrollHeight - el.clientHeight);
        });
        const scroll = await list.evaluate((el) => el.scrollTop);
        assert(
          (await action.getAttribute('aria-label')).startsWith(locale === 'zh-CN' ? '标记为已读' : 'Mark as read'),
        );
        await action.click();
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-notification-id="preview-todo"] .nt-read-state')
              ?.getAttribute('aria-busy') === 'true',
        );
        await page.keyboard.press('Enter');
        assert.equal(await item.locator('.nt-read-state .btn-spinner').count(), 1);
        assert.deepEqual(await page.locator('.notification-popover').boundingBox(), before);
        await page.waitForFunction(
          () => !document.querySelector('[data-notification-id="preview-todo"]')?.classList.contains('unread'),
        );
        await page.waitForFunction(
          () => document.querySelector('[data-notification-id="preview-todo"] .nt-read-state')?.disabled === false,
        );
        assert.equal(await page.locator('.nt-badge').count(), 0);
        assert.equal(await page.locator('.notification-popover .nt-tab-badge').count(), 0);
        assert.equal(await page.locator('.nt-detail').count(), 0, 'State action opened details');
        assert.equal(
          await page.locator('body').getAttribute('data-read-state-writes'),
          '1',
          'Loading allowed a duplicate write',
        );
        assert.equal(await list.evaluate((el) => el.scrollTop), scroll);
        assert.notEqual(await action.innerHTML(), iconBefore, 'Read and unread action icons are identical');
        assert(
          await action.evaluate((el) => el === document.activeElement),
          'Keyboard focus was lost after updating state',
        );
        assert(
          (await action.getAttribute('aria-label')).startsWith(locale === 'zh-CN' ? '标记为未读' : 'Mark as unread'),
        );
        if (screenshots && density === 'medium' && locale === 'zh-CN') {
          await list.evaluate((el) => {
            el.scrollTop = 0;
          });
          await page
            .locator('.notification-popover')
            .screenshot({
              path: join(screenshots, theme === 'day' ? 'read.png' : 'read-night.png'),
              animations: 'disabled',
            });
        }
        await action.press('Enter');
        await page.waitForFunction(() =>
          document.querySelector('[data-notification-id="preview-todo"]')?.classList.contains('unread'),
        );
        assert.equal(await page.locator('.nt-badge').innerText(), '1');
        assert.deepEqual(await page.locator('.notification-popover').boundingBox(), before);
        assert.equal(await item.locator('.nt-todo-action').count(), 1, 'Read state completed the todo');
        const overlap = await item.evaluate((el) => {
          const main = el.querySelector('.nt-item-main').getBoundingClientRect();
          const actions = el.querySelector('.nt-item-actions').getBoundingClientRect();
          return main.right > actions.left;
        });
        assert.equal(overlap, false, 'Actions overlap notification text');
        if (screenshots && density === 'medium' && locale === 'zh-CN')
          await page
            .locator('.notification-popover')
            .screenshot({
              path: join(screenshots, theme === 'day' ? 'unread.png' : 'unread-night.png'),
              animations: 'disabled',
            });
        assert.deepEqual(errors, []);
        results.push({ theme, density, locale, readAndUnread: true });
        await page.close();
      }

  for (const theme of ['day', 'night'])
    for (const width of [320, 390]) {
      const page = await browser.newPage({ viewport: { width, height: 844 } });
      await openFixture(page, { theme, view: 'page', renderProfile: 'mobile' });
      const item = page.locator(itemSelector);
      assert.equal(await item.locator('.nt-read-state').count(), 0);
      await item.getByRole('button', { name: '更多', exact: true }).click();
      if (screenshots && width === 390)
        await page.screenshot({ path: join(screenshots, `mobile-menu-${theme}.png`), animations: 'disabled' });
      await page.getByRole('menuitem', { name: '标记为已读', exact: true }).click();
      await page.waitForFunction(
        () => !document.querySelector('[data-notification-id="preview-todo"]')?.classList.contains('unread'),
      );
      await item.getByRole('button', { name: '更多', exact: true }).click();
      await page.getByRole('menuitem', { name: '标记为未读', exact: true }).click();
      await page.waitForFunction(() =>
        document.querySelector('[data-notification-id="preview-todo"]')?.classList.contains('unread'),
      );
      results.push({ theme, width, mobileMenu: true });
      await page.close();
    }

  const failed = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await openFixture(failed, { failRead: '1' });
  await failed.locator(`${itemSelector} .nt-read-state`).click();
  await failed.waitForFunction(
    () => document.querySelector('[data-notification-id="preview-todo"] .nt-read-state')?.disabled === false,
  );
  assert(await failed.locator(itemSelector).evaluate((el) => el.classList.contains('unread')));
  assert.equal(await failed.locator('.nt-badge').innerText(), '1');
  assert.equal(await failed.getByText('通知状态切换失败，请稍后重试', { exact: true }).count(), 1);
  await failed.close();
  console.log(JSON.stringify({ results, failurePreservesState: true }, null, 2));
} catch (error) {
  const page = browser
    .contexts()
    .flatMap((context) => context.pages())
    .at(-1);
  if (page) {
    console.error('Failed fixture:', page.url());
    if (screenshots) await page.screenshot({ path: join(screenshots, 'failure.png') });
  }
  throw error;
} finally {
  // Some local Chrome transports keep shutdown pending after every page is closed.
  await Promise.race([browser.close(), new Promise((resolve) => setTimeout(resolve, 5000))]);
}

// All assertions and Chrome cleanup are awaited before ending this standalone CLI.
process.exit(0);
