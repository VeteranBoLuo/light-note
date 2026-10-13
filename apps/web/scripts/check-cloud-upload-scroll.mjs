import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-cloud-upload-scroll';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const results = [];
const settle = (page) => page.waitForTimeout(200);
const snapshot = (page) => page.locator('[data-mobile-resource-scroll]').evaluate((scroller) => {
  const viewport = scroller.getBoundingClientRect();
  const rows = [...scroller.querySelectorAll('.file-card,.field-item')]
    .filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > viewport.top + 1 && rect.top < viewport.bottom;
    })
    .map((element) => ({
      name: element.querySelector('.file-card-name,.file-name')?.textContent?.trim(),
      top: element.getBoundingClientRect().top - viewport.top,
    }));
  return { top: scroller.scrollTop, rows };
});
async function scroll(page, top) {
  await page.locator('[data-mobile-resource-scroll]').evaluate((element, value) => {
    element.scrollTop = value === 'end' ? element.scrollHeight : value;
  }, top);
  await settle(page);
}
async function upload(page, name, count = 1) {
  const total = await page.evaluate(() => window.cloudFixtureStore.fileTotal);
  // 使用真实 BUpload 的文件选择入口以及 HandleBtnGroup 的上传/确认流程。
  await page.locator('input[type=file]').first().setInputFiles(Array.from({ length: count }, (_, index) => ({
    name: count === 1 ? name : `${index}-${name}`, mimeType: 'application/zip', buffer: Buffer.from('cloud scroll fixture'),
  })));
  await page.waitForFunction((expected) => window.cloudFixtureStore.fileTotal === expected, total + count);
  await page.locator('.upload-progress').waitFor({ state: 'hidden' });
  await settle(page);
}
try {
  for (const view of ['table', 'card']) {
    for (const width of [1280, 390]) {
      for (const theme of ['day', 'night']) {
        const page = await browser.newPage({ viewport: { width, height: 900 } });
        const errors = [];
        let puts = 0;
        page.on('pageerror', (error) => errors.push(error.message));
        await page.route('**/*', (route) => {
          const url = new URL(route.request().url());
          if (url.origin !== origin) return route.abort();
          if (url.pathname.startsWith('/__cloud-upload-fixture__/')) {
            assert.equal(route.request().method(), 'PUT');
            puts++;
            return route.fulfill({ status: 200, body: '' });
          }
          return route.continue();
        });
        await page.goto(`${origin}/e2e/cloud-scroll.html?view=${view}&theme=${theme}&count=240&paged&renderProfile=${width < 768 ? 'mobile' : 'desktop'}`);
        await page.locator('.file-card,.field-item').first().waitFor();
        await page.evaluate(async () => {
          window.cloudFixtureStore = (await import('/src/store/cloudSpace.ts')).default();
        });
        for (const density of width < 768 ? ['medium'] : ['medium', 'small', 'large']) {
          await page.evaluate(async (density) => {
            (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, innerWidth < 768);
          }, density);
          await settle(page);
          await scroll(page, 0);
          const name = `顶部上传-${density}.zip`;
          await upload(page, name);
          const atTop = await snapshot(page);
          assert.equal(atTop.top, 0, `${view}/${width}/${density}: stays at top`);
          assert.equal(atTop.rows[0]?.name, name, 'new file immediately visible');
          await page.screenshot({ path: `${output}/${view}-${width}-${theme}-${density}-top.png` });

          // 加载多页后选取第二页的阅读锚点，避免只验首屏。
          if (await page.evaluate(() => window.cloudFixtureStore.filePage) < 3) {
            await scroll(page, 'end');
            await page.waitForFunction(() => window.cloudFixtureStore.filePage >= 2);
            await scroll(page, 'end');
            await page.waitForFunction(() => window.cloudFixtureStore.filePage >= 3);
          }
          await scroll(page, await page.locator('[data-mobile-resource-scroll]').evaluate((element) => element.scrollHeight * 0.6));
          const before = await snapshot(page);
          const pagesBefore = await page.evaluate(() => window.cloudFixtureStore.filePage);
          assert(before.top > 0);
          await upload(page, `浏览中上传-${density}.zip`);
          const after = await snapshot(page);
          const same = after.rows.find((row) => row.name === before.rows[0].name);
          assert(same, `${view}/${width}/${density}: reading file remains visible`);
          assert(Math.abs(same.top - before.rows[0].top) <= 2, `${view}/${width}/${density}: reading offset ${before.rows[0].top} -> ${same.top}`);
          assert(await page.evaluate((pages) => window.cloudFixtureStore.filePage >= pages, pagesBefore));
          await page.screenshot({ path: `${output}/${view}-${width}-${theme}-${density}-reading.png` });
          await upload(page, `批量上传-${density}.zip`, 4);
          const afterBatch = await snapshot(page);
          const batchAnchor = afterBatch.rows.find((row) => row.name === after.rows[0].name);
          assert(batchAnchor && Math.abs(batchAnchor.top - after.rows[0].top) <= 2, `${view}/${width}/${density}: batch upload preserves reading position`);
          results.push({ view, width, theme, density, atTop: atTop.top, readingOffsetDelta: same.top - before.rows[0].top });
          console.log('PASS upload scroll', view, width, theme, density);
        }
        assert.equal(puts, width < 768 ? 6 : 18);
        assert.deepEqual(errors, []);
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}
