/** Exercises sidebar resizing, drag-to-collapse and persistence without contacting business services. */
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = process.env.LIGHTNOTE_VISUAL_OUTPUT || '/tmp/lightnote-cloud-sidebar-resize';
await mkdir(output, { recursive: true });
const key = 'light-note:cloud-folder-sidebar-width';
const collapsedKey = 'light-note:cloud-folder-sidebar-collapsed';
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ width: 1440, theme, density, view: 'table' })),
  ),
  { width: 1280, theme: 'day', density: 'large', view: 'card', lang: 'en' },
  // 窄桌面窗口的页面留白最小，展开按钮仍不能顶到窗口边或压住表头。
  { width: 1024, theme: 'day', density: 'large', view: 'table' },
  ...['day', 'night'].map((theme) => ({ width: 390, theme, density: 'medium', view: 'table' })),
];
const results = [];
const widthOf = (page) => page.locator('.cloud-folder-sidebar').evaluate((el) => el.getBoundingClientRect().width);
async function waitWidth(page, expected) {
  await page.waitForFunction((value) => {
    const sidebar = document.querySelector('.cloud-folder-sidebar');
    return sidebar && Math.abs(sidebar.getBoundingClientRect().width - value) < 1;
  }, expected);
}
async function drag(page, delta) {
  const box = await page.locator('[role=separator]').boundingBox();
  assert(box);
  await page.mouse.move(box.x + box.width / 2, box.y + 60);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + delta, box.y + 60, { steps: 8 });
  await page.mouse.up();
}
try {
  for (const profile of profiles) {
    const page = await browser.newPage({ viewport: { width: profile.width, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    const query = new URLSearchParams({
      scope: '1',
      count: '125',
      paged: '1',
      ...profile,
      lang: profile.lang || 'zh',
      renderProfile: profile.width < 768 ? 'mobile' : 'desktop',
    });
    await page.goto(`${origin}/e2e/cloud-scroll.html?${query}`);
    await page.waitForFunction(
      () => window.__cloudBatchFixture?.cloud.fileTotal === 1 && !window.__cloudBatchFixture.cloud.loading,
    );
    if (profile.width < 768) {
      assert.equal(await page.getByRole('separator').count(), 0);
      await page.screenshot({ path: `${output}/mobile-${profile.theme}.png` });
    } else {
      const defaultWidth = await widthOf(page);
      const defaultToken = await page.evaluate(() =>
        parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-layout-230')),
      );
      assert.equal(defaultWidth, defaultToken);
      const edge = await page.getByRole('separator').boundingBox();
      const sidebar = await page.locator('.cloud-folder-sidebar').boundingBox();
      const list = await page.locator('.content-area .field-list').boundingBox();
      // 与笔记共用分隔条：落在文件夹栏与文件列表之间留白的正中，并常显一个小把手。
      assert(
        Math.abs(edge.x + edge.width / 2 - (sidebar.x + sidebar.width + list.x) / 2) < 1,
        'resize handle sits in the middle of the gap',
      );
      const handle = await page.getByRole('separator').evaluate((el) => ({
        marker: getComputedStyle(el, '::after').content,
        opacity: Number(getComputedStyle(el, '::after').opacity),
      }));
      assert.notEqual(handle.marker, 'none', 'a visible grip marks the draggable edge');
      assert(handle.opacity > 0);
      await page.getByRole('separator').hover();
      if (profile.density === 'medium' && profile.theme === 'day') {
        await page.locator('.b-tooltip-popup:visible').filter({ hasText: '双击' }).waitFor();
      }
      const filesBefore = await page.evaluate(() => {
        const f = window.__cloudBatchFixture;
        return { total: f.cloud.fileTotal, folder: f.cloud.folder.id, requests: f.requests.length };
      });
      await drag(page, 100);
      await waitWidth(page, defaultWidth + 100);
      assert.equal(Number(await page.evaluate((key) => localStorage.getItem(key), key)), defaultWidth + 100);
      assert.deepEqual(
        await page.evaluate(() => {
          const f = window.__cloudBatchFixture;
          return { total: f.cloud.fileTotal, folder: f.cloud.folder.id, requests: f.requests.length };
        }),
        filesBefore,
        'resizing never reloads files or writes account preferences',
      );
      await page.getByRole('separator').hover();
      await page.screenshot({ path: `${output}/${profile.theme}-${profile.density}-${profile.view}-wide.png` });
      await page.reload();
      await page.waitForFunction(
        () => window.__cloudBatchFixture?.cloud.fileTotal === 1 && !window.__cloudBatchFixture.cloud.loading,
      );
      await waitWidth(page, defaultWidth + 100);
      if (profile.density === 'medium') {
        await page.evaluate(() => window.__cloudBatchFixture.applyUiDensity('small'));
        await waitWidth(page, defaultWidth + 100);
        await page.evaluate(() => window.__cloudBatchFixture.applyUiDensity('large'));
        await waitWidth(page, defaultWidth + 100);
        await page.evaluate(() => window.__cloudBatchFixture.applyUiDensity('medium'));
      }
      await drag(page, 1200);
      const savedWidth = await widthOf(page);
      const maxWidth = Number(await page.getByRole('separator').getAttribute('aria-valuemax'));
      assert.equal(savedWidth, maxWidth);
      await page.setViewportSize({ width: 800, height: 900 });
      await page.waitForFunction(
        (width) => document.querySelector('.cloud-folder-sidebar').getBoundingClientRect().width < width,
        savedWidth,
      );
      assert.equal(
        Number(await page.evaluate((key) => localStorage.getItem(key), key)),
        savedWidth,
        'narrow windows preserve the saved preference',
      );
      await page.setViewportSize({ width: profile.width, height: 900 });
      await waitWidth(page, savedWidth);
      await page.getByRole('separator').dblclick();
      await waitWidth(page, defaultWidth);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
      await page.getByRole('separator').focus();
      await page.keyboard.press('ArrowRight');
      assert((await widthOf(page)) > defaultWidth);
      // 与笔记一致：Home / End 到最窄 / 最宽，双击恢复默认。
      const minimum = Number(await page.getByRole('separator').getAttribute('aria-valuemin'));
      await page.keyboard.press('Home');
      await waitWidth(page, minimum);
      await page.getByRole('separator').dblclick();
      await waitWidth(page, defaultWidth);
      // 拖到最窄后继续拖：出现「松手收起」，松手收起，并记住拖动前的宽度。
      await drag(page, 120);
      await waitWidth(page, defaultWidth + 120);
      await drag(page, -1200);
      await page.locator('.cloud-folder-sidebar.is-collapsed .cloud-folder-sidebar__expand').waitFor();
      assert.equal(await page.getByRole('separator').count(), 0);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), collapsedKey), '1');
      assert.equal(Number(await page.evaluate((key) => localStorage.getItem(key), key)), defaultWidth + 120);
      // 收起后列表铺满内容区；展开按钮跨在文件卡片左边框上，不被裁掉、不顶到窗口边，也不压住表头或第一张卡片。
      const collapsedLayout = await page.evaluate(() => {
        const area = document.querySelector('.content-area');
        const list = document.querySelector('.content-area .field-list');
        const button = document.querySelector('.cloud-folder-sidebar__expand');
        const first = list.querySelector('.field-header-label, .file-card-grid .file-card');
        const areaRect = area.getBoundingClientRect();
        const style = getComputedStyle(area);
        const listRect = list.getBoundingClientRect();
        const buttonRect = button.getBoundingClientRect();
        const centerX = buttonRect.left + buttonRect.width / 2;
        return {
          listLeftGap: listRect.left - (areaRect.left + parseFloat(style.paddingLeft)),
          listRightGap: areaRect.right - parseFloat(style.paddingRight) - listRect.right,
          straddles: buttonRect.left < listRect.left && buttonRect.right > listRect.left,
          clipped: buttonRect.left < areaRect.left - 0.5,
          windowGap: buttonRect.left,
          contentGap: first.getBoundingClientRect().left - buttonRect.right,
          topHit:
            document.elementFromPoint(centerX, buttonRect.top + buttonRect.height / 2)?.closest(
              '.cloud-folder-sidebar__expand',
            ) === button,
        };
      });
      const layoutInfo = JSON.stringify(collapsedLayout);
      assert(Math.abs(collapsedLayout.listLeftGap) < 1 && Math.abs(collapsedLayout.listRightGap) < 1, layoutInfo);
      assert(collapsedLayout.straddles && !collapsedLayout.clipped && collapsedLayout.topHit, layoutInfo);
      assert(collapsedLayout.windowGap >= 4 && collapsedLayout.contentGap >= 4, layoutInfo);
      await page.screenshot({ path: `${output}/${profile.theme}-${profile.density}-${profile.view}-collapsed.png` });
      await page.reload();
      await page.waitForFunction(
        () => window.__cloudBatchFixture?.cloud.fileTotal === 1 && !window.__cloudBatchFixture.cloud.loading,
      );
      await page.locator('.cloud-folder-sidebar.is-collapsed .cloud-folder-sidebar__expand').waitFor();
      await page.locator('.cloud-folder-sidebar__expand').click();
      await waitWidth(page, defaultWidth + 120);
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), collapsedKey), null);
      // ⌘\ / Ctrl+\ 开关文件夹栏，与笔记开关页面树是同一个键。
      const toggle = process.platform === 'darwin' ? 'Meta+Backslash' : 'Control+Backslash';
      await page.locator('body').click({ position: { x: 5, y: 5 } });
      await page.keyboard.press(toggle);
      await page.locator('.cloud-folder-sidebar.is-collapsed .cloud-folder-sidebar__expand').waitFor();
      await page.keyboard.press(toggle);
      await waitWidth(page, defaultWidth + 120);
      await page.getByRole('separator').dblclick();
      await waitWidth(page, defaultWidth);

      // Pointer cancellation restores both the previous preference and the document's interaction styles.
      await page.getByRole('separator').dispatchEvent('pointerdown', { pointerId: 72, button: 0, clientX: 250 });
      await page.evaluate(() => {
        document.dispatchEvent(new PointerEvent('pointermove', { pointerId: 72, clientX: 320 }));
        document.dispatchEvent(new PointerEvent('pointercancel', { pointerId: 72 }));
      });
      await waitWidth(page, defaultWidth);
      assert.equal(await page.evaluate(() => document.body.style.userSelect), '');
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), key), null);
      if (profile.density === 'medium') {
        await page.evaluate(() => window.__cloudBatchFixture.applyUiDensity('small'));
        await waitWidth(page, 207);
        await page.evaluate(() => window.__cloudBatchFixture.applyUiDensity('large'));
        await waitWidth(page, 253);
        await page.evaluate(() => window.__cloudBatchFixture.applyUiDensity('medium'));
      }
      await page.getByRole('separator').focus();
      await page.screenshot({ path: `${output}/${profile.theme}-${profile.density}-${profile.view}-reset.png` });
      // Existing HTML drag entry points remain available after pointer-based resizing.
      const transfer = await page.evaluateHandle(() => new DataTransfer());
      await page.locator('.field-item, .file-card').first().dispatchEvent('dragstart', { dataTransfer: transfer });
      assert.equal(await page.evaluate(() => window.__cloudBatchFixture.cloud.draggingFile?.id), '1');
      await page.locator('.field-item, .file-card').first().dispatchEvent('dragend', { dataTransfer: transfer });
      await transfer.dispose();
      assert.equal(await page.locator('.drag-overlay').count(), 0);
      assert.equal(await page.evaluate(() => document.body.style.cursor), '');
    }
    assert.deepEqual(errors, []);
    results.push({ ...profile, passed: true });
    await page.close();
  }
  for (const storage of ['invalid', 'blocked']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/*', (route) =>
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort(),
    );
    await page.addInitScript(
      ({ key, storage }) => {
        if (storage === 'invalid') localStorage.setItem(key, 'invalid-width');
        else
          for (const method of ['getItem', 'setItem', 'removeItem']) {
            const original = Storage.prototype[method];
            Storage.prototype[method] = function (name, ...args) {
              if (name === key) throw new DOMException('Storage unavailable', 'SecurityError');
              return original.call(this, name, ...args);
            };
          }
      },
      { key, storage },
    );
    await page.goto(`${origin}/e2e/cloud-scroll.html?scope&view=table`);
    await waitWidth(page, 230);
    await drag(page, 100);
    await waitWidth(page, 330);
    await page.getByRole('separator').dblclick();
    await waitWidth(page, 230);
    assert.deepEqual(errors, []);
    results.push({ storage, passed: true });
    await page.close();
  }
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify({ passed: results.length, output }));
} finally {
  await browser.close();
}
