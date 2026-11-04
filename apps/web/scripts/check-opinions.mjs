import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://127.0.0.1:5173';
const output = process.env.LIGHTNOTE_OPINIONS_SCREENSHOTS || path.join(os.tmpdir(), 'lightnote-opinions-review');
const browser = await chromium.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
fs.mkdirSync(output, { recursive: true });
const errors = [];
const metrics = [];
let scenarios = 0;
const imageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a8T8AAAAASUVORK5CYII=';
async function open(width = 1440, params = {}, height = 900) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('pageerror', (error) => errors.push(String(error)));
  // 仅拦截真实 API 地址，不能误拦 Vite 的 /src/api/ 模块导入。
  await page.route(`${origin}/api/**`, (route) => route.abort());
  const query = new URLSearchParams({ ...params, ...(width < 768 ? { renderProfile: 'mobile' } : {}) });
  await page.goto(`${origin}/e2e/opinions.html?${query}`);
  await page.locator('.opinion-panel').waitFor();
  if (params.tab === 'history' && !['empty', 'error'].includes(params.state))
    await page.locator('.opinion-history-entry').first().waitFor();
  return page;
}
const calls = (page, endpoint) =>
  page.evaluate((endpoint) => window.opinionFixture.calls.filter((call) => call.url.endsWith(endpoint)), endpoint);
async function assertFits(page) {
  const layout = await page.evaluate(() => {
    const root = document.querySelector('.opinion-panel');
    const rect = root.getBoundingClientRect();
    return {
      left: rect.left,
      right: rect.right,
      width: innerWidth,
      scroll: root.scrollWidth,
      client: root.clientWidth,
    };
  });
  assert(layout.left >= 0 && layout.right <= layout.width + 1, JSON.stringify(layout));
  assert(layout.scroll <= layout.client + 1, `horizontal overflow: ${JSON.stringify(layout)}`);
}

async function checkPasteArea(page) {
  const target = page.locator('.opinion-paste-target');
  let chooserCount = 0;
  const countChooser = () => {
    chooserCount++;
  };
  page.on('filechooser', countChooser);
  await target.click();
  assert.equal(await target.evaluate((el) => document.activeElement === el), true);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  await page.keyboard.type('This area only accepts images');
  assert.equal(await target.textContent(), '');
  await target.click({ button: 'right' });
  await page.keyboard.press('Escape');
  assert.equal(await target.evaluate((el) => document.activeElement === el), true);
  assert.equal(chooserCount, 0, 'clicking the paste area must not open a file chooser');
  await target.evaluate((el, base64) => {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    const transfer = new DataTransfer();
    transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
  }, imageBase64);
  await page.locator('.opinion-image').waitFor();
  assert.equal(await page.locator('.opinion-paste-description').count(), 1);
  await page.locator('.opinion-image__remove').click();
  const chooserReady = page.waitForEvent('filechooser');
  await page.locator('.opinion-upload-trigger').click();
  const chooser = await chooserReady;
  assert.equal(chooserCount, 1, 'the explicit choose-images button must open the file chooser once');
  await chooser.setFiles({ name: 'selected.png', mimeType: 'image/png', buffer: Buffer.from(imageBase64, 'base64') });
  assert.equal(
    await target.evaluate((el) => document.activeElement === el),
    false,
    'file selection must keep focus separate from pasting',
  );
  await page.locator('.opinion-image').waitFor();
  await page.locator('.opinion-image__remove').click();
  page.off('filechooser', countChooser);
  await page.locator('h1').click();
}

