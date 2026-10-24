/** Real TinyMCE keyboard regression; uses the local harness with mocked business writes. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use the local Web dev server');
const output = join(tmpdir(), 'light-note-media-text-navigation');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const row = (caption) =>
  `<figure class="ln-media-text__item"><div class="ln-media-text__media"><img src="/brand-scenes/autumn-vista.webp" alt="测试图片"></div><figcaption class="ln-media-text__content">${caption}</figcaption></figure>`;
const block = (caption, extra = '') =>
  `<section class="ln-media-text" data-ln-media-position="left" data-ln-media-width="36">${extra}${row(caption)}</section>`;
const cases = [
  { name: 'plain', html: block('<p>末尾图注</p>') },
  { name: 'formatted', html: block('<p>末尾<strong><em>图注</em></strong></p>') },
  { name: 'empty', html: block('<p><br></p>') },
  { name: 'multiline', html: block('<p>前一段</p><p>末尾图注</p>') },
  { name: 'multiple-rows', html: block('<p>末尾图注</p>', row('<p>第一行图注</p>')) },
  { name: 'nested', html: `<blockquote>${block('<p>末尾图注</p>')}</blockquote>` },
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
    const prepare = (html, options = {}) =>
      page.evaluate(
        async ({ html, options }) => {
          const editor = window.tinymce.activeEditor;
          editor.setContent(html);
          editor.dispatch('input');
          editor.focus();
          await new Promise(requestAnimationFrame);
          const captions = editor.getBody().querySelectorAll('.ln-media-text__content');
          const caption = captions[options.first ? 0 : captions.length - 1];
          editor.selection.select(caption, true);
          editor.selection.collapse(false);
          if (options.offset !== undefined) {
            editor.selection.setCursorLocation(caption.querySelector('p').firstChild, options.offset);
          }
          if (options.select) editor.selection.select(caption, true);
          editor.undoManager.clear();
          editor.undoManager.add();
          return editor.getContent();
        },
        { html, options },
      );
    const inspect = () =>
      page.evaluate(() => {
        const editor = window.tinymce.activeEditor;
        const node = editor.selection.getNode();
        const block = editor.getBody().querySelector('section.ln-media-text');
        return {
          html: editor.getContent(),
          tag: node.tagName,
          inCaption: !!node.closest('.ln-media-text__content'),
          afterBlock: node.previousElementSibling === block,
          childrenAfterBlock:
            block.parentElement.children.length - Array.from(block.parentElement.children).indexOf(block) - 1,
          top: node.getBoundingClientRect().top,
          bottom: block.getBoundingClientRect().bottom,
          text: node.textContent,
          temporary: !!node.closest('[data-mce-bogus]'),
        };
      });
    for (const item of cases) {
      for (const key of ['ArrowRight', 'ArrowDown']) {
        const original = await prepare(item.html);
        await page.keyboard.press(key);
        const state = await inspect();
        assert.equal(state.tag, 'P', `${id}/${item.name}/${key}: paragraph`);
        assert.equal(state.inCaption, false, `${id}/${item.name}/${key}: leave the caption`);
        assert.equal(state.afterBlock, true);
        assert.equal(state.childrenAfterBlock, 1);
        assert.equal(state.temporary, false);
        assert(state.top >= state.bottom - 1, `${id}/${item.name}: caret below the entire block`);
        await page.keyboard.press(key);
        assert.equal((await inspect()).html, state.html, 'Repeated arrows must not add blank paragraphs');
        await page.evaluate(() => window.tinymce.activeEditor.undoManager.undo());
        assert.equal((await inspect()).html, original, 'Undo restores the original document');
        await page.evaluate(() => window.tinymce.activeEditor.undoManager.redo());
        assert.equal((await inspect()).afterBlock, true, 'Redo restores the caret');
        await page.keyboard.type('Continue below');
        const saved = (await inspect()).html;
        await page.evaluate((html) => window.tinymce.activeEditor.setContent(html), saved);
        assert.equal(await page.locator('.note-editor-body section + p').textContent(), 'Continue below');
        if (item.name === 'plain' && key === 'ArrowRight') {
          await page.screenshot({ path: join(output, `${id}.png`) });
        }
        checked++;
      }
    }

    // Existing following content and earlier rows continue using native browser navigation.
    for (const suffix of ['<p>3、后文</p>', '<p><br></p>']) {
      for (const key of ['ArrowRight', 'ArrowDown']) {
        const original = await prepare(block('<p>图注</p>') + suffix);
        await page.keyboard.press(key);
        const state = await inspect();
        assert.equal(state.html, original);
        assert.equal(state.inCaption, false);
        assert.equal(state.afterBlock, true);
        checked++;
      }
    }
    for (const key of ['ArrowRight', 'ArrowDown']) {
      const original = await prepare(cases.find((item) => item.name === 'multiple-rows').html, { first: true });
      await page.keyboard.press(key);
      assert.equal((await inspect()).html, original, 'Earlier rows must not create a trailing paragraph');
      checked++;
    }
    for (const [key, options] of [
      ['ArrowRight', { offset: 1 }],
      ['ArrowDown', { offset: 1 }],
      ['Shift+ArrowRight', {}],
      ['Shift+ArrowDown', {}],
      ['Control+ArrowRight', {}],
      ['Alt+ArrowDown', {}],
      ['ArrowRight', { select: true }],
      ['ArrowDown', { select: true }],
    ]) {
      const original = await prepare(cases[0].html, options);
      await page.keyboard.press(key);
      assert.equal((await inspect()).html, original, `${key}: preserve text movement and selection`);
      checked++;
    }
    const original = await prepare(block('<p>图注</p><p><br></p>'));
    await page.evaluate(() => {
      const editor = window.tinymce.activeEditor;
      editor.selection.setCursorLocation(editor.getBody().querySelector('figcaption p').firstChild, 2);
    });
    await page.keyboard.press('ArrowRight');
    assert.equal(
      (await inspect()).html,
      original,
      'An empty paragraph inside the caption is still a native caret destination',
    );
    assert.equal((await inspect()).inCaption, true);
    checked++;
    console.log(`PASS ${id}`);
    await page.close();
  }
  const readonlyPage = await browser.newPage();
  await readonlyPage.goto(new URL('/e2e/note-image-tools.html?readonly', origin).href);
  await readonlyPage.waitForFunction(() => window.tinymce?.activeEditor?.initialized);
  const readonlyHtml = await readonlyPage.evaluate((html) => {
    const editor = window.tinymce.activeEditor;
    editor.setContent(html);
    editor.selection.select(editor.getBody().querySelector('figcaption'), true);
    editor.selection.collapse(false);
    editor.dispatch('keydown', new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    editor.dispatch('keydown', new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    return editor.getContent();
  }, cases[0].html);
  assert(!readonlyHtml.includes('</section>\n<p>'), 'Read-only mode must not append content');
  await readonlyPage.close();
  assert.deepEqual(errors, []);
  console.log(`Passed ${checked} keyboard cases and read-only guard; screenshots: ${output}`);
} finally {
  await browser.close();
}
