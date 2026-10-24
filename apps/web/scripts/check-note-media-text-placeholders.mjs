/** Empty media slots: local mocked uploads only; exercises the real Vue/TinyMCE editor. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'light-note-media-text-placeholders');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const caption = '<p>原有<strong>加粗</strong><a href="/original">链接</a></p><ul><li>列表保留</li></ul>';
const row = (text = caption, image = '') =>
  `<figure class="ln-media-text__item"><div class="ln-media-text__media">${image}</div><figcaption class="ln-media-text__content">${text}</figcaption></figure>`;
const block = (rows = row(), position = 'left') =>
  `<section class="ln-media-text" data-ln-media-position="${position}" data-ln-media-width="36">${rows}</section>`;
const fixture = block() + '<p>后文保留</p>';
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ theme, density, width: 1440, mobile: false, locale: 'zh-CN' })),
  ),
  ...[320, 390].flatMap((width) =>
    ['day', 'night'].map((theme) => ({ width, theme, density: 'large', mobile: true, locale: 'zh-CN' })),
  ),
  { width: 1440, theme: 'day', density: 'small', mobile: false, locale: 'en-US' },
  { width: 390, theme: 'night', density: 'large', mobile: true, locale: 'en-US' },
];
const errors = [];
let checked = 0;
let png;
const names = (profile) =>
  profile.locale === 'en-US'
    ? { add: /Add image/, remove: 'Delete image', undo: 'Undo', retry: /Add image again/ }
    : { add: /点击添加图片/, remove: '删除图片', undo: '撤销', retry: /重新添加图片/ };
async function open(profile, extra = '') {
  const page = await browser.newPage({
    viewport: { width: profile.width, height: 900 },
    hasTouch: profile.mobile,
    reducedMotion: 'reduce',
    permissions: ['clipboard-read', 'clipboard-write'],
  });
  page.on('pageerror', (error) => errors.push(error.message));
  page.setDefaultTimeout(15000);
  const url = new URL('/e2e/note-image-tools.html', origin);
  for (const key of ['theme', 'density', 'locale']) url.searchParams.set(key, profile[key]);
  if (profile.mobile) url.searchParams.set('renderProfile', 'mobile');
  if (extra) for (const [key, value] of new URLSearchParams(extra)) url.searchParams.set(key, value);
  await page.goto(url.href);
  await page.waitForFunction(() => window.tinymce?.activeEditor?.initialized);
  await page.locator('.note-editor-runtime-skeleton').waitFor({ state: 'detached' });
  await page.locator('.note-editor-warmup').waitFor({ state: 'detached' });
  png ||= await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 240;
    canvas.height = 140;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#8bb8dc';
    ctx.fillRect(0, 0, 240, 140);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return page;
}
const imageFile = () => ({ name: 'slot.png', mimeType: 'image/png', buffer: Buffer.from(png, 'base64') });
async function prepare(page, html = fixture, expectEmpty = true) {
  await page.evaluate((html) => {
    const editor = window.tinymce.activeEditor;
    editor.setContent(html);
    editor.focus();
    editor.undoManager.clear();
    editor.undoManager.add();
    editor.setDirty(false);
  }, html);
  if (expectEmpty) await page.locator('[data-ln-media-image-placeholder]').first().waitFor();
  return page.evaluate(() => window.tinymce.activeEditor.getContent());
}
async function choose(page, button, activation = 'click') {
  const before = await page.evaluate(() => window.tinymce.activeEditor.getContent());
  const pending = page.waitForEvent('filechooser');
  if (activation === 'click') await button.click();
  else {
    await button.focus();
    await button.press(activation);
  }
  assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), before);
  await (await pending).setFiles(imageFile());
}
async function paste(page, target) {
  await target.evaluate((element, png) => {
    const data = new DataTransfer();
    const bytes = Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0));
    data.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  }, png);
}
async function captionsHtml(page) {
  return page.evaluate(() =>
    Array.from(
      new DOMParser()
        .parseFromString(window.tinymce.activeEditor.getContent(), 'text/html')
        .querySelectorAll('figcaption'),
    ).map((node) => node.innerHTML),
  );
}
async function captionHtml(page) {
  return (await captionsHtml(page))[0];
}

async function undo(page, profile) {
  await page.getByRole('button', { name: names(profile).undo, exact: true }).click();
}

try {
  for (const profile of profiles) {
    const page = await open(profile);
    const name = names(profile);
    const id = `${profile.width}-${profile.theme}-${profile.density}-${profile.locale}`;
    const add = page.getByRole('button', { name: name.add }).first();
    const before = await prepare(page);
    const originalCaption = await captionHtml(page);
    assert(!before.includes('data-ln-media-image-placeholder'));
    assert(!before.includes('点击添加图片') && !before.includes('Add image'));
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.isDirty()), false);
    const bounds = await add.boundingBox();
    assert(bounds.width > 0 && bounds.x >= 0 && bounds.x + bounds.width <= profile.width);
    await add.focus();
    for (const key of ['Backspace', 'Delete', 'ArrowRight', 'ArrowDown']) {
      await add.press(key);
      assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), before);
    }
    await page.screenshot({ path: join(output, `empty-${id}.png`), caret: 'initial' });
    checked++;

    await choose(page, add, profile.density === 'small' ? 'Enter' : 'Space');
    await page.locator('section img').waitFor();
    assert.equal(await captionHtml(page), originalCaption);
    assert.equal(await page.locator('.note-editor-body > p').textContent(), '后文保留');
    assert.equal(await page.locator('section').count(), 1);
    await undo(page, profile);
    await add.waitFor();
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), before);
    await page.evaluate(() => window.tinymce.activeEditor.execCommand('Redo'));
    await page.locator('section img').waitFor();
    checked++;

    await page.locator('section img').click();
    await page.getByRole('button', { name: name.remove, exact: true }).click();
    await add.waitFor();
    assert.equal(await page.locator('section img').count(), 0);
    assert.equal(await captionHtml(page), originalCaption);
    await undo(page, profile);
    await page.locator('section img').waitFor();
    await page.evaluate(() => window.tinymce.activeEditor.execCommand('Redo'));
    await add.waitFor();
    checked++;

    await add.focus();
    await paste(page, add);
    await page.locator('section img').waitFor();
    assert.equal(await captionHtml(page), originalCaption);
    await undo(page, profile);
    await add.waitFor();
    checked++;

    await page.evaluate(() => {
      const editor = window.tinymce.activeEditor;
      editor.selection.setCursorLocation(editor.getBody().querySelector('figcaption p').firstChild, 2);
    });
    await page.keyboard.type('右侧新增');
    assert((await captionHtml(page)).includes('右侧新增'));
    const typed = await page.evaluate(() => window.tinymce.activeEditor.getContent());
    await add.evaluate((element) => {
      const data = new DataTransfer();
      data.setData('text/plain', '不应写入图片位');
      element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
    });
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), typed);
    checked++;

    const imageSource = block(row(caption, '<img src="/brand-scenes/autumn-vista.webp">'));
    await prepare(page, imageSource, false);
    await page.evaluate(() => {
      const editor = window.tinymce.activeEditor;
      editor.focus();
      editor.selection.select(editor.getBody().querySelector('section img'));
    });
    await page.keyboard.press('Delete');
    await add.waitFor();
    assert.equal(await captionHtml(page), originalCaption);
    await undo(page, profile);
    await page.locator('section img').waitFor();
    checked++;

    const originalImage = await prepare(page, imageSource, false);
    await page.evaluate(() => {
      const editor = window.tinymce.activeEditor;
      editor.undoManager.transact(() => editor.getBody().querySelector('.ln-media-text__media').remove());
      editor.dispatch('input');
    });
    await add.waitFor();
    assert.equal(await captionHtml(page), originalCaption);
    await undo(page, profile);
    await page.locator('section img').waitFor();
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), originalImage);
    await page.evaluate(() => window.tinymce.activeEditor.execCommand('Redo'));
    await add.waitFor();
    await choose(page, add);
    await page.locator('section img').waitFor();
    assert.equal(await captionHtml(page), originalCaption);
    await undo(page, profile);
    await add.waitFor();
    const saved = await page.evaluate(() => window.tinymce.activeEditor.getContent());
    await page.evaluate((html) => window.tinymce.activeEditor.setContent(html), saved);
    await add.waitFor();
    assert.equal(await captionHtml(page), originalCaption);
    checked++;

    await prepare(page, block(row() + row('<p>第二行<strong>原文</strong></p>'), 'right'));
    const captions = await captionsHtml(page);
    await choose(page, page.getByRole('button', { name: name.add }).nth(1));
    await page.locator('figure').nth(1).locator('img').waitFor();
    assert.equal(await page.locator('figure').first().locator('img').count(), 0);
    await page.waitForFunction(() => document.querySelectorAll('[data-ln-media-image-placeholder]').length === 1);
    assert.equal(await page.locator('[data-ln-media-image-placeholder]').count(), 1);
    assert.deepEqual(await captionsHtml(page), captions);
    checked++;

    await prepare(
      page,
      '<table><tbody><tr><td>' + fixture + '</td><td><p>相邻单元格保留</p></td></tr></tbody></table>',
    );
    await choose(page, add);
    await page.locator('section img').waitFor();
    assert.equal(await page.locator('table').count(), 1);
    assert.equal(await page.locator('td').count(), 2);
    assert.equal(await page.locator('td:last-child').textContent(), '相邻单元格保留');
    assert.equal(await captionHtml(page), originalCaption);
    checked++;

    await page.close();
    console.log(`PASS ${id}`);
  }
  for (const profile of [profiles[1], profiles[9]]) {
    const page = await open(profile, 'serverImages&imageUploadFailure=once&imageUploadDelay=700');
    const name = names(profile);
    const add = page.getByRole('button', { name: name.add }).first();
    const original = await prepare(page);
    const originalCaption = await captionHtml(page);
    await choose(page, add);
    await page.getByRole('progressbar').waitFor();
    assert.equal(await page.getByRole('progressbar').getAttribute('aria-valuenow'), '50');
    await paste(page, page.locator('[data-ln-media-image-placeholder]'));
    await page.getByRole('button', { name: name.retry }).waitFor();
    assert.equal(await page.locator('section img').count(), 0);
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), original);
    await page.screenshot({ path: join(output, `error-${profile.width}-${profile.theme}.png`) });
    checked++;
    await choose(page, page.getByRole('button', { name: name.retry }));
    await page.getByRole('progressbar').waitFor();
    await page.screenshot({ path: join(output, `loading-${profile.width}-${profile.theme}.png`) });
    await page.locator('figcaption p').click();
    await page.keyboard.press('End');
    await page.keyboard.type('上传中继续编辑');
    await page.locator('section img').waitFor();
    assert((await captionHtml(page)).includes('上传中继续编辑'));
    assert.equal(await page.locator('figcaption strong').textContent(), '加粗');
    assert.equal(await page.locator('figcaption li').textContent(), '列表保留');
    assert.equal(
      await page.evaluate(() => window.tinymce.activeEditor.selection.getNode().closest('figcaption') !== null),
      true,
    );
    checked++;
    await prepare(page);
    await choose(page, add);
    await page.getByRole('progressbar').waitFor();
    await page.evaluate(() => window.tinymce.activeEditor.setContent('<p>已经切换的新内容</p>'));
    await page.waitForFunction(() => !document.querySelector('[data-ln-media-image-placeholder]'));
    await page.getByText('图文组合已发生变化，请重新选择后再操作', { exact: true }).waitFor({ state: 'visible' });
    assert.equal(await page.locator('.note-editor-body').textContent(), '已经切换的新内容');
    assert.equal(await page.locator('.note-editor-body img').count(), 0);
    checked++;
    await page.close();
  }

  const native = await open(profiles[1]);
  await prepare(native);
  const nativeCaption = await captionHtml(native);
  // Headless browser context clipboard: exercise the real keyboard paste event, not just a synthetic event.
  await native.evaluate(async (png) => {
    const bytes = Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0));
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': new Blob([bytes], { type: 'image/png' }) })]);
  }, png);
  await native.getByRole('button', { name: /点击添加图片/ }).focus();
  await native.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await native.locator('section img').waitFor();
  assert.equal(await captionHtml(native), nativeCaption);
  console.log('PASS native clipboard PNG keyboard paste');
  checked++;
  const copiedSource = await native.locator('section img').getAttribute('src');
  await native.evaluate(() => {
    const editor = window.tinymce.activeEditor;
    editor.focus();
    editor.selection.select(editor.getBody().querySelector('section img'));
  });
  await native.keyboard.press(process.platform === 'darwin' ? 'Meta+C' : 'Control+C');
  assert(
    await native.evaluate(async () =>
      (await navigator.clipboard.read()).some((item) => item.types.includes('text/html')),
    ),
  );
  await prepare(native);
  await native.getByRole('button', { name: /点击添加图片/ }).focus();
  await native.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await native.locator('section img').waitFor();
  assert.equal(await native.locator('section img').getAttribute('src'), copiedSource);
  assert.equal(await captionHtml(native), nativeCaption);
  await undo(native, profiles[1]);
  await native.getByRole('button', { name: /点击添加图片/ }).waitFor();
  checked++;
  await native.evaluate(async () =>
    navigator.clipboard.write([
      new ClipboardItem({
        'text/html': new Blob(['<img src="/brand-scenes/autumn-vista.webp" alt="复制的图片"><p>不替换原文</p>'], {
          type: 'text/html',
        }),
      }),
    ]),
  );
  await native.getByRole('button', { name: /点击添加图片/ }).focus();
  await native.keyboard.press(process.platform === 'darwin' ? 'Meta+V' : 'Control+V');
  await native.locator('section img').waitFor();
  assert.equal(await native.locator('section img').getAttribute('alt'), '复制的图片');
  assert.equal(await captionHtml(native), nativeCaption);
  assert(!(await native.evaluate(() => window.tinymce.activeEditor.getContent())).includes('不替换原文'));
  checked++;
  const unsafeBefore = await prepare(native);
  await native.getByRole('button', { name: /点击添加图片/ }).evaluate((element) => {
    const data = new DataTransfer();
    data.setData('text/html', '<img src="javascript:alert(1)" onerror="alert(2)">');
    element.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
  });
  assert.equal(await native.evaluate(() => window.tinymce.activeEditor.getContent()), unsafeBefore);
  checked++;
  console.log('PASS copied HTML images and unsupported URL guard');
  await native.close();

  const readonly = await open(profiles[0], 'readonly');
  await prepare(readonly);
  assert.equal(await readonly.getByRole('button', { name: /点击添加图片/ }).count(), 0);
  assert.equal(await readonly.locator('[data-ln-media-image-placeholder]').textContent(), '暂无图片');
  const readHtml = await readonly.evaluate(() => window.tinymce.activeEditor.getContent());
  assert(!readHtml.includes('暂无图片'));
  await readonly.close();
  checked++;
  assert.deepEqual(errors, []);
  console.log(`Passed ${checked} placeholder checks; screenshots: ${output}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
}
