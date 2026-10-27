import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1280, 390])
    for (const theme of ['day', 'night']) {
      for (const density of width === 390 ? ['standard'] : ['compact', 'standard', 'comfortable']) {
        const page = await browser.newPage({
          viewport: { width, height: 900 },
          hasTouch: width === 390,
          isMobile: width === 390,
        });
        page.setDefaultTimeout(5000);
        await page.goto(
          `${process.env.LIGHTNOTE_WEB_ORIGIN || 'http://localhost:5173'}/e2e/community-chat-inline-emoji.html?theme=${theme}&renderProfile=${width === 390 ? 'mobile' : 'desktop'}`,
        );
        const editor = page.locator('.chat-composer-input__rich');
        await editor.waitFor();
        const token = await page.evaluate(async (density) => {
          const { densityCssVariables } = await import('/src/config/uiDensity.ts');
          for (const [key, value] of Object.entries(densityCssVariables(density)))
            document.documentElement.style.setProperty(key, value);
          const element = document.querySelector('.chat-composer-input__rich');
          window.caretFixture = {
            input: element.__vueParentComponent.exposed,
            state: element.__vueParentComponent.parent.setupState,
          };
          return element.querySelector('img').dataset.inlineEmojiToken;
        }, density);
        const draft = () => page.evaluate(() => window.caretFixture.state.draft);
        const reset = async (value) => {
          await page.evaluate((value) => {
            window.caretFixture.state.draft = value;
          }, value);
          await page.waitForFunction(
            (value) => document.querySelector('.chat-composer-input__rich')?.__vueParentComponent.props.value === value,
            value,
          );
          await page.evaluate(() => new Promise(requestAnimationFrame));
        };
        const clickSide = async (index, side, expected) => {
          const box = await editor.locator('[data-emoji-atom]').nth(index).boundingBox();
          const x = box.x + box.width * (side === 'left' ? 0.2 : 0.8);
          const y = box.y + box.height / 2;
          if (width === 390) {
            // Separate single taps so the browser does not turn this into emoji double-tap selection.
            await page.waitForTimeout(400);
            await page.touchscreen.tap(x, y);
          } else await page.mouse.click(x, y);
          assert.deepEqual(await page.evaluate(() => window.caretFixture.input.getSelectionRange()), {
            start: expected,
            end: expected,
          });
        };
        const undo = async () => {
          await page.keyboard.press('Control+z');
        };
        const checkDraft = async (value) => {
          try {
            await page.waitForFunction((value) => window.caretFixture.state.draft === value, value);
          } catch {
            assert.equal(await draft(), value);
          }
        };
        for (const prefix of ['', '测试']) {
          await reset(prefix + token);
          await clickSide(0, 'left', prefix.length);
          if (!prefix) {
            const caret = await page.evaluate(() => {
              const selection = window.getSelection();
              const range = selection.getRangeAt(0);
              return {
                textNode: range.startContainer.nodeType === Node.TEXT_NODE,
                height: range.getBoundingClientRect().height,
              };
            });
            assert.equal(caret.textNode, true);
            assert(caret.height > 0, 'leading caret must have a real text line box');
          }
          await page.keyboard.insertText('左');
          await checkDraft(prefix + '左' + token);
          await undo();
          await checkDraft(prefix + token);
          await clickSide(0, 'right', prefix.length + token.length);
          await page.keyboard.insertText('右');
          await checkDraft(prefix + token + '右');
          await page.keyboard.press('Backspace');
          await checkDraft(prefix + token);
          assert.equal(await editor.locator('[data-composer-caret-sentinel]').count(), 1);
          await page.keyboard.press('Backspace');
          await checkDraft(prefix);
          await undo();
          await checkDraft(prefix + token);
          await page.keyboard.press('Control+Shift+z');
          await checkDraft(prefix);
          await undo();
          await checkDraft(prefix + token);
          await clickSide(0, 'left', prefix.length);
          await page.keyboard.press('Delete');
          await checkDraft(prefix);
          await undo();
          await checkDraft(prefix + token);
          await clickSide(0, 'right', prefix.length + token.length);
          await page.keyboard.press('Shift+Enter');
          await checkDraft(prefix + token + '\n');
          await page.keyboard.insertText('下一行');
          await checkDraft(prefix + token + '\n下一行');
          await undo();
          await checkDraft(prefix + token + '\n');
          await undo();
          await checkDraft(prefix + token);
        }
        await reset(token);
        await clickSide(0, 'left', 0);
        await page.keyboard.press('Backspace');
        await checkDraft(token);
        await clickSide(0, 'left', 0);
        await editor.screenshot({ path: `/tmp/lightnote-leading-caret-${width}-${theme}-${density}.png`, caret: 'initial' });
        await page.keyboard.press('Home');
        await page.keyboard.press('Delete');
        await checkDraft('');
        await undo();
        await checkDraft(token);
        await clickSide(0, 'left', 0);
        const cdp = await page.context().newCDPSession(page);
        await cdp.send('Input.imeSetComposition', { text: '中文', selectionStart: 2, selectionEnd: 2 });
        await cdp.send('Input.insertText', { text: '中文' });
        await checkDraft('中文' + token);
        await page.keyboard.press('Backspace');
        await checkDraft('中' + token);
        await undo();
        await checkDraft('中文' + token);
        await cdp.detach();
        await reset('前文\n' + token);
        await clickSide(0, 'left', 3);
        assert(await page.evaluate(() => window.getSelection().anchorNode.nodeType === Node.TEXT_NODE));
        await page.keyboard.insertText('行首');
        await checkDraft('前文\n行首' + token);
        await undo();
        await checkDraft('前文\n' + token);
        await reset(token + '\n字');
        await page.evaluate(() => {
          window.caretFixture.input.focus();
          window.caretFixture.input.setSelectionRange(window.caretFixture.state.draft.length);
        });
        await page.keyboard.press('Backspace');
        await checkDraft(token + '\n');
        await page.keyboard.press('Backspace');
        await checkDraft(token);
        await undo();
        await checkDraft(token + '\n');
        await reset(token + token + '尾');
        await clickSide(0, 'right', token.length);
        await page.keyboard.press('Backspace');
        await checkDraft(token + '尾');
        await undo();
        await checkDraft(token + token + '尾');
        await clickSide(1, 'left', token.length);
        await page.keyboard.press('Delete');
        await checkDraft(token + '尾');
        await undo();
        await checkDraft(token + token + '尾');
        await reset('测试' + token);
        for (const side of ['left', 'right']) {
          await clickSide(0, side, side === 'left' ? 2 : 2 + token.length);
          await editor.screenshot({
            path: `/tmp/lightnote-caret-${width}-${theme}-${density}-${side}.png`,
            caret: 'initial',
          });
        }
        console.log(
          `PASS ${width} ${theme} ${density}: left/right insertion, native deletion, mode switch, undo/redo, newline, adjacent emoji`,
        );
        await page.close();
      }
    }
} finally {
  await browser.close();
}