try {
  for (const width of [1440, 390, 320]) {
    for (const theme of ['day', 'night']) {
      for (const density of width === 1440 ? ['small', 'standard', 'large'] : ['large']) {
        for (const tab of ['form', 'history']) {
          const page = await open(width, { theme, density, tab });
          await assertFits(page);
          if (tab === 'form') {
            const submit = page.locator('.opinion-compose [type=submit]');
            assert.equal(await submit.isDisabled(), true);
            const rect = await submit.boundingBox();
            assert(rect && rect.y + rect.height <= 900, `submit not visible: ${width} ${density}`);
            if (width < 768) {
              assert.equal(await page.locator('html').getAttribute('data-density'), 'standard');
              assert(rect.height >= 44);
            } else {
              await checkPasteArea(page);
            }
          } else {
            assert.equal(await page.locator('.opinion-history-entry').count(), 2);
            assert.equal(await page.locator('.opinion-mobile-actions').count(), 0);
            const reply = page.locator('.opinion-reply p');
            assert.equal(await reply.evaluate((el) => getComputedStyle(el).webkitLineClamp), 'none');
          }
          await page.waitForTimeout(350);
          await page.screenshot({ path: path.join(output, `${width}-${theme}-${density}-${tab}.png`) });
          await page.close();
          scenarios++;
        }
      }
    }
  }

  // 窄屏英文、展开联系方式和图片添加/删除都使用真实基础组件。
  for (const width of [320, 390]) {
    const page = await open(width, { locale: 'en-US', theme: 'night', density: 'large' });
    await page.locator('.opinion-contact-toggle').click();
    await page.locator('.opinion-contact__input input').fill('example@example.invalid');
    await page.locator('textarea').fill('A detailed feedback draft that should survive switching tabs.');
    await page.locator('[role=tab]').nth(1).click();
    await page.locator('.opinion-history-entry').first().waitFor();
    await page.locator('[role=tab]').first().click();
    assert.match(await page.locator('textarea').inputValue(), /survive switching tabs/);
    assert.equal(await page.locator('.opinion-contact__input input').inputValue(), 'example@example.invalid');
    await assertFits(page);
    assert(
      (await page.locator('[role=radio]').first().boundingBox()).height < 52,
      'English label breaks inside a word',
    );
    await page.waitForTimeout(350);
    await page.screenshot({ path: path.join(output, `${width}-night-english-contact.png`) });
    await page.close();
    scenarios++;
  }

  const page = await open(1440, { submitError: '1', slow: '1' });
  await page.locator('textarea').fill('    ');
  assert.equal(await page.locator('[type=submit]').isDisabled(), true);
  await page.locator('textarea').fill('  建议保留最近使用的标签  ');
  await page.locator('.opinion-contact-toggle').click();
  await page.locator('.opinion-contact__input input').fill('feedback@example.invalid');
  await page.locator('[role=radio]').first().focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.locator('[role=radio]').nth(1).getAttribute('aria-checked'), 'true');
  const image = {
    name: 'screenshot.png',
    mimeType: 'image/png',
    buffer: Buffer.from(imageBase64, 'base64'),
  };
  await page.locator('input[type=file]').setInputFiles(image);
  await page.locator('.opinion-image').waitFor();
  await page.locator('.opinion-image__preview').click();
  await page.locator('.b-image-viewer').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('.b-image-viewer').waitFor({ state: 'hidden' });
  await page.locator('.opinion-image__remove').click();
  assert.equal(await page.locator('.opinion-image').count(), 0);
  // 拖放、粘贴与文件选择使用同一份草稿，保留上传区的按钮和说明。
  for (const event of ['drop', 'paste']) {
    await page
      .locator(event === 'paste' ? '.opinion-paste-target' : '.opinion-upload-dropzone')
      .evaluate((zone, event) => {
        const transfer = new DataTransfer();
        transfer.items.add(new File(['image'], `${event}.png`, { type: 'image/png' }));
        zone.dispatchEvent(
          event === 'drop'
            ? new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true })
            : new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }),
        );
      }, event);
    await page.waitForFunction(
      (count) => document.querySelectorAll('.opinion-image').length === count,
      event === 'drop' ? 1 : 2,
    );
    assert.equal(await page.locator('.opinion-upload-trigger').count(), 1);
  }
  await page.locator('[type=submit]').click();
  assert.equal(await page.locator('[type=submit]').isDisabled(), true);
  await page.waitForFunction(() => document.querySelector('[type=submit]')?.getAttribute('aria-busy') === null);
  assert.match(await page.locator('textarea').inputValue(), /最近使用/);
  assert.equal(await page.locator('.opinion-image').count(), 2);
  await page.locator('[type=submit]').click();
  await page.locator('.opinion-history-entry').first().waitFor();
  const submissions = await calls(page, '/recordOpinion');
  assert.equal(submissions.length, 2);
  assert.equal(submissions[1].data.content, '建议保留最近使用的标签');
  assert.equal(submissions[1].data.phone, 'feedback@example.invalid');
  assert.equal(JSON.parse(submissions[1].data.imgArray).length, 2);
  await page.locator('[role=tab]').first().click();
  assert.equal(await page.locator('textarea').inputValue(), '');
  assert.equal(await page.locator('.opinion-contact__input').count(), 0);
  await page.close();
  scenarios++;

  for (const state of ['empty', 'error', 'unread']) {
    const page = await open(390, { state, tab: 'history', theme: 'night' });
    if (state === 'empty') {
      await page.locator('.opinion-empty').waitFor();
      assert.equal(await page.locator('.opinion-history-entry').count(), 0);
      await page.locator('.opinion-empty button').click();
      await page.locator('textarea').waitFor();
    } else if (state === 'error') {
      await page.locator('.opinion-retry').click();
      await page.locator('.opinion-history-entry').first().waitFor();
      assert.equal(await page.locator('.opinion-retry').count(), 0);
    } else {
      assert.equal((await calls(page, '/markOpinionReplyViewed')).length, 1);
      assert.equal((await calls(page, '/getOpinionList')).length, 2);
      assert.equal(await page.locator('.tab-badge').count(), 0);
    }
    await assertFits(page);
    await page.close();
    scenarios++;
  }

  // 同一数据和视口对比三档容量；长列表必须自动续页并保持完整正文。
  for (const density of ['small', 'standard', 'large']) {
    const page = await open(1440, { density, tab: 'history', state: 'many' });
    metrics.push(
      await page.locator('.opinion-history-entry').evaluateAll(
        (entries, density) => ({
          density,
          visible: entries.filter((entry) => {
            const r = entry.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight;
          }).length,
        }),
        density,
      ),
    );
    await page.locator('.opinion-page').evaluate(async (el) => {
      for (let i = 0; i < 10; i++) {
        el.scrollTop = el.scrollHeight;
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    });
    assert.equal(await page.locator('.opinion-history-entry').count(), 45);
    assert.equal((await calls(page, '/getOpinionList')).length, 3);
    await page.close();
    scenarios++;
  }
  assert(metrics[0].visible > metrics[1].visible, `compact capacity did not improve: ${JSON.stringify(metrics)}`);

  for (const [width, height] of [
    [320, 568],
    [844, 390],
  ]) {
    for (const theme of ['day', 'night']) {
      const page = await open(width, { theme, density: 'large', renderProfile: 'mobile' }, height);
      await page.locator('textarea').fill('小屏幕下仍然可以填写并提交反馈。');
      await page.locator('.opinion-contact-toggle').click();
      await page.locator('.opinion-contact__input input').fill('small-screen@example.invalid');
      const submit = page.locator('[type=submit]');
      await submit.scrollIntoViewIfNeeded();
      const rect = await submit.boundingBox();
      assert(rect && rect.y >= 0 && rect.y + rect.height <= height + 1, `short viewport: ${width}x${height}`);
      await assertFits(page);
      await page.close();
      scenarios++;
    }
  }
  const switching = await open(1440, { tab: 'history', state: 'many' });
  await switching.locator('.opinion-page').evaluate((el) => {
    el.scrollTop = 600;
  });
  const firstVisible = () =>
    switching
      .locator('.opinion-history-entry')
      .evaluateAll(
        (entries) => entries.find((entry) => entry.getBoundingClientRect().bottom > 0)?.textContent?.split('：')[0],
      );
  const anchor = await firstVisible();
  await switching.evaluate(() => window.opinionFixture.setDensity('small'));
  await switching.waitForTimeout(150);
  assert.equal(await firstVisible(), anchor, 'density change lost the current feedback');
  await switching.close();
  scenarios++;
  assert.equal(errors.length, 0, errors.join('\n'));
  console.log(JSON.stringify({ scenarios, densityCapacity: metrics, errors, screenshots: output }, null, 2));
} finally {
  await browser.close();
}
