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
        await page.getByRole('button', { name: '撤销', exact: true }).click();
        assert.equal(
          (await inspect()).html,
          original,
          `${id}/${item.name}/${key}: Undo restores the original document`,
        );
        if (profile.mobile) {
          await page.getByRole('button', { name: '更多格式', exact: true }).click();
          await page.getByText('重做', { exact: true }).click();
          await page.getByRole('menu', { name: '更多格式', exact: true }).waitFor({ state: 'hidden' });
        } else {
          await page.getByRole('button', { name: '重做', exact: true }).click();
        }
        await page
          .locator('.note-editor-body section.ln-media-text + p')
          .waitFor({ state: 'visible' })
          .catch(async (error) => {
            console.error(`${id}/${item.name}/${key}: redo state`, await inspect());
            throw error;
          });
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

    const insertParagraphAfter = async (index = 0) => {
      const image = page
        .locator('.note-editor-body section.ln-media-text')
        .nth(index)
        .locator('.ln-media-text__media img')
        .first();
      await image.click();
      const button = page.getByRole('button', { name: '在下方插入段落', exact: true });
      await button.waitFor({ state: 'visible' });
      await button.click();
      await button.waitFor({ state: 'hidden' });
      await page.waitForFunction((index) => {
        const editor = window.tinymce.activeEditor;
        const block = editor.getBody().querySelectorAll('section.ln-media-text')[index];
        return (
          document.activeElement === editor.getBody() &&
          editor.selection.getNode() === block.nextElementSibling &&
          block.nextElementSibling?.tagName === 'P'
        );
      }, index);
    };
    for (const suffix of ['', '<p>已有下文</p>', '<p><br></p>', block('<p>下一块图注</p>')]) {
      const original = await prepare(block('<p>图注保留</p>') + suffix, { first: true });
      await page.evaluate(() => window.tinymce.activeEditor.setDirty(false));
      const rect = await page.locator('.note-editor-body section.ln-media-text').first().boundingBox();
      if (profile.mobile) await page.touchscreen.tap(rect.x + rect.width + 6, rect.y + rect.height / 2);
      else await page.mouse.click(rect.x + rect.width + 6, rect.y + rect.height / 2);
      assert.equal((await inspect()).html, original, 'Right-edge clicks never insert or change content');
      assert.equal(await page.evaluate(() => window.tinymce.activeEditor.isDirty()), false);
      checked++;
    }
    const surrounding =
      '<p>前文保留</p>' + block('<p>图注<strong>加粗</strong></p><ul><li>内部列表</li></ul>') + '<p>后文保留</p>';
    const boundaryOriginal = await prepare(surrounding);
    await page.locator('.note-editor-body .ln-media-text__media img').first().click();
    await page.getByRole('button', { name: '在下方插入段落', exact: true }).waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const panel = document.querySelector('.rich-media-text-popover');
      return panel && Number(getComputedStyle(panel).opacity) === 1;
    });
    await page.screenshot({ path: join(output, `paragraph-menu-${id}.png`) });
    await page.keyboard.press('Escape');
    await page.evaluate(() => window.tinymce.activeEditor.setDirty(false));
    await insertParagraphAfter();
    const clicked = await inspect();
    assert.equal(clicked.tag, 'P');
    assert.equal(clicked.afterBlock, true);
    assert.equal(clicked.inCaption, false);
    assert(clicked.top >= clicked.bottom - 1, 'The native caret is below the entire media block');
    assert.equal(await page.locator('.note-editor-body').textContent(), '前文保留图注加粗内部列表后文保留');
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.isDirty()), true);
    assert.equal(await page.locator('[data-ln-media-after-caret]').count(), 0, 'No duplicate side caret');
    const sideCaret = await page
      .locator('.note-editor-body section > figure:last-child')
      .evaluate((item) => getComputedStyle(item, '::after').content);
    assert(['none', 'normal'].includes(sideCaret), 'The side caret pseudo-element is removed');
    await page.screenshot({ path: join(output, `boundary-${id}.png`), caret: 'initial' });
    await page.evaluate(() => window.tinymce.activeEditor.undoManager.undo());
    assert.equal((await inspect()).html, boundaryOriginal, 'One undo removes only the inserted paragraph');
    await page.evaluate(() => window.tinymce.activeEditor.undoManager.redo());
    assert.equal((await inspect()).html, clicked.html, 'Redo restores the paragraph without changing media');
    checked++;

    for (const suffix of ['', '<p>已有后文</p>', '<p><br></p>', block('<p>下一块</p>')]) {
      await prepare(block('<p>原图注</p>') + suffix, { first: true });
      await insertParagraphAfter();
      const state = await inspect();
      assert.equal(state.afterBlock, true, 'The explicit menu action focuses the next paragraph');
      assert.equal(state.inCaption, false);
      assert.equal(await page.locator('.note-editor-body section + p').first().textContent(), '');
      if (suffix.includes('已有后文')) assert.equal(await page.locator('.note-editor-body > p').count(), 2);
      if (suffix === '<p><br></p>') assert.equal(await page.locator('.note-editor-body > p').count(), 1);
      const beforeRepeat = state.html;
      await page.evaluate(() => window.tinymce.activeEditor.setDirty(false));
      await insertParagraphAfter();
      assert.equal((await inspect()).html, beforeRepeat, 'Repeated menu actions reuse the same empty paragraph');
      assert.equal(await page.evaluate(() => window.tinymce.activeEditor.isDirty()), false);
      await page.keyboard.type('New paragraph');
      assert.equal(await page.locator('.note-editor-body section + p').first().textContent(), 'New paragraph');
      assert.equal(await page.locator('figcaption').first().textContent(), '原图注');
      checked++;
    }
    await prepare(block('<p>原图注</p>') + '<p>已有后文</p>');
    await insertParagraphAfter();
    await page.keyboard.type('直接输入');
    assert.equal(await page.locator('.note-editor-body section + p').textContent(), '直接输入');
    assert.equal(await page.locator('.note-editor-body > p').last().textContent(), '已有后文');
    checked++;

    await prepare(block('<p>原图注</p>'));
    await insertParagraphAfter();
    await page.evaluate(() => window.tinymce.activeEditor.insertContent('<p>粘贴后文</p>'));
    assert.equal(await page.locator('figcaption').textContent(), '原图注');
    assert.equal(await page.locator('.note-editor-body section + p').textContent(), '粘贴后文');
    checked++;

    await prepare(cases.find((item) => item.name === 'multiple-rows').html + block('<p>下一块保留</p>'), {
      first: true,
    });
    await insertParagraphAfter();
    assert.equal(await page.locator('.note-editor-body section').count(), 2);
    assert.equal(await page.locator('.note-editor-body img').count(), 3);
    assert.equal((await inspect()).afterBlock, true);
    assert(
      (await inspect()).top >= (await inspect()).bottom - 1,
      'The menu action inserts below the entire multi-row block',
    );
    await page.keyboard.type('块后文字');
    await page.keyboard.press('Enter');
    await page.keyboard.type('第二行');
    assert.equal(await page.locator('.note-editor-body > p').count(), 2);
    assert.equal(await page.locator('figcaption').last().textContent(), '下一块保留');
    checked++;

    await prepare(block('<p>原图注</p>'));
    const beforeCaptionClick = (await inspect()).html;
    await page.locator('figcaption p').click();
    assert.equal((await inspect()).html, beforeCaptionClick, 'Clicks inside the caption keep normal editing');
    assert.equal((await inspect()).inCaption, true);
    checked++;

    // 旧版原生列表命令会将 section 本身改为 li，不能只覆盖 li 内嵌 section。
    const changedTag = block('<p>旧图注<strong>加粗</strong></p><ul><li>内部列表</li></ul>')
      .replace('<section ', '<li ')
      .replace('</section>', '</li>');
    const changedTagSource =
      block('<p>上方图文</p>') + `<ol start="5"><li>前项</li>${changedTag}${changedTag}<li>后项</li></ol>`;
    const repaired = await prepare(changedTagSource);
    assert.equal(await page.locator('.note-editor-body > section').count(), 3);
    assert.equal(await page.locator('.note-editor-body li.ln-media-text').count(), 0);
    assert.deepEqual(
      await page.locator('.note-editor-body > ol').evaluateAll((lists) => lists.map((list) => list.start)),
      [5, 8],
    );
    await insertParagraphAfter(1);
    assert.equal(await page.locator('.note-editor-body > section').count(), 3);
    assert.equal(await page.locator('.note-editor-body img').count(), 3);
    assert.equal(await page.locator('.note-editor-body > section + p').count(), 1);
    await page.screenshot({ path: join(output, `legacy-boundary-${id}.png`), caret: 'initial' });
    await page.evaluate(() => window.tinymce.activeEditor.undoManager.undo());
    assert.equal((await inspect()).html, repaired, 'Undo removes only the added paragraph from repaired content');
    await insertParagraphAfter(2);
    await page.keyboard.type('旧块后续行');
    assert.equal(await page.locator('.note-editor-body > section + p').last().textContent(), '旧块后续行');
    assert.equal(await page.locator('figcaption strong').count(), 2);
    assert.equal(await page.locator('figcaption li').count(), 2);
    checked++;

    const legacy = `<ol start="5"><li>前项</li><li>前半${block('<p>图注</p><ul><li>内部列表</li></ul>')}后半</li><li>后项</li></ol>`;
    await prepare(legacy);
    assert.equal(await page.locator('.note-editor-body > section').count(), 1, 'Legacy media loads outside the list');
    assert.deepEqual(
      await page.locator('.note-editor-body > ol').evaluateAll((lists) => lists.map((list) => list.start)),
      [5, 6],
    );
    assert.equal(await page.locator('figcaption li').textContent(), '内部列表');
    assert.equal(await page.locator('.note-editor-body').textContent(), '前项前半图注内部列表后半后项');
    checked++;

    await page.evaluate(() => {
      const editor = window.tinymce.activeEditor;
      editor.setContent(
        '<ol start="5"><li>前项</li><li>前半<img src="/brand-scenes/autumn-vista.webp" alt="待转换">后半</li><li>后项</li></ol>',
      );
      editor.focus();
      editor.undoManager.clear();
      editor.undoManager.add();
    });
    await page.locator('.note-editor-body img').click({ button: profile.mobile ? 'right' : 'left' });
    await page.getByRole('button', { name: '转为图文组合', exact: true }).click();
    assert.equal(
      await page.locator('.note-editor-body > section').count(),
      1,
      'Image conversion splits the outer list',
    );
    assert.equal(await page.locator('.note-editor-body > ol').first().textContent(), '前项前半');
    assert.equal(await page.locator('.note-editor-body > ol').last().textContent(), '后半后项');
    assert.deepEqual(
      await page.locator('.note-editor-body > ol').evaluateAll((lists) => lists.map((list) => list.start)),
      [5, 6],
    );
    await page.evaluate(() => window.tinymce.activeEditor.undoManager.undo());
    assert.equal(await page.locator('.note-editor-body section').count(), 0);
    assert.equal(await page.locator('.note-editor-body ol li').count(), 3);
    await page.evaluate(() => window.tinymce.activeEditor.undoManager.redo());
    assert.equal(await page.locator('.note-editor-body > section').count(), 1);
    checked++;

    await prepare(block('<p>图注列表</p>'));
    await page.evaluate(() => window.tinymce.activeEditor.execCommand('InsertUnorderedList'));
    assert.equal(await page.locator('figcaption ul li').textContent(), '图注列表');
    assert.equal(await page.locator('.note-editor-body > section').count(), 1);
    checked++;

    await prepare(surrounding);
    await page.evaluate(() => {
      const editor = window.tinymce.activeEditor;
      editor.selection.select(editor.getBody(), true);
      editor.execCommand('InsertOrderedList');
    });
    assert.equal(await page.locator('.note-editor-body section').count(), 1);
    assert.equal(await page.locator('.note-editor-body img').count(), 1);
    assert.equal(
      await page.locator('.note-editor-body li section').count(),
      0,
      'Applying lists across a block keeps its independence',
    );
    assert.equal(await page.locator('.note-editor-body').textContent(), '前文保留图注加粗内部列表后文保留');
    checked++;

    await page.evaluate((html) => {
      const editor = window.tinymce.activeEditor;
      editor.setContent('<ul><li>前半后半</li><li>后项</li></ul>');
      editor.focus();
      editor.selection.setCursorLocation(editor.getBody().querySelector('li').firstChild, 2);
      editor.insertContent(html);
    }, block('<p>粘贴图注</p>'));
    assert.equal(
      await page.locator('.note-editor-body > section').count(),
      1,
      'Pasting a media block into a list lifts it out',
    );
    assert.equal(await page.locator('.note-editor-body').textContent(), '前半粘贴图注后半后项');
    checked++;

    await prepare(block('<p>原图注</p>'));
    await insertParagraphAfter();
    await insertParagraphAfter();
    await page.evaluate(() => window.tinymce.activeEditor.execCommand('Undo'));
    assert.equal(
      await page.locator('.note-editor-body > p').count(),
      0,
      'Undo from a boundary does not invent an extra paragraph',
    );
    assert.equal(await page.locator('.note-editor-body section').count(), 1);
    checked++;

    const tableHtml = `<ol start="3"><li>表格前<table style="width:100%"><tbody><tr><td style="width:50%;padding:12px"><ul><li>单元格前${block('<p>单元格图注</p>')}单元格后</li><li>单元格后项</li></ul></td><td style="width:50%;padding:12px"><p>相邻文字</p></td></tr></tbody></table>表格后</li><li>下一项</li></ol>`;
    const tableOriginal = await prepare(tableHtml);
    assert.equal(
      await page.locator('.note-editor-body table').count(),
      1,
      'Loading a nested media block keeps the table intact',
    );
    assert.equal(await page.locator('.note-editor-body td').count(), 2);
    assert.equal(await page.locator('.note-editor-body td:first-child > section').count(), 1);
    const neighbor = page.locator('.note-editor-body td:last-child p');
    await neighbor.click();
    assert.equal(
      await page.locator('[data-ln-media-after-caret]').count(),
      0,
      'Clicking the neighboring cell must not select the block',
    );
    assert.equal(
      await page.evaluate(
        () =>
          window.tinymce.activeEditor.selection.getNode().closest('td') ===
          window.tinymce.activeEditor.getBody().querySelector('td:last-child'),
      ),
      true,
    );
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    assert.equal(await neighbor.textContent(), '相邻文');
    assert.equal(
      await page.locator('.note-editor-body section').count(),
      1,
      'Editing the neighboring cell must not delete media',
    );
    checked++;

    await prepare(tableHtml);
    await insertParagraphAfter();
    assert.equal(await page.locator('.note-editor-body section').count(), 1);
    assert.equal(await page.locator('.note-editor-body table').count(), 1);
    assert.equal(await page.locator('.note-editor-body td').count(), 2);
    assert.equal(await neighbor.textContent(), '相邻文字');
    assert.equal(await page.locator('.note-editor-body td:first-child > section + p').count(), 1);
    assert.equal(
      await page.locator('.note-editor-body td:first-child').textContent(),
      '单元格前单元格图注单元格后单元格后项',
    );
    await page.evaluate(() => window.tinymce.activeEditor.undoManager.undo());
    assert.equal(
      (await inspect()).html,
      tableOriginal,
      'Undo removes only the paragraph and preserves exact table contents',
    );
    checked++;

    for (const command of ['Bold', 'Italic', 'ForeColor']) {
      await prepare(block('<p>原图注</p>') + '<p>原后文</p>');
      await insertParagraphAfter();
      await page.evaluate(
        (command) =>
          window.tinymce.activeEditor.execCommand(command, false, command === 'ForeColor' ? '#ff0000' : undefined),
        command,
      );
      await page.keyboard.type('新增文字');
      assert.equal(await page.locator('figcaption').textContent(), '原图注');
      assert.equal(await page.locator('.note-editor-body > p').last().textContent(), '原后文');
      const format = command === 'Bold' ? 'strong' : command === 'Italic' ? 'em' : 'span[style]';
      const savedText = await page.evaluate((format) => {
        const doc = new DOMParser().parseFromString(window.tinymce.activeEditor.getContent(), 'text/html');
        return {
          paragraph: doc.querySelector('section + p').textContent,
          formatted: doc.querySelector(`section + p ${format}`).textContent,
        };
      }, format);
      assert.equal(savedText.paragraph, '新增文字', 'Saved text has no temporary formatting caret characters');
      assert.equal(savedText.formatted, '新增文字');
      checked++;
    }
    console.log(`PASS ${id}`);
    await page.close();
  }
  for (const profile of [
    { width: 1440, theme: 'day', density: 'small', mobile: false },
    { width: 390, theme: 'night', density: 'large', mobile: true },
  ]) {
    const page = await browser.newPage({
      viewport: { width: profile.width, height: 900 },
      hasTouch: profile.mobile,
      reducedMotion: 'reduce',
    });
    page.on('pageerror', (error) => errors.push(error.message));
    const url = new URL('/e2e/note-image-tools.html', origin);
    url.searchParams.set('locale', 'en-US');
    url.searchParams.set('theme', profile.theme);
    url.searchParams.set('density', profile.density);
    if (profile.mobile) url.searchParams.set('renderProfile', 'mobile');
    await page.goto(url.href);
    await page.waitForFunction(() => window.tinymce?.activeEditor?.initialized);
    await page.locator('.note-editor-runtime-skeleton').waitFor({ state: 'detached' });
    await page.locator('.note-editor-warmup').waitFor({ state: 'detached' });
    await page.evaluate(
      (html) => {
        const editor = window.tinymce.activeEditor;
        editor.setContent(html);
        editor.focus();
      },
      block('<p>Caption stays</p>') + '<p>Following text stays</p>',
    );
    await page.locator('.ln-media-text__media img').click();
    const button = page.getByRole('button', { name: 'Insert paragraph below', exact: true });
    await button.waitFor({ state: 'visible' });
    await page.waitForFunction(() => {
      const panel = document.querySelector('.rich-media-text-popover');
      return panel && Number(getComputedStyle(panel).opacity) === 1;
    });
    const bounds = await button.evaluate((el) => ({
      left: el.getBoundingClientRect().left,
      right: el.getBoundingClientRect().right,
      width: el.clientWidth,
      scrollWidth: el.scrollWidth,
    }));
    assert(bounds.left >= 0 && bounds.right <= profile.width, 'English action remains inside viewport');
    assert(bounds.scrollWidth <= bounds.width + 1, 'English action label is not clipped');
    await page.screenshot({ path: join(output, `paragraph-menu-en-${profile.width}-${profile.theme}.png`) });
    await button.click();
    await button.waitFor({ state: 'hidden' });
    await page.keyboard.type('New paragraph');
    assert.equal(await page.locator('.note-editor-body section + p').textContent(), 'New paragraph');
    assert.equal(await page.locator('.note-editor-body > p').last().textContent(), 'Following text stays');
    assert.equal(await page.locator('figcaption').textContent(), 'Caption stays');
    checked++;
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
  const readonlyRect = await readonlyPage.locator('.note-editor-body section').boundingBox();
  await readonlyPage.mouse.click(readonlyRect.x + readonlyRect.width + 6, readonlyRect.y + readonlyRect.height / 2);
  assert.equal(
    await readonlyPage.locator('[data-ln-media-after-caret]').count(),
    0,
    'Read-only mode has no side caret',
  );
  assert.equal(
    await readonlyPage.evaluate(() => window.tinymce.activeEditor.getContent()),
    readonlyHtml,
    'Read-only clicks do not append paragraphs',
  );
  await readonlyPage.close();
  assert.deepEqual(errors, []);
  console.log(`Passed ${checked} keyboard cases and read-only guard; screenshots: ${output}`);
} finally {
  await browser.close();
}
