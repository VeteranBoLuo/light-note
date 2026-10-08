import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-cloud-virtualization';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const results = [];
async function open(view, width, theme, query = 'count=5000') {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await page.goto(
    `${origin}/e2e/cloud-scroll.html?view=${view}&theme=${theme}&${query}&renderProfile=${width < 768 ? 'mobile' : 'desktop'}`,
  );
  await page.locator('.file-card,.field-item').first().waitFor();
  await page.evaluate(async () => {
    window.cloudFixtureStore = (await import('/src/store/cloudSpace.ts')).default();
  });
  return { page, errors };
}
async function scroll(page, top) {
  await page.locator('[data-mobile-resource-scroll]').evaluate((element, top) => {
    element.scrollTop = top === 'end' ? element.scrollHeight : top;
  }, top);
  await page.waitForTimeout(200);
}
const visibleNames = (page) =>
  page.locator('[data-mobile-resource-scroll]').evaluate((scroller) => {
    const viewport = scroller.getBoundingClientRect();
    return [...scroller.querySelectorAll('.file-card,.field-item')]
      .filter(
        (element) =>
          element.getBoundingClientRect().bottom > viewport.top + 1 &&
          element.getBoundingClientRect().top < viewport.bottom,
      )
      .map((element) => element.querySelector('.file-card-name,.file-name')?.textContent);
  });
try {
  for (const view of ['table', 'card'])
    for (const width of [1280, 390])
      for (const theme of ['day', 'night']) {
        const { page, errors } = await open(view, width, theme);
        await page.waitForTimeout(250);
        const metrics = await page.evaluate(() => ({
          nodes: document.querySelectorAll('*').length,
          rows: document.querySelectorAll('.file-card,.field-item').length,
          overflow: document.documentElement.scrollWidth - innerWidth,
        }));
        assert(metrics.rows < 80);
        assert(metrics.overflow <= 2);
        await scroll(page, 'end');
        assert((await visibleNames(page)).includes('滚动验收资料 5000.zip'));
        await scroll(page, 10000);
        for (const density of ['small', 'large', 'medium']) {
          const before = await visibleNames(page);
          await page.evaluate(
            async ({ density, mobile }) => {
              (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, mobile);
            },
            { density, mobile: width < 768 },
          );
          await page.waitForTimeout(250);
          assert((await visibleNames(page)).includes(before[0]), `${view} density anchor ${density}`);
          await page.screenshot({ path: `${output}/${view}-${width}-${theme}-${density}.png` });
        }
        if (width === 1280 && view === 'card') {
          for (const nextWidth of [1500, 900, 1280]) {
            const before = await visibleNames(page);
            await page.setViewportSize({ width: nextWidth, height: 900 });
            await page.waitForTimeout(300);
            assert((await visibleNames(page)).includes(before[0]), `grid resize anchor ${nextWidth}`);
          }
        }
        assert.deepEqual(errors, []);
        results.push({ view, width, theme, ...metrics });
        console.log('PASS capacity, tail and anchors', view, width, theme, metrics);
        await page.close();
      }
  for (const view of ['table', 'card']) {
    const { page, errors } = await open(view, 1280, 'day', 'count=240&paged');
    assert.equal(await page.evaluate(() => window.cloudFixtureStore.fileList.length), 48);
    for (let number = 2; number <= 5; number++) {
      await scroll(page, 'end');
      await page.waitForFunction((number) => window.cloudFixtureStore.filePage === number, number);
    }
    assert.equal(await page.evaluate(() => window.cloudFixtureStore.fileHasMore), false);
    assert.equal(await page.evaluate(() => window.cloudFixtureStore.fileList.length), 240);
    await scroll(page, 0);
    await page.locator('.batch-toggle-btn').click();
    await page.locator('.file-card,.field-item').first().click();
    await scroll(page, 'end');
    await scroll(page, 0);
    assert.equal(await page.locator('.file-card--selected,.field-item--selected').count(), 1);
    await page.locator('.batch-toggle-btn').click();
    await page
      .locator('.file-card,.field-item')
      .first()
      .evaluate((element) => {
        window.cloudFixtureDrag = new DataTransfer();
        element.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: window.cloudFixtureDrag }));
      });
    assert.equal(await page.evaluate(() => window.cloudFixtureStore.draggingFile?.id), '1');
    await scroll(page, 'end');
    const source = page.locator('.file-card,.field-item').filter({ hasText: '滚动验收资料 1.zip' });
    assert.equal(await source.count(), 1);
    await source.evaluate((element) =>
      element.dispatchEvent(
        new DragEvent('dragend', {
          bubbles: true,
          dataTransfer: window.cloudFixtureDrag,
        }),
      ),
    );
    assert.equal(await page.evaluate(() => window.cloudFixtureStore.draggingFile), null);
    if (view === 'table') {
      await scroll(page, 0);
      await page.evaluate(() => {
        window.cloudFixtureStore.fileList[0].isRename = true;
      });
      await page.locator('.field-item input').fill('未提交的重命名.zip');
      await scroll(page, 'end');
      assert.equal(await page.locator('.field-item input').inputValue(), '未提交的重命名.zip');
    } else {
      await scroll(page, 0);
      for (const target of ['[data-cloud-file-id="3"]', '[data-cloud-file-id="3"] .file-more-button']) {
        await page.locator(target).focus();
        for (const width of [1500, 900, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.waitForTimeout(250);
          assert.equal(
            await page.evaluate(() => document.activeElement.closest('[data-cloud-file-id]')?.dataset.cloudFileId),
            '3',
          );
          assert(await page.locator(target).evaluate((element) => element === document.activeElement));
        }
      }
    }
    assert.deepEqual(errors, []);
    console.log('PASS pagination, selection and active operation retention', view);
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/metrics.json`, JSON.stringify(results, null, 2));
}
