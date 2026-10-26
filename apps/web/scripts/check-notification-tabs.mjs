import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

// Only the disposable notification fixture is used. No real notification is read or changed.
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
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
        let previous = 0;
        const widths = [];
        // Exercise both growth and shrinkage while the same popover stays open.
        for (const count of [0, 1, 9, 10, 99, 100, 0]) {
          await page.evaluate(async (value) => {
            const { useNotification } = await import('/src/composables/useNotification.ts');
            const state = useNotification();
            state.unreadByType.value = Object.fromEntries(
              ['todo_reminder', 'system', 'opinion_reply', 'community_feed', 'public_resource'].map((key) => [
                key,
                value,
              ]),
            );
            state.unreadTotal.value = value * 5;
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          }, count);
          const measured = await page.locator('.nt-tabs').evaluate((tabs) => {
            const style = getComputedStyle(tabs),
              children = [...tabs.children],
              rect = tabs.getBoundingClientRect();
            const last = children.at(-1).getBoundingClientRect(),
              popover = tabs.closest('.notification-popover').getBoundingClientRect();
            return {
              width: rect.width,
              expected:
                children.reduce((sum, tab) => sum + tab.getBoundingClientRect().width, 0) +
                (children.length - 1) * parseFloat(style.columnGap) +
                parseFloat(style.paddingLeft) +
                parseFloat(style.paddingRight),
              rightGap: rect.right - last.right - parseFloat(style.paddingRight),
              clipped: children.some(
                (tab) =>
                  tab.scrollWidth > tab.clientWidth + 1 ||
                  tab.getBoundingClientRect().left < popover.left ||
                  tab.getBoundingClientRect().right > popover.right,
              ),
              scrolls: tabs.scrollWidth > tabs.clientWidth + 1,
              inViewport: popover.left >= 0 && popover.right <= innerWidth,
              badges: [...tabs.querySelectorAll('.nt-tab-badge')].map((badge) => badge.textContent.trim()),
            };
          });
          assert(
            Math.abs(measured.width - measured.expected) < 2,
            JSON.stringify({ theme, density, locale, count, measured }),
          );
          assert(Math.abs(measured.rightGap) < 2, 'Unexpected empty space after the last tab');
          assert(!measured.clipped && !measured.scrolls && measured.inViewport, 'A tab or unread badge is clipped');
          assert.equal(measured.badges.length, count ? 6 : 0);
          if (count) {
            assert(measured.width >= previous, 'Larger unread counts shrank the popover');
            assert.equal(measured.badges.at(-1), count > 99 ? '99+' : String(count));
          }
          previous = measured.width;
          widths.push({ count, width: measured.width });
        }
        assert.equal(widths[0].width, widths.at(-1).width, 'Clearing unread counts did not restore the width');
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
