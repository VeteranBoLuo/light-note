import { chromium } from 'playwright-core';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Run against the local Vite server; all content is synthetic and stays in the browser.
const origin = process.env.LIGHTNOTE_BENCH_ORIGIN || 'http://localhost:5173';
if (!['localhost', '127.0.0.1', '[::1]'].includes(new URL(origin).hostname)) throw Error('Local Vite origin required');
const output = process.env.LIGHTNOTE_BENCH_OUTPUT || mkdtempSync(join(tmpdir(), 'light-note-code-'));
mkdirSync(output, { recursive: true });
const line = 'const total = items.filter(item => item.active).map(item => item.price * 2); // sample\n';
const samples = {
  plain: '# Heading\n\n' + 'Normal paragraph.\n\n'.repeat(60),
  normal: '```javascript\n' + line.repeat(20) + '```',
  many: Array.from({ length: 30 }, (_, i) => '```javascript\n// ' + i + '\n' + line.repeat(10) + '```').join('\n\n'),
  long: '```javascript\n' + line.repeat(2500) + '```',
};
const harness = `<!doctype html><html data-theme="day"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="display:block;min-width:0;box-sizing:border-box;width:100%;padding:16px;margin:0"><div id="editor" style="height:320px;width:100%"></div><main id="preview" class="note-rich-content"></main><script type="module">
import { noteContentToHtml } from '/src/utils/common.ts';
import { highlightNoteCodeBlocks } from '/src/utils/noteCodeHighlight.ts';
import { createApp, h, ref, nextTick } from '/node_modules/.vite/deps/vue.js';
import i18n, { setLocale } from '/src/i18n/index.ts';
import MarkdownCodeMirror from '/src/components/noteLibrary/detail/MarkdownCodeMirror.vue';
import '/src/assets/css/theme.less';
import '/src/assets/css/common.less';
import '/src/assets/css/mobile-rendering-baseline.less';
window.noteContentToHtml = noteContentToHtml;
window.highlightNoteCodeBlocks = highlightNoteCodeBlocks;
const model = ref('\`\`\`javascript\\nconst message = "Hello, 轻笺";\\nconsole.log(message);\\n\`\`\`');
const editor = ref(null);
const mobile = ref(window.innerWidth < 768);
window.setTestMobile = value => mobile.value = value;
window.editorModel = model;
window.setTestLocale = setLocale;
await setLocale('zh-CN');
createApp({setup(){return()=>h(MarkdownCodeMirror,{ref:editor,modelValue:model.value,'onUpdate:modelValue':v=>model.value=v,mobile:mobile.value})}}).use(i18n).mount('#editor');
await nextTick(); await nextTick();
window.editor=editor;
window.ready = true;
</script><style>body{display:block;min-width:0;box-sizing:border-box;padding:16px;margin:0;background:var(--workspace-content);color:var(--text-color)}#preview{max-width:100%;margin-top:20px}#editor{border:1px solid var(--workspace-border)}</style></body></html>
`;
const browser = await chromium.launch({
  executablePath:
    process.env.LIGHTNOTE_BENCH_BROWSER ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 850 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.route('**/__note-code-highlight-check', (route) =>
  route.fulfill({ contentType: 'text/html', body: harness }),
);
await page.goto(origin + '/__note-code-highlight-check');
await page.waitForFunction(() => window.ready);
async function measure() {
  return await page.evaluate(async (samples) => {
    const results = {};
    const root = document.querySelector('#preview');
    for (const [name, source] of Object.entries(samples)) {
      const result = {};
      for (const enabled of [false, true]) {
        const values = [];
        for (let i = 0; i < 25; i++) {
          const start = performance.now();
          root.innerHTML = await window.noteContentToHtml(source, 'markdown');
          if (enabled) await window.highlightNoteCodeBlocks(root);
          root.offsetHeight;
          const ms = performance.now() - start;
          if (i === 0) result[enabled ? 'firstHighlight' : 'firstPlain'] = ms;
          if (i > 4) values.push(ms);
        }
        values.sort((a, b) => a - b);
        result[enabled ? 'after' : 'before'] = { median: values[10], p95: values[18] };
      }
      results[name] = result;
    }
    return results;
  }, samples);
}
const desktop = await measure();
const cdp = await page.context().newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
const throttled = await measure();
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
const results = { desktop, cpu4x: throttled };
console.log(JSON.stringify(results, null, 2));
writeFileSync(join(output, 'performance.json'), JSON.stringify(results, null, 2));
await page.evaluate(async () => {
  const root = document.querySelector('#preview');
  root.innerHTML = await window.noteContentToHtml(window.editorModel.value, 'markdown');
  await window.highlightNoteCodeBlocks(root);
  window.editor.value.setSelection(30);
});
await page.getByRole('combobox').click();
await page.getByRole('option', { name: 'Python', exact: true }).click();
if (!(await page.evaluate(() => window.editorModel.value)).startsWith('```python')) throw Error('Language edit failed');
await page.evaluate(() => window.editor.value.undo());
if (!(await page.evaluate(() => window.editorModel.value)).startsWith('```javascript')) throw Error('Undo failed');
for (const width of [1280, 390, 320])
  for (const theme of ['day', 'night']) {
    await page.setViewportSize({ width, height: 850 });
    await page.evaluate(
      ({ width, theme }) => {
        window.setTestMobile(width < 768);
        document.documentElement.dataset.theme = theme;
        document.documentElement.classList.toggle('light-note-mobile-rendering', width < 768);
      },
      { width, theme },
    );
    await page.screenshot({ path: join(output, `${width}-${theme}.png`) });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
    if (overflow) throw Error(`Overflow ${width} ${theme}`);
  }
await page.evaluate(async () => {
  await window.setTestLocale('en-US');
  const root = document.querySelector('#preview');
  root.innerHTML =
    '<pre class="language-python">def hello():\n    return "轻笺"</pre><pre><code class="language-unknown">plain &amp; safe</code></pre>';
  await window.highlightNoteCodeBlocks(root);
});
await page.getByRole('combobox', { name: 'Code language' }).focus();
await page.keyboard.press('Enter');
await page.getByRole('option', { name: 'SQL', exact: true }).click();
if (!(await page.evaluate(() => window.editorModel.value)).startsWith('```sql'))
  throw Error('English/mobile language edit failed');
if ((await page.locator('#preview .hljs-keyword').first().textContent()) !== 'def')
  throw Error('Rich text highlight failed');
if ((await page.locator('#preview pre').nth(1).textContent()) !== 'plain & safe')
  throw Error('Unknown language changed text');
await page.screenshot({ path: join(output, '320-night-rich-english.png') });
// The language controls belong to fences, not to the current caret position.
const fixture =
  '记录两个代码示例。\n\n```javascript\nconst count = 3;\nconsole.log(count);\n```\n\n第二段使用 Python。\n\n```python\ndef greet(name):\n    return name\n```';
await page.setViewportSize({ width: 960, height: 720 });
await page.evaluate(async (fixture) => {
  await window.setTestLocale('zh-CN');
  window.setTestMobile(false);
  document.documentElement.dataset.theme = 'day';
  document.documentElement.classList.remove('light-note-mobile-rendering');
  document.querySelector('#preview').style.display = 'none';
  document.querySelector('#editor').style.height = '460px';
  window.editor.value.replaceAll(fixture, false);
  window.editor.value.setSelection(0);
}, fixture);
await page.getByRole('combobox').nth(1).waitFor();
const before = await page.locator('#editor .cm-editor').boundingBox();
const bodyBefore = await page.locator('.cm-line').filter({ hasText: 'const count = 3;' }).boundingBox();
await page.evaluate(() => window.editor.value.setSelection(window.editorModel.value.indexOf('count')));
const bodyAfter = await page.locator('.cm-line').filter({ hasText: 'const count = 3;' }).boundingBox();
const after = await page.locator('#editor .cm-editor').boundingBox();
if (before.height !== after.height || bodyBefore.y !== bodyAfter.y) throw Error('Caret movement shifted the editor');
await page.evaluate(() => window.editor.value.setSelection(0));
await page.getByRole('combobox').nth(1).click();
await page.getByRole('option', { name: 'SQL', exact: true }).click();
if ((await page.evaluate(() => window.editorModel.value)) !== fixture.replace('```python', '```sql'))
  throw Error('Wrong code block changed');
if ((await page.evaluate(() => window.editor.value.getSelection().from)) !== 0)
  throw Error('Language picker moved the caret');
await page.evaluate(() => window.editor.value.undo());
// Scroll the opening fence into view, then verify changing its language preserves scroll position.
const longFixture = '正文\n'.repeat(35) + fixture;
await page.evaluate((source) => {
  window.editor.value.replaceAll(source, false);
  window.editor.value.scrollToPosition(source.indexOf('```javascript'), undefined, 'auto');
}, longFixture);
await page.getByRole('combobox').first().waitFor();
await page.getByRole('combobox').first().scrollIntoViewIfNeeded();
const scrollBefore = await page.evaluate(() => window.editor.value.getScrollElement().scrollTop);
await page.getByRole('combobox').first().click();
const scrollOpened = await page.evaluate(() => window.editor.value.getScrollElement().scrollTop);
await page.getByRole('option', { name: 'TypeScript', exact: true }).click();
const scrollAfter = await page.evaluate(() => window.editor.value.getScrollElement().scrollTop);
if (Math.abs(scrollBefore - scrollAfter) > 1)
  throw Error(`Language change shifted scroll position: ${scrollBefore} -> ${scrollOpened} -> ${scrollAfter}`);
await page.evaluate((source) => {
  window.editor.value.replaceAll(source, false);
  window.editor.value.scrollToPosition(0, undefined, 'auto');
}, fixture);
await page.getByRole('combobox').nth(1).waitFor();
await page.locator('#editor').screenshot({ path: join(output, 'inline-desktop.png') });
await page.setViewportSize({ width: 390, height: 720 });
await page.evaluate(() => {
  window.setTestMobile(true);
  document.documentElement.classList.add('light-note-mobile-rendering');
  document.documentElement.dataset.theme = 'night';
});
await page.locator('#editor').screenshot({ path: join(output, 'inline-mobile.png') });
if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
  throw Error('Inline controls overflowed');
if (errors.length) throw Error(errors.join('\n'));
console.log(`Browser checks passed. Results: ${output}`);
await browser.close();
