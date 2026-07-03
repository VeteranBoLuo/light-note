/**
 * 构建期预渲染（SEO）
 *
 * 背景：整站是纯 SPA，爬虫（尤其是不渲染 JS 的百度）抓到的 <body> 是空壳。
 * 本脚本在 `vite build` 之后跑：本地起静态服务 serve dist → 用系统 Chrome
 * 无头渲染 /landing → 把渲染完成的真实 HTML（含 H1、正文文案）落成
 * dist/landing/index.html。线上 nginx 已有 `try_files $uri $uri/ /index.html`，
 * /landing 请求会命中该目录索引直接返回静态 HTML，无需改 nginx。
 * 浏览器端 SPA bundle 照常加载并重新挂载 #app，用户体验不变。
 *
 * 顺带修正两处 head（SPA 所有路由共享 index.html，canonical 全指向首页，
 * 会让 Google 把 /landing 当成首页的重复页拒收）：
 *   - <link rel="canonical"> → https://boluo66.top/landing
 *   - <meta property="og:url"> → https://boluo66.top/landing
 *
 * 用 puppeteer-core + 系统 Chrome（不引入 170MB 的 Chromium 下载）：
 *   - 优先读 PRERENDER_CHROME 环境变量
 *   - macOS 默认路径 / Linux(CI) 常见命令名依次探测
 * 紧急情况下 SKIP_PRERENDER=1 可跳过本步（部署不被预渲染故障阻塞）。
 */

import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, '../dist');
const SITE_ORIGIN = 'https://boluo66.top';
const ROUTE = '/landing';
const WAIT_SELECTOR = '.hero-title'; // Landing.vue 首屏 H1，渲染完成的判据
const TIMEOUT = 60_000;
const UPDATE_NOTICE_CONFIG = path.resolve(__dirname, '../src/config/updateNotice.ts');

/**
 * App.vue 的 onMounted 不分路由,每次挂载都会检查 localStorage[storageKey] 是否
 * 等于当前版本号,不等就弹一个 duration:0(永不自动消失)的"发现新版本"通知。
 * puppeteer 用的是全新无痕上下文,localStorage 是空的,必然触发这条通知——
 * 而这条通知会在我们截取 page.content() 时被冻结进静态 HTML,导致真实用户
 * 打开页面时先看见这条早该消失的公告残影一闪,再被 Vue 重新挂载后的真实状态覆盖掉。
 * 用正则从配置文件里取 storageKey/version(不额外引入 TS loader),在 puppeteer
 * 导航前把 localStorage 预置成"已看过当前版本公告",从根上不让它在渲染期间弹出。
 */
async function readUpdateNoticeSeed() {
  const src = await readFile(UPDATE_NOTICE_CONFIG, 'utf8');
  const storageKey = src.match(/storageKey:\s*'([^']+)'/)?.[1];
  const version = src.match(/version:\s*'([^']+)'/)?.[1];
  if (!storageKey || !version) {
    throw new Error(`未能从 ${UPDATE_NOTICE_CONFIG} 解析出 storageKey/version`);
  }
  return { storageKey, version };
}

if (process.env.SKIP_PRERENDER === '1') {
  console.log('⏭  SKIP_PRERENDER=1，跳过预渲染');
  process.exit(0);
}

// ---- 定位系统 Chrome ----
function resolveChrome() {
  if (process.env.PRERENDER_CHROME) return process.env.PRERENDER_CHROME;
  const candidates =
    process.platform === 'darwin'
      ? [
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
          '/Applications/Chromium.app/Contents/MacOS/Chromium',
          '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
        ]
      : ['google-chrome-stable', 'google-chrome', 'chromium-browser', 'chromium'];
  for (const c of candidates) {
    if (c.startsWith('/')) {
      if (existsSync(c)) return c;
    } else {
      try {
        return execFileSync('which', [c], { encoding: 'utf8' }).trim();
      } catch {
        /* 继续探测下一个 */
      }
    }
  }
  throw new Error(
    '未找到可用的 Chrome/Chromium。请安装 Chrome，或用 PRERENDER_CHROME=/path/to/chrome 指定；紧急部署可 SKIP_PRERENDER=1 跳过。',
  );
}

