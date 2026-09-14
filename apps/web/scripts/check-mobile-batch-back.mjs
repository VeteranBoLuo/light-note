/** Local guest-only regression: batch actions, top-bar cancellation and the exact Android back script. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const origin = process.env.WORKSPACE_TEST_ORIGIN || 'http://localhost:5173';
assert(['localhost', '127.0.0.1'].includes(new URL(origin).hostname), 'Use a local development server');
const nativeSource = readFileSync(
  new URL('../../android/app/src/main/java/top/boluo66/lightnote/MainActivity.java', import.meta.url),
  'utf8',
);
const nativeBack = JSON.parse(
  nativeSource
    .split('\n')
    .find((line) => line.includes('light-note-system-back'))
    .trim()
    .replace(/,$/, ''),
);
const browser = await chromium.launch({
  executablePath:
    process.env.CHROME_PATH ||
    (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : undefined),
  headless: true,
});
const cases = [
  { path: '/home', file: '/home/Home.vue', enter: 'enterBatch', content: '.card-body', close: '取消选择' },
  {
    path: '/noteLibrary',
    file: '/noteLibrary/NoteLibrary.vue',
    enter: 'enterBatch',
    content: '.note-card',
    close: '退出批量',
  },
  {
    path: '/cloudSpace',
    file: '/cloudSpace/cloudSpace.vue',
    enter: 'toggleBatchMode',
    content: '.file-card, .field-item',
    close: '退出批量',
  },
  {
    path: '/inbox?tab=todo',
    file: '/inbox/Inbox.vue',
    enter: 'toggleTodoSelectionMode',
    content: '.todo-item',
    close: '退出批量',
  },
];
// Seed selection through each real page's entry handler; no account, mutation API or private content.
async function enterBatch(page, item) {
  await page.evaluate(({ file, enter }) => {
    for (const element of document.querySelectorAll('*')) {
      let instance = element.__vueParentComponent;
      while (instance) {
        if (instance.type.__file?.endsWith(file)) {
          instance.setupState[enter]();
          return;
        }
        instance = instance.parent;
      }
    }
    throw new Error(`Missing development component: ${file}`);
  }, item);
}
try {
  for (const theme of ['day', 'night']) {
    for (const item of cases) {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      const url = new URL(item.path, origin);
      url.searchParams.set('renderProfile', 'mobile');
      await page.goto(url.href);
      await page.locator(item.content).first().waitFor();
      await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
      await enterBatch(page, item);
      const bar = page.locator('.resource-batch-action-bar--mobile');
      await bar.waitFor();
      if (item.enter !== 'toggleTodoSelectionMode') {
        assert(await bar.getByRole('button', { name: '删除', exact: true }).isDisabled());
      }
      await bar.getByRole('checkbox').first().click();
      if (item.enter !== 'toggleTodoSelectionMode') {
        assert(await bar.getByRole('button', { name: '删除', exact: true }).isEnabled());
      }
      const before = page.url();
      assert.equal(await page.evaluate(nativeBack), 'handled', item.path);
      assert.equal(page.url(), before, 'Back must not navigate away from batch mode');
      assert.equal(await bar.count(), 0, 'Toolbar must disappear with selection controls');
      assert.equal(await page.evaluate(nativeBack), 'root', 'Next back restores root behavior');
      await enterBatch(page, item);
      await bar.waitFor();
      await page.getByRole('button', { name: item.close, exact: true }).click();
      assert.equal(await bar.count(), 0, 'X must also remove the toolbar immediately');
      console.log(`PASS ${item.path} ${theme}: selection, native back, root fallback, X`);
      await page.close();
    }
  }
} finally {
  await browser.close();
}
