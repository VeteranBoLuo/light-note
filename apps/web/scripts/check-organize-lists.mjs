import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const read = (page) =>
  page.evaluate(() => {
    const fixture = window.organizeFixture;
    const issue = fixture.router.currentRoute.value.query.issue;
    const list = fixture.store.lists[issue];
    return {
      count: list.items.length,
      loading: list.loading || list.loadingMore,
      error: list.error,
      calls: fixture.calls,
    };
  });
const scrollBottom = async (page) => {
  await page.locator('.organize-issue-view').evaluate((el) => {
    el.scrollTop = el.scrollHeight;
    el.dispatchEvent(new Event('scroll'));
  });
};
const settled = (page) =>
  page.waitForFunction(() => {
    const f = window.organizeFixture;
    const l = f?.store.lists[f.router.currentRoute.value.query.issue];
    return l && !l.loading && !l.loadingMore && f.calls.length;
  });
try {
  for (const mobile of [false, true])
    for (const theme of ['day', 'night']) {
      const page = await browser.newPage({
        viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
      const base = `${origin}/e2e/organize-lists.html?theme=${theme}${mobile ? '&renderProfile=mobile' : ''}`;
      for (const issue of ['untagged', 'duplicate_bookmark', 'bookmark_health']) {
        await page.goto(`${base}&issue=${issue}`);
        await page.waitForSelector('.b-virtual-list__item');
        await settled(page);
        assert.equal(await page.getByRole('button', { name: '加载更多', exact: true }).count(), 0);
        for (let i = 0; i < 12 && (await read(page)).count < 194; i++) {
          const old = (await read(page)).count;
          await scrollBottom(page);
          await page.waitForFunction((old) => {
            const f = window.organizeFixture;
            return f.store.lists[f.router.currentRoute.value.query.issue].items.length > old;
          }, old);
          await settled(page);
        }
        assert.equal((await read(page)).count, 194);
        assert.ok((await page.locator('.b-virtual-list__item').count()) < 35, 'Only visible rows should be mounted');
        const before = (await read(page)).calls.length;
        await scrollBottom(page);
        await page.waitForTimeout(200);
        assert.equal((await read(page)).calls.length, before, 'No requests after the last page');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
        const bounds = await page.locator('.b-virtual-list__item').last().boundingBox();
        assert.ok(bounds.x + bounds.width <= (mobile ? 390 : 1440), 'Rows must fit the viewport');
        if (process.env.LIGHTNOTE_SCREENSHOT_DIR && issue === 'untagged') {
          await page.screenshot({
            path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/${mobile ? 'mobile' : 'desktop'}-${theme}.png`,
          });
        }
      }
      await page.goto(`${base}&error`);
      await page.waitForSelector('.b-virtual-list__item');
      await scrollBottom(page);
      await page.waitForSelector('.organize-list-retry');
      const failed = await read(page);
      for (let i = 0; i < 3; i++) await scrollBottom(page);
      await page.waitForTimeout(250);
      assert.equal((await read(page)).calls.length, failed.calls.length, 'Failure must stop automatic retries');
      assert.equal((await read(page)).count, 20);
      if (process.env.LIGHTNOTE_SCREENSHOT_DIR)
        await page.screenshot({
          path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/${mobile ? 'mobile' : 'desktop'}-${theme}-error.png`,
        });
      await page.locator('.organize-list-retry').click();
      await page.waitForFunction(() => window.organizeFixture.store.lists.untagged.items.length > 20);
      assert.equal((await read(page)).calls.at(-1).cursor, 20, 'Retry the failed cursor');
      await page.locator('.organize-issue-view').evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.locator('.organize-filter-bar__search input').fill('新关键词');
      await scrollBottom(page);
      await page.waitForFunction(() => window.organizeFixture.store.lists.untagged.items.length > 40);
      assert.equal((await read(page)).calls.at(-1).keyword, '', 'Draft must not alter pagination');
      await page.locator('.organize-issue-view').evaluate((el) => {
        el.scrollTop = 0;
      });
      await page.locator('.organize-filter-bar__submit').click();
      await settled(page);
      assert.equal((await read(page)).calls.at(-1).keyword, '新关键词');
      assert.equal((await read(page)).calls.at(-1).cursor, 0);
      await page.locator('.organize-filter-bar__batch').click();
      const firstRow = page.locator('.organize-resource-row').first();
      await firstRow.getByRole('checkbox').click();
      await scrollBottom(page);
      await settled(page);
      await page.locator('.organize-issue-view').evaluate((el) => {
        el.scrollTop = 0;
        el.dispatchEvent(new Event('scroll'));
      });
      await page.waitForTimeout(100);
      assert.ok(
        await page
          .locator('.organize-resource-row')
          .first()
          .getAttribute('class')
          .then((c) => c.includes('is-selected')),
        'Selection survives virtual row recycling',
      );
      if (process.env.LIGHTNOTE_SCREENSHOT_DIR)
        await page.screenshot({
          path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/${mobile ? 'mobile' : 'desktop'}-${theme}-batch.png`,
        });
      await page.locator('.organize-filter-bar__batch').click();
      await page.locator('.organize-filter-bar__search input').fill('无结果');
      await page.locator('.organize-filter-bar__submit').click();
      await page.waitForSelector('.organize-state--empty');
      assert.equal((await read(page)).count, 0);
      await page.goto(`${base}&underfill`);
      await page.waitForFunction(() => window.organizeFixture?.store.lists.untagged.items.length > 2);
      assert.ok((await read(page)).calls.length >= 2, 'An underfilled first page continues automatically');
      await page.goto(`${base}&slow`);
      await page.waitForSelector('.organize-list-state[aria-busy="true"]');
      await settled(page);
      await scrollBottom(page);
      await page.waitForSelector('.b-virtual-list__loading');
      if (process.env.LIGHTNOTE_SCREENSHOT_DIR)
        await page.screenshot({
          path: `${process.env.LIGHTNOTE_SCREENSHOT_DIR}/${mobile ? 'mobile' : 'desktop'}-${theme}-loading.png`,
        });
      await settled(page);
      assert.deepEqual(errors, []);
      console.log(
        `PASS ${mobile ? 'mobile' : 'desktop'} ${theme}: 3 lists, virtualization, paging, error/retry, filter snapshot, empty`,
      );
      await page.close();
    }
} finally {
  await browser.close();
}
