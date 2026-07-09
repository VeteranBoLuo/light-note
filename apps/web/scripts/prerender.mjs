/**
 * 构建期预渲染（SEO）
 *
 * 背景：整站是纯 SPA，爬虫（尤其是不渲染 JS 的百度）抓到的 <body> 是空壳。
 * 本脚本在 `vite build` 之后跑：本地起静态服务 serve dist → 用系统 Chrome
 * 无头渲染各公开页 → 把渲染完成的真实 HTML（含 H1、正文文案）落成
 * dist/<route>/index.html。线上 nginx 对这些路由有 `location = /<route>` 精确
 * 匹配直接回静态文件（见服务器 www.boluo.com.conf），浏览器端 SPA bundle
 * 照常加载并重新挂载 #app，用户体验不变。
 *
 * 预渲染页面清单见 PAGES：
 *   - /landing     门面页（critical：失败则整个构建失败，绝不上线空壳门面）
 *   - /updateLogs  更新日志（数据来自后端 API，构建期通过 /api 代理到生产后端取真实数据；
 *                  非 critical：失败只警告，页面退回 SPA 空壳，不阻塞部署）
 *
 * 每页顺带重写 head（SPA 所有路由共享 index.html，canonical 全指向 /landing，
 * 公开页不改写会被 Google 当成 /landing 的重复页拒收）：
 *   - <link rel="canonical"> / <meta og:url> → 指向页面自身
 *   - /updateLogs 另有独立 title/description（避免全站同名同描述被判重复）
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
const TIMEOUT = 60_000;

/**
 * 预渲染页面清单。
 * waitSelector: 该页"渲染完成"的判据元素。
 * critical: true 的页面失败即整体失败(exit 1);false 只警告(退回 SPA 空壳,部署继续)。
 * head.title/description: 可选,给页面独立的 title 与 meta description。
 */
const PAGES = [
  {
    route: '/landing',
    waitSelector: '.hero-title',
    critical: true,
    head: {},
  },
  {
    route: '/updateLogs',
    waitSelector: '.log-card',
    critical: false,
    head: {
      title: '更新日志 - 轻笺 | 版本更新历史与功能改进',
      description:
        '轻笺（Light Note）版本更新历史：书签管理、云笔记、云空间与 AI 功能的每一次迭代改进记录，持续更新。',
    },
  },
];

// 预渲染期间黑洞掉的埋点类接口:构建机不是真实访客,这些请求转发到生产会污染转化漏斗/操作日志
const TRACKING_BLACKHOLE = ['/api/common/recordConversion', '/api/common/recordOperationLogs'];

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

// ---- 静态服务 dist（带 SPA fallback + /api 代理到生产后端），零依赖 ----
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

      // /api 代理到生产后端:预渲染需要真实数据(更新日志内容、访客身份),本地 dist 没有后端。
      // 埋点类接口直接黑洞返回成功,不转发(构建机不是真实访客,别污染生产转化漏斗)。
      if (urlPath.startsWith('/api/')) {
        if (TRACKING_BLACKHOLE.some((p) => urlPath.startsWith(p))) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ status: 200, msg: '', data: null }));
          return;
        }
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const upstream = await fetch(`${SITE_ORIGIN}${req.url}`, {
          method: req.method,
          headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : Buffer.concat(chunks),
        });
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, {
          'Content-Type': upstream.headers.get('content-type') || 'application/json',
        });
        res.end(buf);
        return;
      }

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

// ---- 单页渲染 ----
async function renderPage(browser, port, pageConf) {
  const { route, waitSelector, head } = pageConf;
  const url = `http://127.0.0.1:${port}${route}`;

  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 800 });

    // 必须用 evaluateOnNewDocument(在页面自身脚本执行前跑),普通 page.evaluate
    // 要等 goto 完成后才执行,那时 App.vue 的 onMounted 早已检查过 localStorage
    await page.evaluateOnNewDocument(() => {
      // 预渲染标志:前端据此跳过 ChatContainer 等首屏无关 chunk 的预热,避免被烘焙进静态首屏 preload
      window.__PRERENDER__ = true;
    });

    console.log(`🌐  渲染 ${url} …`);
    await page.goto(url, { waitUntil: 'networkidle0', timeout: TIMEOUT });
    await page.waitForSelector(waitSelector, { timeout: TIMEOUT });

    let html = await page.content();

    // 修正 canonical 与 og:url 指向页面自身（正则宽容匹配属性顺序与空白）
    html = html
      .replace(/(<link[^>]*rel="canonical"[^>]*href=")[^"]*(")/i, `$1${SITE_ORIGIN}${route}$2`)
      .replace(/(<meta[^>]*property="og:url"[^>]*content=")[^"]*(")/i, `$1${SITE_ORIGIN}${route}$2`);

    // 页面独立 title / meta description(共享 index.html 全站同名同描述,公开页会被判重复内容)
    if (head.title) {
      html = html
        .replace(/<title>[^<]*<\/title>/i, `<title>${head.title}</title>`)
        .replace(/(<meta[^>]*property="og:title"[^>]*content=")[^"]*(")/i, `$1${head.title}$2`);
    }
    if (head.description) {
      html = html
        .replace(/(<meta[^>]*name="description"[^>]*content=")[^"]*(")/i, `$1${head.description}$2`)
        .replace(/(<meta[^>]*property="og:description"[^>]*content=")[^"]*(")/i, `$1${head.description}$2`);
    }

    // 删掉首屏里 AI 相关 chunk 的所有 <link> 预载(preload/modulepreload/stylesheet):
    // App.vue 挂载瞬间 router 未 ready、aiVisible 短暂为 true,会触发 FloatQuestion 挂载并预热 ChatContainer,
    // Vite __vitePreload 遂把它们(尤其 ChatContainer gzip 300KB+)烘焙进静态首屏,纯拖累 TBT/未使用JS。
    // 前端运行时的 __PRERENDER__/route 判断因时序不可靠,这里在产物层确定性移除。真实用户 JS 接管后按需动态加载,不受影响。
    const aiLinkRe = /<link\b[^>]*(?:ChatContainer|FloatQuestion)[^>]*>/gi;
    const removed = (html.match(aiLinkRe) || []).length;
    html = html.replace(aiLinkRe, '');
    console.log(`🧹  ${route} 移除首屏 AI chunk 预载 ${removed} 条`);

    // 质量断言：预渲染产物必须包含真实正文，否则宁可失败也不上线空壳
    const textLen = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .trim().length;
    const selectorClass = waitSelector.replace(/^\./, '');
    if (!html.includes(selectorClass) || textLen < 500) {
      throw new Error(`预渲染产物疑似空壳（正文 ${textLen} 字符），拒绝落盘`);
    }

    const outDir = path.join(DIST, route.replace(/^\//, ''));
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, 'index.html'), html, 'utf8');
    console.log(`✅  ${route} 预渲染完成 → dist${route}/index.html（${(html.length / 1024).toFixed(0)}KB，正文 ${textLen} 字符）`);
  } finally {
    await page.close().catch(() => {});
  }
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

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'], // CI 容器环境兼容
  });

  try {
    for (const pageConf of PAGES) {
      try {
        await renderPage(browser, port, pageConf);
      } catch (err) {
        if (pageConf.critical) throw err; // 门面页失败 → 整体失败,绝不上线空壳
        // 非关键页失败只警告:该页退回 SPA 空壳(canonical 会错指 /landing,收录暂缓),不阻塞部署
        console.warn(`⚠️  ${pageConf.route} 预渲染失败(非关键页,继续): ${err.message}`);
      }
    }
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
