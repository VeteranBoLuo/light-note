/** Real TinyMCE regression. Requires the local Web dev server; the harness mocks all business API writes. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.NOTE_IMAGE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use the local Web dev server');
const output = process.env.NOTE_IMAGE_TEST_OUTPUT || join(tmpdir(), 'light-note-image-tools');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const image = '<img src="/brand-scenes/autumn-vista.webp" alt="测试图片" width="280">';
const cases = [
  { name: 'last-image', html: `<p>${image}</p>` },
  { name: 'bare-image', html: image },
  { name: 'existing-paragraph', html: `<p>${image}</p><p><br></p>`, reuse: true },
  { name: 'float-left', html: `<p>${image.replace('<img ', '<img style="float:left" ')}</p><p><br></p>`, reuse: true },
  { name: 'float-right', html: `<p>${image.replace('<img ', '<img style="float:right" ')}</p>` },
  { name: 'following-text', html: `<p>${image}</p><p>原有后文</p>` },
  { name: 'linked-image', html: `<p><a href="https://example.com/original">${image}</a></p>` },
  // TinyMCE 会为不可编辑的普通 figure 自动补充一个可输入的尾段落。
  { name: 'caption', html: `<figure class="image">${image}<figcaption>已有图注</figcaption></figure>`, reuse: true },
  { name: 'list', html: `<ul><li>${image}</li><li>下一个项目</li></ul>` },
  { name: 'table', html: `<table><tbody><tr><td>${image}</td><td>另一个单元格</td></tr></tbody></table>` },
];
const profiles = [
  ...['day', 'night'].flatMap((theme) =>
    ['small', 'medium', 'large'].map((density) => ({ theme, density, width: 1440, mobile: false })),
  ),
  ...[320, 390].flatMap((width) => ['day', 'night'].map((theme) => ({ theme, density: 'large', width, mobile: true }))),
];
const errors = [];
let checked = 0;

try {
  for (const profile of profiles) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: 900 },
      hasTouch: profile.mobile,
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL('/e2e/note-image-tools.html', origin);
    url.searchParams.set('theme', profile.theme);
    url.searchParams.set('density', profile.density);
    if (profile.mobile) url.searchParams.set('renderProfile', 'mobile');
    await page.goto(url.href);
    await page.waitForFunction(() => window.tinymce?.activeEditor?.initialized);
    const id = `${profile.width}-${profile.theme}-${profile.density}`;
    const selectedCases = profile.mobile
      ? cases.filter((item) => ['last-image', 'float-left', 'float-right'].includes(item.name))
      : profile.density === 'medium'
        ? cases
        : cases.slice(0, 1);

    for (const item of selectedCases) {
      const original = await page.evaluate(async (html) => {
        const editor = window.tinymce.activeEditor;
        editor.setContent(html);
        editor.dispatch('input');
        editor.focus();
        await new Promise(requestAnimationFrame);
        editor.undoManager.clear();
        editor.undoManager.add();
        return { html: editor.getContent(), paragraphs: editor.getBody().querySelectorAll('p').length };
      }, item.html);
      const activate = async () => {
        await page
          .locator('.note-editor-body img')
          .first()
          .click({ button: profile.mobile ? 'right' : 'left' });
        const toolbar = page.locator('.ln-image-context-toolbar');
        await toolbar.waitFor();
        // TinyMCE 会复用表格/图片的浮条容器，等待本轮图片按钮和画布适配完成。
        await page.waitForFunction(() => {
          const popup = document.querySelector('.ln-image-context-toolbar');
          return (
            popup?.querySelector('[data-mce-name="lnimageparagraphafter"]') &&
            !popup.querySelector('svg:not([viewBox])')
          );
        });
        const visual = await toolbar.evaluate((popup) => ({
          before: getComputedStyle(popup, '::before').display,
          after: getComputedStyle(popup, '::after').display,
          icons: Array.from(popup.querySelectorAll('.tox-tbtn')).map((button) => {
            const svg = button.querySelector('svg');
            const canvas = svg.getBoundingClientRect();
            const target = button.getBoundingClientRect();
            const bounds = svg.getBBox();
            const viewBox = svg.viewBox.baseVal;
            return {
              name: button.getAttribute('aria-label'),
              width: canvas.width,
              height: canvas.height,
              fitsButton:
                canvas.left >= target.left &&
                canvas.right <= target.right &&
                canvas.top >= target.top &&
                canvas.bottom <= target.bottom,
              fitsCanvas:
                bounds.x >= viewBox.x &&
                bounds.y >= viewBox.y &&
                bounds.x + bounds.width <= viewBox.x + viewBox.width &&
                bounds.y + bounds.height <= viewBox.y + viewBox.height,
            };
          }),
        }));
        assert.equal(visual.before, 'none', 'The image toolbar border must not be obscured by a triangle');
        assert.equal(visual.after, 'none');
        assert.equal(visual.icons.length, 10, `${id}/${item.name}: image toolbar buttons`);
        for (const icon of visual.icons) {
          assert.equal(icon.width, visual.icons[0].width, `${id}: ${icon.name} canvas width`);
          assert.equal(icon.height, visual.icons[0].height, `${id}: ${icon.name} canvas height`);
          assert(icon.fitsButton && icon.fitsCanvas, `${id}: ${icon.name} must not be clipped`);
        }
        if (item.name === 'last-image') await toolbar.screenshot({ path: join(output, `toolbar-${id}.png`) });
        await page.getByRole('button', { name: '在图片后换行', exact: true }).click();
        await page.locator('.ln-image-context-toolbar').waitFor({ state: 'hidden' });
      };
      await activate();
      const inspect = () =>
        page.evaluate(() => {
          const editor = window.tinymce.activeEditor;
          const body = editor.getBody();
          const paragraph = editor.selection.getNode();
          const imageRect = body.querySelector('img').getBoundingClientRect();
          return {
            tag: paragraph.tagName,
            temporary: !!paragraph.closest('[data-mce-bogus]'),
            paragraphTop: paragraph.getBoundingClientRect().top,
            imageBottom: imageRect.bottom,
            paragraphs: body.querySelectorAll('p').length,
            invalid: !!body.querySelector('ul > p, ol > p, tr > p, tbody > p, table > p'),
            html: editor.getContent(),
          };
        });
      const state = await inspect();
      assert.equal(state.tag, 'P', `${id}/${item.name}: caret must enter a paragraph`);
      assert.equal(state.temporary, false);
      assert(state.paragraphTop >= state.imageBottom - 1, `${id}/${item.name}: text must start below the image`);
      assert.equal(state.paragraphs, original.paragraphs + (item.reuse ? 0 : 1), `${id}/${item.name}: paragraph count`);
      assert.equal(state.invalid, false);
      await activate();
      assert.equal((await inspect()).html, state.html, 'Repeating the action must reuse the empty paragraph');
      await page.evaluate(() => window.tinymce.activeEditor.undoManager.undo());
      assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getContent()), original.html);
      await page.evaluate(() => window.tinymce.activeEditor.undoManager.redo());
      assert.equal((await inspect()).tag, 'P', 'Redo must restore the paragraph and caret');
      await page.keyboard.type('图片下方的新文字');
      const saved = await page.evaluate(() => window.tinymce.activeEditor.getContent());
      await page.evaluate((html) => window.tinymce.activeEditor.setContent(html), saved);
      const paragraph = page.locator('.note-editor-body p').filter({ hasText: '图片下方的新文字' });
      assert.equal(await paragraph.count(), 1);
      const paragraphRect = await paragraph.boundingBox();
      const imageRect = await page.locator('.note-editor-body img').first().boundingBox();
      assert(paragraphRect.y >= imageRect.y + imageRect.height - 1, 'Reload must keep the text below the image');
      if (item.name === 'last-image') await page.screenshot({ path: join(output, `paragraph-${id}.png`) });
      checked++;
    }
    console.log(`PASS ${id}: ${selectedCases.length} image paragraph cases`);
    await page.close();
  }
  assert.deepEqual(errors, []);
  console.log(`Passed ${checked} browser cases; screenshots: ${output}`);
} finally {
  await browser.close();
}
