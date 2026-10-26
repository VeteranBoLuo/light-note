import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

// Only the disposable notification fixture is used. No real notification is read or changed.
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const screenshotDir = process.env.LIGHTNOTE_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
try {
  for (const theme of ['day', 'night']) {
    for (const density of ['small', 'medium', 'large']) {
      for (const locale of ['zh-CN', 'en-US']) {
        const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(
          `${origin}/e2e/notification-center.html?${new URLSearchParams({ theme, density, locale, unread: 'off' })}`,
          { waitUntil: 'networkidle' },
        );
        await page.locator('.nt-bell').click();
        await page.locator('.nt-tabs').waitFor();
        await page.locator('.nt-item').waitFor();
        await page.waitForFunction(
          () => getComputedStyle(document.querySelector('.notification-popover')).transform === 'none',
        );
        let baseline;
        const widths = [];
        // Exercise both growth and shrinkage while the same popover stays open.
        for (const count of [0, 1, 9, 10, 99, 100, 0]) {
          await page.evaluate(async (value) => {
            window.dispatchEvent(new CustomEvent('fixture-notification-unread', { detail: value }));
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }, count);
          const measured = await page.locator('.nt-tabs').evaluate((tabs) => {
            const children = [...tabs.children],
              rect = tabs.getBoundingClientRect(),
              popover = tabs.closest('.notification-popover').getBoundingClientRect();
            return {
              width: rect.width,
              frame: [popover.x, popover.y, popover.width, popover.height],
              tabs: children.map((tab) => {
                const bounds = tab.getBoundingClientRect();
                return [bounds.x, bounds.y, bounds.width, bounds.height];
              }),
              // The label stays centered after the corner badge disappears.
              centered: children.every((tab) => {
                const range = document.createRange();
                const text = [...tab.childNodes].find(
                  (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
                );
                range.selectNodeContents(text);
                const label = range.getBoundingClientRect(),
                  bounds = tab.getBoundingClientRect();
                return Math.abs(label.left + label.width / 2 - bounds.left - bounds.width / 2) < 1;
              }),
              clipped: children.some(
                (tab) =>
                  tab.getBoundingClientRect().left < popover.left || tab.getBoundingClientRect().right > popover.right,
              ),
              badgesClipped: [...tabs.querySelectorAll('.nt-tab-badge')].some((badge) => {
                const bounds = badge.getBoundingClientRect();
                const range = document.createRange();
                const text = [...badge.parentElement.childNodes].find(
                  (node) => node.nodeType === Node.TEXT_NODE && node.textContent.trim(),
                );
                range.selectNodeContents(text);
                const label = range.getBoundingClientRect();
                return (
                  bounds.left < popover.left ||
                  bounds.right > popover.right ||
                  bounds.top < popover.top ||
                  bounds.bottom > popover.bottom ||
                  badge.scrollWidth > badge.clientWidth + 1 ||
                  (bounds.left < label.right &&
                    bounds.right > label.left &&
                    bounds.top < label.bottom &&
                    bounds.bottom > label.top)
                );
              }),
              scrolls: tabs.scrollWidth > tabs.clientWidth + 1,
              inViewport: popover.left >= 0 && popover.right <= innerWidth,
              badges: [...tabs.querySelectorAll('.nt-tab-badge')].map((badge) => badge.textContent.trim()),
            };
          });
          baseline ??= { frame: measured.frame, tabs: measured.tabs };
          assert.deepEqual(
            { frame: measured.frame, tabs: measured.tabs },
            baseline,
            `Unread count ${count} moved the popover or tabs (${theme}/${density}/${locale})`,
          );
          assert(measured.centered, 'A hidden badge leaves an off-center label');
          assert(
            !measured.clipped && !measured.badgesClipped && !measured.scrolls && measured.inViewport,
            `A tab or unread badge is clipped or overlaps its label: ${JSON.stringify({ theme, density, locale, count, measured })}`,
          );
          assert.equal(measured.badges.length, count ? 6 : 0);
          if (count) {
            assert.equal(measured.badges.at(-1), count > 99 ? '99+' : String(count));
          }
          widths.push({ count, width: measured.width });
        }
        assert.equal(widths[0].width, widths.at(-1).width, 'Clearing unread counts did not restore the width');
        // Exercise the actual mark-all action and its fixture response without closing the popover.
        const withUnread = new URL(page.url());
        withUnread.searchParams.delete('unread');
        await page.goto(withUnread.href, { waitUntil: 'networkidle' });
        await page.locator('.nt-bell').click();
        await page.locator('.nt-item').waitFor();
        await page.waitForFunction(
          () => getComputedStyle(document.querySelector('.notification-popover')).transform === 'none',
        );
        const frameBeforeRead = await page.locator('.notification-popover').boundingBox();
        assert.equal(await page.locator('.notification-popover .nt-tab-badge').count(), 6);
        const saveScreenshots = screenshotDir && theme === 'day' && density === 'medium' && locale === 'zh-CN';
        if (saveScreenshots)
          await page.locator('.notification-popover').screenshot({ path: join(screenshotDir, 'unread.png') });
        await page.locator('.nt-markall').click();
        await page.waitForFunction(() => document.querySelector('.nt-markall')?.disabled);
        assert.equal(await page.locator('.notification-popover .nt-tab-badge').count(), 0);
        assert.deepEqual(await page.locator('.notification-popover').boundingBox(), frameBeforeRead);
        if (saveScreenshots)
          await page.locator('.notification-popover').screenshot({ path: join(screenshotDir, 'all-read.png') });
        assert.deepEqual(errors, []);
        results.push({ theme, density, locale, widths });
        await page.close();
      }
    }
  }
  console.log(JSON.stringify(results, null, 2));
} finally {
  await browser.close();
}
