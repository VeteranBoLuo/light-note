// Real Editor + CodeMirror browser regression; synthetic data only, all API calls blocked.
import { chromium } from 'playwright-core';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const origin = process.env.LIGHTNOTE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname));
const output = join(tmpdir(), 'light-note-scroll-sync');
mkdirSync(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const page = await browser.newPage({ viewport: { width: 1440, height: 850 } });
const errors = [];
page.on('pageerror', (error) => {
  errors.push(error.message);
  console.error('BROWSER', error.stack);
});
const browserHash = JSON.parse(
  readFileSync(new URL('../node_modules/.vite/deps/_metadata.json', import.meta.url), 'utf8'),
).browserHash;
const fixture = `<!doctype html><html data-theme="day"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><body><div id="app"></div><script type="module">
import {createApp,h,ref} from '/node_modules/.vite/deps/vue.js?v=${browserHash}';
import {createPinia,setActivePinia} from '/node_modules/.vite/deps/pinia.js?v=${browserHash}';
import {createRouter,createMemoryHistory} from '/node_modules/.vite/deps/vue-router.js?v=${browserHash}';
import {EditorView} from '/node_modules/.vite/deps/@codemirror_view.js?v=${browserHash}';

import i18n from '/src/i18n/index.ts';

import '/src/assets/css/theme.less';
import '/src/assets/css/common.less';
import '/src/assets/css/mobile-rendering-baseline.less';
const pinia=createPinia();setActivePinia(pinia);
const {renderMermaidBlocks}=await import('/src/utils/mermaidRender.ts');
const {default:Editor}=await import('/src/components/noteLibrary/detail/Editor.vue');
const {codeLinePositions}=await import('/src/utils/markdownScrollMap.ts');window.codeLinePositions=codeLinePositions;
const {bookmarkStore}=await import('/src/store/index.ts');window.bookmark=bookmarkStore();
const content=ref(''),editor=ref(null);window.content=content;window.editor=editor;
window.cm=()=>document.querySelector('.cm-editor') && EditorView.findFromDOM(document.querySelector('.cm-editor'));
const app=createApp({setup(){return()=>h(Editor,{ref:editor,type:'markdown',content:content.value,'onUpdate:content':v=>content.value=v})}});
app.use(pinia).use(i18n).use(createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}}]}));
app.directive('mermaid',{mounted:el=>renderMermaidBlocks(el),updated:el=>renderMermaidBlocks(el)});
app.directive('auto-scrollbar',{});
app.mount('#app');window.ready=true;
</script><style>html,body{margin:0;width:100%;height:100%;background:var(--workspace-content)}#app{display:flex;flex-direction:column;height:740px;max-width:1380px;margin:20px auto}.note-editor{height:100%;display:flex;flex-direction:column;min-height:0}</style></body></html>`;
await page.route('**/*', async (route) => {
  const url = new URL(route.request().url());
  if (url.origin !== origin || url.pathname.startsWith('/api/'))
    return route.fulfill({ contentType: 'application/json', body: '{"status":200,"data":[]}' });
  if (url.pathname === '/__scroll-check') return route.fulfill({ contentType: 'text/html', body: fixture });
  if (url.pathname === '/__tall-image.svg') {
    await new Promise((resolve) => setTimeout(resolve, 500));
    return route.fulfill({
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="1600"><rect width="500" height="1600" fill="#bfe1dc"/><text x="25" y="80" font-size="28">Synthetic tall image</text></svg>',
    });
  }
  return route.continue();
});
try {
  await page.goto(origin + '/__scroll-check');
  await page.waitForFunction(() => window.cm?.());
  const source = Array.from(
    { length: 20 },
    (_, i) =>
      `## Section ${i}\n\nParagraph ${i}. This paragraph establishes a stable source anchor.\n\n` +
      (i === 3 ? '![fixture](/__tall-image.svg)\n\n' : '') +
      (i === 7
        ? '```javascript\n' +
          Array.from({ length: 80 }, (_, n) => `const line${n} = "${'long text '.repeat(n % 3 ? 1 : 16)}";`).join(
            '\n',
          ) +
          '\n```\n\n'
        : '') +
      (i === 10 ? '| Name | Value |\n| --- | --- |\n| a | b |\n| c | d |\n\n' : ''),
  ).join('');
  // A single insertion reproduces paste + CodeMirror's automatic caret reveal.
  await page.evaluate((source) => {
    const cm = window.cm();
    cm.focus();
    cm.dispatch({
      changes: { from: 0, to: cm.state.doc.length, insert: source },
      selection: { anchor: source.length },
      scrollIntoView: true,
      userEvent: 'input.paste',
    });
  }, source);
  await page.waitForTimeout(1300);
  assert.equal(await page.evaluate(() => window.content.value), source);
  const positions = () =>
    page.evaluate(() => {
      const left = window.cm().scrollDOM,
        right = document.querySelector('.md-preview');
      return {
        left: left.scrollTop,
        leftMax: left.scrollHeight - left.clientHeight,
        right: right.scrollTop,
        rightMax: right.scrollHeight - right.clientHeight,
      };
    });
  console.log('paste', await positions(), errors);
  assert((await positions()).right > 0, 'paste must synchronize without manual scrolling');
  for (const theme of ['day', 'night']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    for (const section of [2, 3, 4, 7, 8, 10, 11]) {
      for (let settle = 0; settle < 2; settle++) {
        await page.evaluate((section) => {
          const cm = window.cm();
          const at = cm.state.doc.toString().indexOf('## Section ' + section + '\n');
          cm.scrollDOM.scrollTop = cm.lineBlockAt(at).top + cm.documentPadding.top;
        }, section);
        await page.waitForTimeout(180);
      }
      const delta = await page.evaluate((section) => {
        const p = document.querySelector('.md-preview');
        const h = [...p.querySelectorAll('h2')].find((e) => e.textContent === 'Section ' + section);
        return h.getBoundingClientRect().top - p.getBoundingClientRect().top;
      }, section);
      assert(Math.abs(delta) < 45, `section ${section}/${theme}: drift ${delta}`);
    }
    await page.screenshot({ path: join(output, `desktop-${theme}.png`) });
  }
  // Long code: actual text ranges include highlight spans and differing soft wraps.
  for (const line of [5, 30, 60]) {
    for (let settle = 0; settle < 2; settle++) {
      await page.evaluate((line) => {
        const cm = window.cm(),
          at = cm.state.doc.toString().indexOf('const line' + line + ' =');
        cm.scrollDOM.scrollTop = cm.lineBlockAt(at).top + cm.documentPadding.top;
      }, line);
      await page.waitForTimeout(150);
    }
    const drift = await page.evaluate((line) => {
      const p = document.querySelector('.md-preview'),
        code = p.querySelector('pre code');
      return window.codeLinePositions(code)[line].top - p.getBoundingClientRect().top;
    }, line);
    assert(Math.abs(drift) < 12, `code line ${line}: drift ${drift}`);
  }
  await page.screenshot({ path: join(output, 'long-code.png') });
  // Reverse direction: the same source heading should follow a preview scroll.
  for (const section of [4, 8, 12]) {
    await page.evaluate((section) => {
      const p = document.querySelector('.md-preview'),
        h = [...p.querySelectorAll('h2')].find((e) => e.textContent === 'Section ' + section);
      p.scrollTop += h.getBoundingClientRect().top - p.getBoundingClientRect().top;
    }, section);
    await page.waitForTimeout(250);
    const drift = await page.evaluate((section) => {
      const cm = window.cm(),
        at = cm.state.doc.toString().indexOf('## Section ' + section + '\n');
      return cm.lineBlockAt(at).top + cm.documentPadding.top - cm.scrollDOM.scrollTop;
    }, section);
    assert(Math.abs(drift) < 30, `reverse section ${section}: drift ${drift}`);
  }
  // Delayed image resizing must keep the editor side stationary.
  for (let settle = 0; settle < 2; settle++) {
    await page.evaluate(() => {
      const cm = window.cm(),
        at = cm.state.doc.toString().indexOf('## Section 4\n');
      cm.scrollDOM.scrollTop = cm.lineBlockAt(at).top + cm.documentPadding.top;
    });
    await page.waitForTimeout(180);
  }
  const before = await positions();
  await page.evaluate(() => {
    document.querySelector('.md-preview img').style.height = '2200px';
  });
  await page.waitForTimeout(250);
  assert(Math.abs((await positions()).left - before.left) < 1, 'image resize moved editor');
  assert(
    Math.abs(
      await page.evaluate(() => {
        const p = document.querySelector('.md-preview'),
          h = [...p.querySelectorAll('h2')].find((e) => e.textContent === 'Section 4');
        return h.getBoundingClientRect().top - p.getBoundingClientRect().top;
      }),
    ) < 12,
    'image resize lost anchor',
  );
  // Explicit directory navigation stays authoritative while both panes scroll smoothly.
  await page.evaluate(() =>
    window.editor.value.scrollToMarkdownHeading(8, window.content.value.indexOf('## Section 8\n')),
  );
  await page.waitForTimeout(1100);
  assert(
    Math.abs(
      await page.evaluate(() => {
        const p = document.querySelector('.md-preview'),
          h = [...p.querySelectorAll('h2')].find((e) => e.textContent === 'Section 8');
        return h.getBoundingClientRect().top - p.getBoundingClientRect().top;
      }),
    ) < 20,
    'directory navigation overridden',
  );
  // Undo/redo and replacement must not write preview metadata into the source.
  await page.evaluate(() => window.editor.value.replaceContentWithUndo('# Short\n\nSmall document', 'markdown'));
  await page.waitForTimeout(350);
  assert.equal(await page.evaluate(() => window.content.value), '# Short\n\nSmall document');
  await page.evaluate(() => {
    window.cm().focus();
  });
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await page.waitForTimeout(450);
  assert.equal(await page.evaluate(() => window.content.value), source);
  // Narrow/mobile single-pane mode must stay independent; split synchronization is disabled.
  await page.setViewportSize({ width: 390, height: 850 });
  await page.evaluate(() => {
    window.bookmark.screenWidth = 390;
    document.documentElement.classList.add('light-note-mobile-rendering');
  });
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.md-preview-pane').isVisible(), false);
  for (const theme of ['day', 'night']) {
    await page.evaluate((theme) => (document.documentElement.dataset.theme = theme), theme);
    await page.waitForTimeout(350);
    await page.screenshot({ path: join(output, `mobile-${theme}.png`) });
  }
  assert.deepEqual(errors, []);
  console.log('PASS', output);
} finally {
  await browser.close();
}
