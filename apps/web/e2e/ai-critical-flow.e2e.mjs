import { access } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
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
  browser = await puppeteer.launch({
    executablePath: await resolveChrome(),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const page = await browser.newPage();
  await page.setRequestInterception(true);
  page.on('request', (request) => {
    if (request.url().includes('/api/search/global')) {
      request.respond({
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
    } else request.continue();
  });
  await page.goto(`${origin}/e2e/ai-critical.html`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('[data-testid="ai-critical-harness"]');

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
  await page.reload({ waitUntil: 'networkidle0' });
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

  process.stdout.write('AI 关键 UI E2E 通过：@ Enter、确认卡刷新恢复、书签生成笔记入口。\n');
} finally {
  await browser?.close();
  await server?.close();
}
