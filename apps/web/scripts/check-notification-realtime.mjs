import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const screenshotDirectory = process.env.LIGHTNOTE_SCREENSHOT_DIR;
if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
try {
  for (const mobile of [false, true])
    for (const theme of ['day', 'night'])
      for (const density of mobile ? ['medium'] : ['small', 'medium', 'large']) {
        const page = await browser.newPage({
          viewport: mobile ? { width: 390, height: 844 } : { width: 1280, height: 800 },
        });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(
          `${origin}/e2e/notification-realtime.html?${new URLSearchParams({ theme, density, ...(mobile ? { renderProfile: 'mobile', view: 'page' } : {}) })}`,
          { waitUntil: 'networkidle' },
        );
        await page.waitForFunction(() => window.__notificationRealtimeFixture?.stats.unread === 1);
        if (!mobile) await page.locator('.nt-bell').click();
        await page.locator('.nt-state').waitFor();
        const initial = await page.evaluate(() => ({ ...window.__notificationRealtimeFixture.stats }));
        const start = Date.now();
        await page.evaluate(() => {
          const fixture = window.__notificationRealtimeFixture;
          fixture.notify();
          fixture.notify();
          fixture.notify();
        });
        await page.getByText('实时提醒 3', { exact: true }).waitFor();
        const stats = await page.evaluate(() => ({ ...window.__notificationRealtimeFixture.stats }));
        assert.equal(stats.connections, 1);
        assert.equal(stats.unread - initial.unread, 1, 'A burst should cause one unread request');
        assert.equal(stats.lists - initial.lists, 1, 'An open panel should refresh once per burst');
        const delayMs = Date.now() - start;
        assert(delayMs < 2500, 'Live notification update was delayed');
        if (screenshotDirectory)
          await page.screenshot({
            path: path.join(screenshotDirectory, `${mobile ? 'mobile' : 'desktop'}-${theme}-${density}.png`),
          });
        // A stale live-refresh response must not undo a mark-all action or restore its badge.
        await page.evaluate(() => {
          const fixture = window.__notificationRealtimeFixture;
          fixture.delayNextList();
          fixture.notify();
        });
        await page.waitForFunction((count) => window.__notificationRealtimeFixture.stats.lists > count, stats.lists);
        await page.locator(mobile ? '.nt-page__markall' : '.nt-markall').click();
        await page.waitForFunction(async () => {
          const { useNotification } = await import('/src/composables/useNotification.ts');
          return useNotification().unreadTotal.value === 0;
        });
        await page.evaluate(() => window.__notificationRealtimeFixture.releaseList());
        await page.waitForTimeout(350);
        assert.equal(await page.locator('.nt-item.unread').count(), 0);
        assert.equal(
          await page.evaluate(async () => {
            const { useNotification } = await import('/src/composables/useNotification.ts');
            return useNotification().unreadTotal.value;
          }),
          0,
        );
        // Source deletion disables todo actions, and withdrawal removes a currently located notification.
        await page.evaluate(() => window.__notificationRealtimeFixture.invalidateTodo());
        await page.waitForFunction(() => document.querySelectorAll('.nt-todo-state').length === 4);
        assert.equal(await page.locator('.nt-todo-action').count(), 0);
        await page.evaluate(async () => {
          const { openNotificationPanel } = await import('/src/utils/notificationEntry.ts');
          openNotificationPanel('fixture-0');
        });
        await page.locator('[data-notification-id="fixture-0"].is-target').waitFor();
        await page.evaluate(() => window.__notificationRealtimeFixture.removeAll());
        await page.getByText('这条通知已不可用', { exact: true }).waitFor();
        assert.equal(await page.locator('.nt-item').count(), 0);
        // An admin recall also closes an already opened notification body after source validation.
        const systemId = await page.evaluate(() => window.__notificationRealtimeFixture.notify('system'));
        await page.locator(`[data-notification-id="${systemId}"]`).waitFor();
        await page.locator(`[data-notification-id="${systemId}"]`).click();
        await page.locator('.nt-detail-content').waitFor();
        await page.evaluate(() => window.__notificationRealtimeFixture.removeAll());
        await page.locator('.nt-detail-content').waitFor({ state: 'hidden' });
        await page.evaluate(async () => {
          const { useUserStore } = await import('/src/store/index.ts');
          useUserStore().$patch({ id: 'other-fixture', role: 'user' });
        });
        await page.waitForFunction(() => window.__notificationRealtimeFixture.stats.connections === 2);
        assert.equal(await page.evaluate(() => window.__notificationRealtimeFixture.stats.active), 1);
        await page.evaluate(async () => {
          const { useUserStore } = await import('/src/store/index.ts');
          useUserStore().$patch({ id: '', role: 'visitor' });
        });
        await page.waitForFunction(() => window.__notificationRealtimeFixture.stats.active === 0);
        assert.deepEqual(errors, []);
        results.push({ mobile, theme, density, delayMs });
        await page.close();
      }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