// ---- 静态服务 dist（带 SPA fallback），零依赖 ----
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
};

function startStaticServer() {
  const server = createServer(async (req, res) => {
    try {
      const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      // 防目录穿越：规范化后必须仍在 dist 内
      let filePath = path.normalize(path.join(DIST, urlPath));
      if (!filePath.startsWith(DIST)) {
        res.writeHead(403).end();
        return;
      }
      if (!existsSync(filePath) || urlPath === '/') {
        filePath = path.join(DIST, 'index.html'); // SPA fallback
      }
      const body = await readFile(filePath);
      res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ---- 主流程 ----
async function main() {
  if (!existsSync(path.join(DIST, 'index.html'))) {
    throw new Error(`未找到 ${DIST}/index.html，请先执行 vite build`);
  }

  const chromePath = resolveChrome();
  console.log(`🔍  Chrome: ${chromePath}`);

  const server = await startStaticServer();
  const port = server.address().port;
  const url = `http://127.0.0.1:${port}${ROUTE}`;

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'], // CI 容器环境兼容
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });

    // 必须用 evaluateOnNewDocument(在页面自身脚本执行前跑),普通 page.evaluate
    // 要等 goto 完成后才执行,那时 App.vue 的 onMounted 早已检查过 localStorage
    const { storageKey, version } = await readUpdateNoticeSeed();
    await page.evaluateOnNewDocument(
      (key, value) => {
        // 预渲染标志:前端据此跳过 ChatContainer 等首屏无关 chunk 的预热,避免被烘焙进静态首屏 preload
        window.__PRERENDER__ = true;
        try {
          window.localStorage.setItem(key, value);
        } catch {
          /* 隐私模式等场景 localStorage 不可用,忽略即可,顶多通知照常弹出 */
        }
      },
      storageKey,
      version,
    );

    console.log(`🌐  渲染 ${url} …`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: TIMEOUT });
    await page.waitForSelector(WAIT_SELECTOR, { timeout: TIMEOUT });

    let html = await page.content();

    // 修正 canonical 与 og:url 指向 /landing（正则宽容匹配属性顺序与空白）
    html = html
      .replace(
        /(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")/i,
        `$1${SITE_ORIGIN}${ROUTE}$2`,
      )
      .replace(
        /(<meta[^>]*property="og:url"[^>]*content=")[^"]*(")/i,
        `$1${SITE_ORIGIN}${ROUTE}$2`,
      );

    // 删掉 landing 首屏里 AI 相关 chunk 的所有 <link> 预载(preload/modulepreload/stylesheet):
    // App.vue 挂载瞬间 router 未 ready、aiVisible 短暂为 true,会触发 FloatQuestion 挂载并预热 ChatContainer,
    // Vite __vitePreload 遂把它们(尤其 ChatContainer gzip 300KB+)烘焙进静态首屏,纯拖累 landing 的 TBT/未使用JS。
    // 前端运行时的 __PRERENDER__/route 判断因时序不可靠,这里在产物层确定性移除。真实用户 JS 接管后按需动态加载,不受影响。
    const aiLinkRe = /<link\b[^>]*(?:ChatContainer|FloatQuestion)[^>]*>/gi;
    const removed = (html.match(aiLinkRe) || []).length;
    html = html.replace(aiLinkRe, '');
    console.log(`🧹  移除 landing 首屏 AI chunk 预载 ${removed} 条`);

    // 质量断言：预渲染产物必须包含真实正文，否则宁可失败也不上线空壳
    const textLen = html.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim().length;
    if (!html.includes('hero-title') || textLen < 500) {
      throw new Error(`预渲染产物疑似空壳（正文 ${textLen} 字符），拒绝落盘`);
    }

    const outDir = path.join(DIST, 'landing');
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
    console.log(`✅  预渲染完成 → dist/landing/index.html（${(html.length / 1024).toFixed(0)}KB，正文 ${textLen} 字符）`);
  } finally {
    await browser.close();
    server.close();
  }
}

main().catch((err) => {
  console.error('❌  预渲染失败:', err.message);
  console.error('    紧急部署可用 SKIP_PRERENDER=1 跳过（landing 将退回 SPA 空壳）');
  process.exit(1);
});
