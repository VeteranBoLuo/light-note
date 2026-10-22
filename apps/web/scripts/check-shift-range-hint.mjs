/** Keyboard hint on real batch toolbars with in-memory fixtures; no business requests. */
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
const origin = process.env.RANGE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'lightnote-shift-range-hint');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const profiles = ['day', 'night'].flatMap((theme) =>
  ['small', 'medium', 'large'].map((density) => ({ theme, density, width: 1440 })),
);
const cases = [
  {
    name: 'cloud',
    file: 'cloud-scroll',
    params: { count: 12, batch: '', view: 'table' },
    toolbar: '.resource-batch-action-bar',
    row: '.field-item',
  },
  {
    name: 'bookmark-manage',
    file: 'batch-entry',
    params: { module: 'bookmarks' },
    toolbar: '.resource-batch-action-bar',
    row: '.bookmark-card',
  },
  {
    name: 'inbox',
    file: 'range-selection',
    params: { module: 'inbox' },
    toolbar: '.inbox-batch',
    row: '.resource-inbox-entry',
  },
  {
    name: 'suggestions',
    file: 'organize-outcomes',
    params: { volume: '' },
    toolbar: '.resource-batch-toolbar',
    row: '.group-priority .workspace-resource',
  },
];
const report = [];
try {
  for (const test of cases)
    for (const profile of [
      ...profiles,
      ...(test.name === 'cloud' ? [{ theme: 'day', density: 'large', width: 900, lang: 'en' }] : []),
    ]) {
      const name = `${test.name}-${profile.theme}-${profile.density}${profile.lang ? '-en-narrow' : ''}`;
      const page = await browser.newPage({ viewport: { width: profile.width, height: 900 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) =>
        new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
      );
      const url = new URL(`/e2e/${test.file}.html`, origin);
      for (const [key, value] of Object.entries({ ...test.params, ...profile }))
        url.searchParams.set(key, String(value));
      try {
        await page.goto(url.href);
        if (test.name === 'cloud') {
          await page.waitForFunction(() => window.__cloudBatchFixture && !window.__cloudBatchFixture.cloud.loading);
          await page.evaluate(() => window.__cloudBatchFixture.enterBatch());
        } else if (test.name === 'bookmark-manage') await page.locator('.bookmark-batch-toggle').click();
        else if (test.name === 'suggestions') await page.getByRole('button', { name: '批量应用', exact: true }).click();
        const toolbar = page.locator(test.toolbar).first();
        await toolbar.waitFor();
        const first = page.locator(test.row).first().getByRole('checkbox').first();
        await first.waitFor();
        await page.evaluate(
          async (density) => (await import('/src/composables/useUiDensity.ts')).applyUiDensity(density, false),
          profile.density,
        );
        // Let the toolbar's entry transition finish before measuring layout stability.
        await toolbar.evaluate(async (element) => {
          await document.fonts.ready;
          await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
          await Promise.all(element.getAnimations().map((animation) => animation.finished));
        });
        await page.waitForTimeout(250);
        const before = await toolbar.boundingBox();
        const checked = await page.getByRole('checkbox', { checked: true }).count();
        const hint = page.locator('.range-selection-hint');
        await page.keyboard.down('Shift');
        await hint.waitFor();
        assert.match(await hint.innerText(), profile.lang ? /click a start item/ : /先点起点/);
        await page.keyboard.down('Shift');
        assert.equal(await hint.count(), 1);
        assert.equal(
          await page.getByRole('checkbox', { checked: true }).count(),
          checked,
          'Holding Shift must not select anything',
        );
        const after = await toolbar.boundingBox();
        for (const key of ['x', 'y', 'width', 'height'])
          assert(
            Math.abs(before[key] - after[key]) < 0.1,
            `${name}: toolbar ${key} moved from ${before[key]} to ${after[key]}`,
          );
        const bounds = await hint.boundingBox();
        assert(
          bounds.x >= 0 &&
            bounds.x + bounds.width <= profile.width &&
            bounds.y >= 0 &&
            bounds.y + bounds.height < after.y,
          `${name}: hint is outside its anchor`,
        );
        assert(
          await hint.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            element.style.pointerEvents = 'auto';
            const visible =
              document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2) === element;
            element.style.removeProperty('pointer-events');
            return visible;
          }),
          `${name}: hint is obscured`,
        );
        await first.click({ modifiers: ['Shift'] });
        await page.waitForFunction(
          (english) =>
            document
              .querySelector('.range-selection-hint')
              ?.textContent.includes(english ? 'click an end item' : '点击终点'),
          !!profile.lang,
        );
        await page.mouse.move(0, 0);
        await page.screenshot({ path: join(output, `${name}.png`) });
        await page.keyboard.up('Shift');
        await hint.waitFor({ state: 'detached' });
        await page.keyboard.down('Shift');
        await hint.waitFor();
        const input = page.locator('input:visible').first();
        if (await input.count()) {
          await input.focus();
          await hint.waitFor({ state: 'detached' });
        }
        await page.keyboard.up('Shift');
        await first.focus();
        await page.keyboard.down('Shift');
        await hint.waitFor();
        await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        await hint.waitFor({ state: 'detached' });
        await page.keyboard.up('Shift');
        await page.keyboard.down('Shift');
        await hint.waitFor();
        if (test.name === 'cloud') await page.evaluate(() => window.__cloudBatchFixture.selection.end());
        else if (test.name === 'inbox')
          await page.evaluate(() => {
            window.rangeFixture.inbox.items = [];
          });
        else if (test.name === 'suggestions') await page.getByRole('button', { name: '取消', exact: true }).click();
        else
          await page.evaluate(async () =>
            (await import('/src/store/resourceSelection.ts')).useResourceSelectionStore().end(),
          );
        await hint.waitFor({ state: 'detached' });
        await page.keyboard.up('Shift');
        assert.deepEqual(errors, [], name);
        report.push({ name, ok: true });
        console.log('PASS', name);
      } catch (error) {
        await page.screenshot({ path: join(output, `${name}-failure.png`) });
        await writeFile(
          join(output, `${name}-failure.txt`),
          `${error.stack}\n${errors.join('\n')}\n${await page.locator('body').innerText()}`,
        );
        throw new Error(`${name}: ${error.message}`);
      } finally {
        await page.close();
      }
    }
  for (const theme of ['day', 'night']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    await page.goto(`${origin}/e2e/cloud-scroll.html?count=12&batch&theme=${theme}&renderProfile=mobile`);
    await page.waitForFunction(() => window.__cloudBatchFixture && !window.__cloudBatchFixture.cloud.loading);
    await page.evaluate(() => window.__cloudBatchFixture.enterBatch());
    await page.locator('.range-selection-toggle').click();
    await page.getByRole('checkbox', { name: '滚动验收资料 1.zip', exact: true }).tap();
    await page.keyboard.down('Shift');
    assert.equal(await page.locator('.range-selection-hint').count(), 0);
    await page.getByText('请点选终点，可滚动列表', { exact: true }).waitFor();
    await page.keyboard.up('Shift');
    await page.close();
    report.push({ name: `mobile-${theme}`, ok: true });
    console.log('PASS', `mobile-${theme}`);
  }
} finally {
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(`Shift hint screenshots: ${output}`);
