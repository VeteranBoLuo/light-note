import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

// Uses local, generated CSV data and the production FilePreview entry point.
const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
const screenshotDir = process.env.LIGHTNOTE_SCREENSHOT_DIR;
if (screenshotDir) await mkdir(screenshotDir, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const open = async (query, mobile = false) => {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1400, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route(/^https?:\/\/[^/]+\/api\//, (route) => route.abort());
  return {
    page,
    errors,
    url: `${origin}/e2e/excel-zoom.html?fullPreview=1&${query}${mobile ? '&renderProfile=mobile' : ''}`,
  };
};
const ready = async (page) => {
  await page.waitForSelector('.csv-preview .table-row');
  await page.waitForSelector('.preview-loading', { state: 'detached' });
};
try {
  for (const mobile of [false, true]) {
    for (const theme of ['day', 'night']) {
      const { page, errors, url } = await open(`csv=1&theme=${theme}`, mobile);
      await page.goto(url);
      await ready(page);
      assert.equal(await page.locator('.file-type-badge').innerText(), 'CSV');
      const cells = await page.locator('.csv-cell').allTextContents();
      for (const value of [
        '来源资料',
        '材料 1 · 对比方案',
        '含,逗号',
        '第一行\n第二行',
        '00123',
        '=1+1',
        '12345678901234567890',
      ]) {
        assert.ok(cells.includes(value), `Original value preserved: ${value}`);
      }
      for (const density of ['medium', 'small', 'large']) {
        await page.evaluate((value) => window.setDensity(value), density);
        await page.waitForTimeout(100);
        const body = page.locator('.csv-preview .table-body');
        if (mobile) {
          const geometry = await body.evaluate((el) => ({ width: el.clientWidth, content: el.scrollWidth }));
          assert.ok(geometry.content > geometry.width, 'Mobile table scrolls horizontally');
          await body.evaluate((el) => {
            el.scrollLeft = el.scrollWidth;
          });
          await page.waitForTimeout(50);
          const positions = await page.evaluate(() => [
            document.querySelector('.csv-preview .table-body').scrollLeft,
            document.querySelector('.csv-preview .table-header-viewport').scrollLeft,
          ]);
          assert.ok(positions[0] > 0);
          assert.ok(Math.abs(positions[0] - positions[1]) < 2, 'Column headers follow horizontal scrolling');
          await body.evaluate((el) => {
            el.scrollLeft = 0;
          });
        }
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false);
        if (screenshotDir)
          await page.screenshot({ path: `${screenshotDir}/${mobile ? 'mobile' : 'desktop'}-${theme}-${density}.png` });
        console.log(`PASS CSV ${mobile ? 'mobile' : 'desktop'} ${theme} ${density}`);
      }
      assert.deepEqual(errors, []);
      await page.close();
    }
  }
  for (const csv of ['empty', 'invalid', 'large']) {
    const { page, errors, url } = await open(`csv=${csv}`);
    await page.goto(url);
    if (csv === 'invalid') {
      await page.waitForSelector('.preview-error');
      assert.match(await page.locator('.preview-error').innerText(), /文件内容|格式|损坏/);
      assert.equal(await page.locator('.retry-btn').count(), 0);
    } else {
      await ready(page);
      if (csv === 'large') {
        assert.equal(await page.locator('.csv-preview .table-row').count(), 100);
        await page.getByTitle('下一页', { exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.csv-cell')?.textContent === '101');
        assert.ok((await page.locator('.csv-cell').allTextContents()).includes('第 101 行'));
        await page.getByTitle('下一页', { exact: true }).click();
        await page.waitForFunction(() => document.querySelector('.csv-cell')?.textContent === '201');
        assert.equal(await page.locator('.csv-preview .table-row').count(), 5);
      }
    }
    assert.deepEqual(errors, []);
    console.log(`PASS CSV ${csv}`);
    await page.close();
  }
  const { page, errors, url } = await open('csv=1');
  await page.addInitScript(() => {
    const original = window.fetch;
    let failed = false;
    window.fetch = (...args) => {
      if (!failed && String(args[0]).startsWith('blob:')) {
        failed = true;
        return Promise.resolve(new Response('', { status: 503 }));
      }
      return original(...args);
    };
  });
  await page.goto(url);
  await page.waitForSelector('.preview-error');
  await page.locator('.retry-btn').click();
  await ready(page);
  assert.equal(await page.locator('.preview-error').count(), 0);
  assert.deepEqual(errors, []);
  console.log('PASS CSV transient failure and retry');
  await page.close();
} finally {
  await browser.close();
}
