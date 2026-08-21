import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { createServer } from 'vite';

const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidates = [
  process.env.AI_E2E_CHROME,
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

async function resolveChrome() {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      // 尝试下一个候选路径。
    }
  }
  throw new Error('未找到 Chrome/Chromium；可通过 AI_E2E_CHROME 指定可执行文件');
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

let server;
let browser;
try {
  server = await createServer({
    root: webRoot,
    configFile: path.join(webRoot, 'vite.config.ts'),
    logLevel: 'error',
    server: { host: '127.0.0.1', port: 0, strictPort: false, open: false },
  });
  await server.listen();
  const address = server.httpServer.address();
  const origin = `http://127.0.0.1:${address.port}`;
  browser = await chromium.launch({
    executablePath: await resolveChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    const request = route.request();
    if (request.url().includes('/api/search/global')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          status: 200,
          msg: '',
          data: {
            keyword: '',
            total: 1,
            groups: [],
            items: [{ id: 'synthetic-bookmark-1', type: 'bookmark', title: '合成书签', description: '' }],
          },
        }),
      });
    } else await route.continue();
  });
  await page.goto(`${origin}/e2e/ai-critical.html`, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="ai-critical-harness"]');

  assert(
    (await page.$eval('[data-testid="capability-policy"]', (node) => node.textContent)) === 'auto',
    'AI 会话策略默认值不是 auto',
  );
  await page.click('[aria-label="会话能力边界"]');
  await page.getByRole('option', { name: '仅对话', exact: true }).click();
  assert(
    (await page.$eval('[data-testid="capability-policy"]', (node) => node.textContent)) === 'chat_only',
    'AI 会话策略未切换到 chat_only',
  );
  assert((await page.locator('button', { hasText: '@ 添加资源' }).count()) === 0, '仅对话仍展示材料入口');
  assert(
    !(await page.getByRole('button', { name: '确认执行', exact: true }).isEnabled()),
    '仅对话仍允许执行已有写确认卡',
  );
  await page.click('[aria-label="会话能力边界"]');
  await page.getByRole('option', { name: '自动助手', exact: true }).click();

  const textarea = await page.$('[data-testid="mention-flow"] textarea');
  assert(textarea, '未找到 AI 输入框');
  await textarea.type('@');
  await page.waitForSelector('.resource-picker-panel__item');
  await textarea.press('Enter');
  await page.waitForFunction(
    () => document.querySelector('[data-testid="selected-context"]')?.textContent === '合成书签',
  );
  assert((await page.$eval('[data-testid="send-count"]', (node) => node.textContent)) === '0', '@ Enter 误触发了发送');

  await page.click('[data-testid="seed-confirmation"]');
  await page.waitForSelector('[data-testid="restored-confirmation"]');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="restored-confirmation"]');
  assert(
    (await page.$eval('[data-testid="restored-confirmation"]', (node) => node.textContent)) === '合成测试笔记',
    '刷新后未恢复有效确认卡',
  );

  await page.click('[data-testid="launch-bookmark"]');
  assert(
    (await page.$eval('[data-testid="launch-context-id"]', (node) => node.textContent)) === 'synthetic-bookmark-1',
    '书签入口未携带资源 ID',
  );
  assert(
    (await page.$eval('[data-testid="launch-intent"]', (node) => node.textContent)) === 'create_note',
    '书签入口未携带 create_note 意图',
  );
  assert(
    (await page.$eval('[data-testid="launch-prompt"]', (node) => node.textContent)).includes('分析这个书签'),
    '书签入口未填入生成笔记提示语',
  );

  process.stdout.write('AI 关键 UI E2E 通过：会话策略边界、@ Enter、确认卡刷新恢复、书签生成笔记入口。\n');
} finally {
  await browser?.close();
  await server?.close();
}
