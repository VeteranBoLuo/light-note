// Real TinyMCE keyboard regression using the in-memory reference fixture.
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const checked of [false, true]) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
    await page.goto((process.env.WEB_BASE_URL || 'http://localhost:5173') + '/e2e/reference-targets.html?editable');
    await page.waitForFunction(() => window.tinymce?.activeEditor?.initialized);
    await page.evaluate((checked) => {
      const editor = window.tinymce.activeEditor;
      editor.setContent(
        '<p><input type="checkbox" class="note-todo-checkbox" data-note-task="true"' +
          (checked ? ' checked="checked"' : '') +
          '>测试引用</p>',
      );
      editor.focus();
      editor.selection.select(editor.getBody().querySelector('p'), true);
      editor.selection.collapse(false);
    }, checked);
    await page.keyboard.type(' @');
    await page
      .locator('.resource-mention-inline-popover .resource-picker-panel__item')
      .first()
      .waitFor({ timeout: 10000 });
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const selected = await page.evaluate(() => {
      const body = window.tinymce.activeEditor.getBody();
      return {
        tasks: body.querySelectorAll('input').length,
        refs: body.querySelectorAll('a').length,
        checked: body.querySelector('input').checked,
      };
    });
    assert.deepEqual(selected, { tasks: 1, refs: 1, checked });
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => window.tinymce.activeEditor.getBody().querySelectorAll('input').length), 2);
    await page.close();
    console.log('PASS: reference Enter consumes event; normal task Enter preserved, checked=' + checked);
  }
} finally {
  await browser.close();
}
