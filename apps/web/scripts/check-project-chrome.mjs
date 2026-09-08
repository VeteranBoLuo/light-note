// Local fixture only; checks sticky project controls without changing user data.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.env.BOARD_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const width of [320, 390, 900, 1440])
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({ viewport: { width, height: 1000 }, reducedMotion: 'reduce' });
      await page.goto(
        `${origin}/e2e/toolbox-workspace.html?view=detail&kind=learning&theme=${theme}&locale=${theme === 'night' ? 'en-US' : 'zh-CN'}${width < 768 ? '&renderProfile=mobile' : ''}`,
      );
      const head = page.locator('.workspace-detail-head');
      await head.waitFor({ state: 'attached' });
      await page.locator('.project-section-navigation > button').nth(2).click();
      await page.waitForTimeout(300);
      const position = await page.evaluate(() => {
        const head = document.querySelector('.workspace-detail-head').getBoundingClientRect();
        const nav = document.querySelector('.project-section-navigation').getBoundingClientRect();
        const board = document.querySelector('.workspace-board-section').getBoundingClientRect();
        const root = document.querySelector('.knowledge-workspace');
        return {
          top: head.top,
          bottom: head.bottom,
          navTop: nav.top,
          navBottom: nav.bottom,
          boardTop: board.top,
          overflow: root.scrollWidth > root.clientWidth + 1,
        };
      });
      assert(position.top >= -1 && position.top < 100, JSON.stringify(position));
      assert(position.boardTop >= position.bottom - 1, 'header hides section');
      if (width < 1200) {
        assert(position.navTop >= position.bottom - 1, 'sticky bars overlap');
        assert(position.boardTop >= position.navBottom - 1, 'navigation hides section ' + JSON.stringify(position));
      }
      assert.equal(
        await page.locator('.project-section-navigation > button').nth(2).getAttribute('aria-current'),
        'location',
      );
      assert(!position.overflow, 'horizontal overflow');
      await page.screenshot({ path: join(tmpdir(), `project-chrome-${width}-${theme}.png`) });
      await page
        .locator('.workspace-timeline')
        .scrollIntoViewIfNeeded()
        .catch(() => {});
      await page.locator('.project-settings-trigger:visible').click();
      await page.locator('.workspace-settings-form').waitFor();
      await page.keyboard.press('Escape');
      await page.locator('.workspace-settings-form').waitFor({ state: 'detached' });
      if (width >= 768) {
        await page.locator('.project-breadcrumb > button').last().click();
        await page.locator('.workspace-list-section').waitFor();
      } else {
        assert.equal(await page.locator('.project-breadcrumb').isVisible(), false);
        const tab = await page.locator('.project-section-navigation > button').first().evaluate(e => ({ align: getComputedStyle(e).justifyContent, height: e.getBoundingClientRect().height }));
        assert.equal(tab.align, 'center');
        assert(tab.height <= 44, 'mobile tab too tall');
      }
      console.log(width, theme, 'sticky alignment / section target / settings passed');
      await page.close();
    }
} finally {
  await browser.close();
}
