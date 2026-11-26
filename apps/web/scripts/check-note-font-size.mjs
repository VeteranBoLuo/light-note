/** Exercise the real note editor, including selection after the mobile drawer takes focus. */
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

const origin = process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'light-note-font-size');
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
});

try {
  for (const theme of ['day', 'night']) {
    const profiles = [
      ...['small', 'medium', 'large'].map((density) => ({ width: 1440, density })),
      { width: 1280, toolbarWidth: 530, density: 'large' },
      { width: 1440, toolbarWidth: 1100, density: 'large', english: true },
      { width: 320, mobile: true, english: true },
      { width: 390, mobile: true },
    ];
    for (const { width, toolbarWidth, density, mobile, english } of profiles) {
      const name = `${theme}-${toolbarWidth || width}-${density || 'mobile'}`;
      const page = await browser.newPage({
        viewport: { width, height: 850 },
        hasTouch: mobile,
        reducedMotion: 'reduce',
      });
      page.setDefaultTimeout(10000);
      try {
        const url = new URL('/e2e/note-image-tools.html', origin);
        url.searchParams.set('theme', theme);
        if (density) url.searchParams.set('density', density);
        if (mobile) url.searchParams.set('renderProfile', 'mobile');
        if (english) url.searchParams.set('locale', 'en-US');
        await page.goto(url.href);
        const body = page.locator('.note-editor-body[contenteditable="true"]');
        await body.waitFor();
        await page.waitForFunction(() => window.tinymce?.activeEditor?.initialized);
        await page.locator('#editor-container').evaluate((editor, size) => {
          editor.style.width = `${size}px`;
        }, toolbarWidth || width);
        await page.locator('.editor-toolbar-v2.is-note-toolbar-compact-width').waitFor({
          state: toolbarWidth || mobile ? 'visible' : 'hidden',
        });
        const fallback = Boolean(mobile || toolbarWidth);
        const sizeLabel = english ? 'Font size' : '字号';
        const fontSize = page.locator('.editor-toolbar-v2').getByRole('button', { name: sizeLabel, exact: true });
        const trigger = fallback
          ? page.getByRole('button', { name: english ? 'More formatting' : '更多格式', exact: true })
          : fontSize;
        const option = (name) => page.getByRole('menuitem', { name, exact: true });
        const fontSizeEntry = option(sizeLabel);
        const back = option(english ? 'Back' : '返回');
        const defaultSize = option(english ? 'Default' : '默认');
        const activate = (target) => (mobile ? target.tap() : target.click());
        async function openSizeMenu() {
          await activate(trigger);
          if (fallback) await activate(fontSizeEntry);
        }
        const select = (selector, partial = false, collapsed = false) =>
          page.evaluate(
            ({ selector, partial, collapsed }) => {
              const editor = window.tinymce.activeEditor;
              editor.focus();
              const node = editor.getBody().querySelector(selector);
              const range = document.createRange();
              if (partial) {
                range.setStart(node.firstChild, 1);
                range.setEnd(node.firstChild, 3);
              } else range.selectNodeContents(node);
              if (collapsed) range.collapse(false);
              editor.selection.setRng(range);
              editor.nodeChanged();
            },
            { selector, partial, collapsed },
          );
        await body.evaluate(() => {
          const editor = window.tinymce.activeEditor;
          editor.setContent(
            '<p><strong style="color:#224466">甲乙丙丁</strong>原大小</p><p>继续输入</p><pre>code</pre>' +
              '<p><span class="ln-text-gradient" style="--ln-gradient-from:#ba2669;--ln-gradient-to:#1748e0"><strong>渐变颜色</strong></span> <span style="color:#168057">普通颜色</span></p>',
          );
          editor.dispatch('input');
          editor.undoManager.clear();
          editor.undoManager.add();
        });
        await select('strong', true);
        assert(
          await page.locator('.editor-toolbar-v2').evaluate((bar) => bar.scrollWidth <= bar.clientWidth),
          `${name}: the toolbar must fit in the editor`,
        );
        if (fallback) assert.equal(await fontSize.count(), 0, name);
        if (mobile) assert.equal(await page.locator('.editor-toolbar-v2__mobile-button').count(), 6, name);
        await activate(trigger);
        if (fallback) {
          await fontSizeEntry.waitFor();
          assert.equal(await option('10.5').count(), 0, name);
          await page.screenshot({ path: join(output, `${name}-more.png`), animations: 'disabled' });
          await activate(fontSizeEntry);
          await activate(back);
          await fontSizeEntry.waitFor();
          await activate(fontSizeEntry);
        }
        await option('10.5').waitFor();
        assert.equal(await option('96').count(), 1, name);
        if (!mobile) {
          const panel = page.locator('.editor-toolbar-v2__font-size-menu:visible');
          assert.equal(await panel.evaluate((element) => getComputedStyle(element).scrollbarWidth), 'none', name);
          await panel.hover();
          await page.mouse.wheel(0, 320);
          await page.waitForFunction(() => document.querySelector('.editor-toolbar-v2__font-size-menu')?.scrollTop > 0);
          await page.mouse.wheel(0, -640);
          await page.waitForFunction(
            () => document.querySelector('.editor-toolbar-v2__font-size-menu')?.scrollTop === 0,
          );
        }
        await page.screenshot({ path: join(output, `${name}.png`), animations: 'disabled' });
        if (mobile) await page.evaluate(() => window.getSelection().removeAllRanges());
        await activate(option('10.5'));
        await body.locator('[style*="font-size: 10.5px"]').waitFor();
        assert.equal(await body.locator('[style*="font-size: 10.5px"]').textContent(), '乙丙', name);
        assert.equal(await body.locator('p:first-child strong').textContent(), '甲乙丙丁', name);
        await page.getByRole('button', { name: english ? 'Undo' : '撤销', exact: true }).click();
        assert.equal(await body.locator('[style*="font-size"]').count(), 0, name);
        await page.evaluate(() => window.tinymce.activeEditor.execCommand('Redo'));
        await select('p');
        await activate(trigger);
        if (fallback) {
          assert.equal(await fontSizeEntry.innerText(), sizeLabel, name);
          await activate(fontSizeEntry);
        } else assert.equal(await fontSize.locator('.editor-toolbar-v2__button-label').innerText(), sizeLabel, name);
        await activate(defaultSize);
        await body.locator('[style*="font-size"]').waitFor({ state: 'detached' });
        const emphasized = body.locator('p:first-child strong');
        assert.equal(await emphasized.textContent(), '甲乙丙丁', name);
        assert.equal(await emphasized.evaluate((node) => node.style.color), 'rgb(34, 68, 102)', name);

        await select('p:nth-of-type(2)', false, true);
        if (mobile) {
          await openSizeMenu();
          await activate(option('48'));
        } else {
          await trigger.press('Enter');
          if (fallback) await fontSizeEntry.press('Enter');
          await defaultSize.waitFor();
          await page.keyboard.press('Escape');
          await defaultSize.waitFor({ state: 'hidden' });
          if (fallback) await fontSizeEntry.press('Enter');
          else await trigger.press('Enter');
          assert.equal(await (fallback ? back : defaultSize).evaluate((item) => item === document.activeElement), true);
          await option('48').focus();
          await page.keyboard.press('Enter');
        }
        await page.waitForFunction(() => window.tinymce.activeEditor.hasFocus());
        await page.keyboard.insertText('新增');
        await body.locator('[style*="font-size: 48px"]').waitFor();
        const saved = await page.evaluate(() => window.tinymce.activeEditor.getContent());
        assert.match(saved, /<p>继续输入<span style="font-size: 48px;">新增<\/span><\/p>/u, name);

        await select('pre');
        if (fallback) {
          await activate(trigger);
          assert.equal(await fontSizeEntry.isDisabled(), true, name);
          await page.keyboard.press('Escape');
          await fontSizeEntry.waitFor({ state: 'hidden' });
        } else assert.equal(await fontSize.isDisabled(), true, name);

        await select('p:nth-of-type(3)');
        const gradientSelection = await body.locator('.ln-text-gradient strong').evaluate((node) => {
          const style = getComputedStyle(node, '::selection');
          return { fill: style.webkitTextFillColor, background: style.backgroundColor };
        });
        assert.equal(gradientSelection.fill, 'rgba(0, 0, 0, 0)', name);
        assert.notEqual(gradientSelection.background, 'rgba(0, 0, 0, 0)', name);
        await body.locator('p:nth-of-type(3)').screenshot({ path: join(output, `${name}-selection.png`) });

        const quickSize = page
          .locator('.ln-text-context-toolbar')
          .getByRole('button', { name: sizeLabel, exact: true });
        if (mobile) assert.equal(await quickSize.count(), 0, name);
        else {
          await select('.ln-text-gradient strong', true);
          await quickSize.click();
          const quickChoice = page.locator('.tox-menu').getByRole('menuitemcheckbox', { name: '28', exact: true });
          await quickChoice.waitFor();
          await page.screenshot({ path: join(output, `${name}-quick-size.png`), animations: 'disabled' });
          await quickChoice.click();
          const formatted = body.locator('p:nth-of-type(3) [style*="font-size: 28px"]');
          assert.equal(await formatted.textContent(), '变颜', name);
          await select('p:nth-of-type(3) [style*="font-size: 28px"]');
          await quickSize.click();
          assert.equal(await quickChoice.getAttribute('aria-checked'), 'true', name);
          await page.keyboard.press('Escape');
        }

        if (theme === 'day' && density === 'medium') {
          await body.evaluate(() => {
            const editor = window.tinymce.activeEditor;
            editor.setContent('<p><strong style="font-size: 38px; color: red">甲乙丙丁</strong></p>');
            editor.dispatch('input');
          });
          await select('strong', true);
          await openSizeMenu();
          await activate(option('默认'));
          const styles = await body
            .locator('strong')
            .evaluateAll((items) => items.map((item) => [item.textContent, item.style.fontSize, item.style.color]));
          assert.deepEqual(styles, [
            ['甲', '38px', 'red'],
            ['乙丙', '', 'red'],
            ['丁', '38px', 'red'],
          ]);

          await select('strong');
          await quickSize.waitFor();
          const editorId = await body.getAttribute('id');
          await page.locator('#editor-container').evaluate((editor) => editor.style.removeProperty('width'));
          await page.setViewportSize({ width: 390, height: 850 });
          await page.locator('.editor-toolbar-v2.is-mobile').waitFor();
          await quickSize.waitFor({ state: 'hidden' });
          await select('strong');
          await page.waitForTimeout(200);
          assert.equal(await quickSize.isVisible(), false, 'Resizing to mobile keeps text selections native');
          assert.equal(await body.getAttribute('id'), editorId, 'Resizing preserves the current editor');
          await page.setViewportSize({ width, height: 850 });
          await page.locator('.editor-toolbar-v2.is-mobile').waitFor({ state: 'hidden' });
          await select('strong');
          await quickSize.waitFor();
        }
        console.log(`Font size verified in ${name}`);
      } finally {
        await page.close();
      }
    }
  }
} finally {
  await browser.close();
}
console.log(`Screenshots in ${output}`);
