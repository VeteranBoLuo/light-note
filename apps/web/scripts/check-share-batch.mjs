import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-share-batch';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const results = [];
async function open(path, width, height = 900) {
  const page = await browser.newPage({ viewport: { width, height } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) =>
    new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
  );
  await page.goto(`${origin}${path}`);
  return { page, errors };
}
async function selected(page) {
  return page.evaluate(async () =>
    (await import('/src/store/resourceSelection.ts')).useResourceSelectionStore().items.map((item) => item.id),
  );
}
try {
  for (const view of process.env.SHARE_ONLY || process.env.EDGE_ONLY ? [] : ['table', 'card'])
    for (const theme of ['day', 'night']) {
      for (const [width, density] of [
        [1440, 'small'],
        [1440, 'default'],
        [1440, 'large'],
        [390, 'default'],
      ]) {
        const { page, errors } = await open(
          `/e2e/cloud-scroll.html?view=${view}&theme=${theme}&count=120&paged&numericIds&preview&renderProfile=${width < 768 ? 'mobile' : 'desktop'}`,
          width,
        );
        const rows = page.locator('.file-card,.field-item');
        await rows.first().waitFor();
        await page.evaluate(
          async ({ density, mobile }) => {
            (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, mobile);
            if (mobile) {
              const user = (await import('/src/store/index.ts')).useUserStore();
              const scope = (await import('/src/api/noteDetailPrefetch.ts')).buildNoteDetailRequestScope(user);
              (await import('/src/store/resourceSelection.ts')).useResourceSelectionStore().start('files', scope);
            }
          },
          { density, mobile: width < 768 },
        );
        if (width >= 768) await page.locator('.batch-toggle-btn').click();
        const first = rows.first();
        const label = first.locator('.file-name,.file-card-name');
        await label.click();
        assert.deepEqual(await selected(page), ['1']);
        assert.equal(await first.locator('[role=checkbox]').getAttribute('aria-checked'), 'true');
        assert.match(await first.getAttribute('class'), /--selected/);
        // Repeated row background click must undo selection for a numeric ID.
        await first.click({ position: { x: 5, y: 5 } });
        assert.deepEqual(await selected(page), []);
        await first.locator('[role=checkbox]').click();
        assert.deepEqual(await selected(page), ['1']);
        const preview = first.locator('.batch-preview-button');
        const buttonBox = await preview.boundingBox();
        assert(buttonBox && buttonBox.width > 0 && buttonBox.x + buttonBox.width <= width);
        if (width < 768) assert(buttonBox.height >= 44, `Mobile preview height ${buttonBox.height}`);
        const beforeScroll = await page.locator('[data-mobile-resource-scroll]').evaluate((el) => el.scrollTop);
        await preview.focus();
        await page.keyboard.press('Enter');
        await page.locator('.preview-text').waitFor();
        assert.match(await page.locator('.preview-text').innerText(), /批量预览验收内容 1/);
        assert.deepEqual(await selected(page), ['1']);
        await page.locator('.preview-controls button').nth(1).click();
        await page.waitForFunction(() =>
          document.querySelector('.preview-text')?.textContent.includes('批量预览验收内容 2'),
        );
        assert.deepEqual(await selected(page), ['1']);
        await page.locator('.header-close-btn').click();
        await page.locator('.fullscreen-preview').waitFor({ state: 'detached' });
        assert.deepEqual(await selected(page), ['1']);
        assert.equal(await page.locator('[data-mobile-resource-scroll]').evaluate((el) => el.scrollTop), beforeScroll);
        await page.screenshot({ path: `${output}/cloud-${view}-${width}-${theme}-${density}.png` });
        // Selection survives virtual scrolling and newly loaded pages.
        await page.locator('[data-mobile-resource-scroll]').evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });
        await page.waitForFunction(async () => (await import('/src/store/cloudSpace.ts')).default().filePage >= 2);
        assert.deepEqual(await selected(page), ['1']);
        await page.locator('[data-mobile-resource-scroll]').evaluate((el) => {
          el.scrollTop = 0;
        });
        await rows.first().locator('.file-name,.file-card-name').click();
        assert.deepEqual(await selected(page), []);
        assert.deepEqual(errors, []);
        results.push({ flow: 'cloud', view, width, theme, density, status: 'passed' });
        console.log('PASS cloud', view, width, theme, density);
        await page.close();
      }
    }
  if (!process.env.SHARE_ONLY) {
    const { page, errors } = await open('/e2e/cloud-scroll.html?view=table&preview&count=4', 1280);
    await page.locator('.field-item').first().waitFor();
    await page.locator('.batch-toggle-btn').click();
    const rows = page.locator('.field-item');
    await rows.first().locator('.file-name').click();
    await rows.first().locator('.file-name').click();
    assert.deepEqual(await selected(page), []);
    await rows.nth(1).locator('.file-name').click();
    await page.route('**/__preview-missing__', (route) => route.fulfill({ status: 404, body: '' }));
    await page.evaluate(async () => {
      const cloud = (await import('/src/store/cloudSpace.ts')).default();
      cloud.fileList[0].fileUrl = `${location.origin}/__preview-missing__`;
    });
    await rows.first().locator('.batch-preview-button').click();
    await page.locator('.preview-error').waitFor();
    assert.deepEqual(await selected(page), ['2']);
    await page.keyboard.press('Escape');
    await page.locator('.fullscreen-preview').waitFor({ state: 'detached' });
    assert.deepEqual(await selected(page), ['2']);
    assert.deepEqual(errors, []);
    results.push({ flow: 'cloud', state: 'string IDs / unselected preview / error / Escape', status: 'passed' });
    console.log('PASS cloud string IDs and failed preview');
    await page.close();
  }
  for (const width of process.env.CLOUD_ONLY || process.env.EDGE_ONLY ? [] : [1440, 390])
    for (const theme of ['day', 'night']) {
      const { page, errors } = await open(
        `/e2e/android-share-capture.html?scenario=bulk&theme=${theme}&renderProfile=${width < 768 ? 'mobile' : 'desktop'}`,
        width,
      );
      await page.locator('.file-list__item').first().waitFor();
      assert.equal(await page.locator('.file-list__item').count(), 100);
      assert.equal(
        await page
          .locator('[data-testid=bridge-log]')
          .getByText(/读取分享文件/)
          .count(),
        0,
      );
      assert.match(await page.locator('.share-file-report').innerText(), /100.*500MB/);
      await page.getByRole('button', { name: '查看未加入的文件', exact: true }).click();
      assert.match(await page.locator('#share-skipped-details').innerText(), /第101张.jpg/);
      assert.match(await page.locator('#share-skipped-details').innerText(), /大视频.mp4/);
      assert.match(await page.locator('#share-skipped-details').innerText(), /已失效.jpg/);
      await page.waitForTimeout(400);
      await page.screenshot({ path: `${output}/share-${width}-${theme}.png` });
      await page.getByRole('button', { name: '加入待整理', exact: true }).click();
      try {
        await page.waitForFunction(
          () => document.querySelector('[data-testid=bridge-log]')?.textContent.includes('share.complete'),
          undefined,
          { timeout: 30000 },
        );
      } catch (error) {
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${output}/share-failure.png` });
        console.log(
          'Share failure',
          await page.locator('.capture-modal').innerText(),
          await page.locator('[data-testid=bridge-log]').innerText(),
          errors,
        );
        throw error;
      }
      assert.equal(
        await page
          .locator('[data-testid=bridge-log]')
          .getByText(/读取分享文件/)
          .count(),
        100,
      );
      assert.equal(
        await page
          .locator('[data-testid=bridge-log]')
          .getByText(/share.complete/)
          .count(),
        1,
      );
      assert.deepEqual(errors, []);
      results.push({ flow: 'share', width, theme, status: 'passed' });
      console.log('PASS share', width, theme);
      await page.close();
    }
} finally {
  await writeFile(
    `${output}/${process.env.SHARE_ONLY ? 'share-results' : process.env.CLOUD_ONLY ? 'cloud-results' : 'results'}.json`,
    JSON.stringify(results, null, 2),
  );
  await browser.close();
}
