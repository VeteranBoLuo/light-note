import { chromium } from 'playwright-core';
import { startSafeWebProxy } from './safeWebProxy.js';
import { lookupPublicAddresses, validatePublicWebUrl } from './webUrlSafety.js';

const MAX_INPUT_BYTES = 16 * 1024;
let currentStage = 'startup';

function stableReason(error) {
  const value = `${String(error?.code || '')} ${String(error?.message || '')}`;
  if (/Timeout|timeout|PROXY_TIMEOUT/u.test(value)) return 'RENDER_TIMEOUT';
  if (/ERR_NAME_NOT_RESOLVED|ENOTFOUND|EAI_AGAIN|DNS_/u.test(value)) return 'DNS_FAILED';
  if (/ERR_CERT|CERT_|certificate/u.test(value)) return 'TLS_FAILED';
  if (/BLOCKED_|URL_CREDENTIALS_FORBIDDEN|UNSUPPORTED_PROTOCOL|INVALID_PORT/u.test(value)) return 'BLOCKED_HOST';
  if (/Executable doesn't exist|Failed to launch|browserType\.launch/u.test(value)) return 'RENDERER_UNAVAILABLE';
  return 'RENDERER_FAILED';
}

async function readInput() {
  let source = '';
  for await (const chunk of process.stdin) {
    source += chunk.toString('utf8');
    if (Buffer.byteLength(source) > MAX_INPUT_BYTES) throw new Error('RENDER_INPUT_TOO_LARGE');
  }
  return JSON.parse(source);
}

function browserUserAgent(version, profile = 'desktop') {
  const normalized = String(version || '').match(/\d+(?:\.\d+){0,3}/u)?.[0] || '120.0.0.0';
  if (profile === 'mobile') {
    return `Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${normalized} Mobile Safari/537.36`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${normalized} Safari/537.36`;
}

async function waitForRenderedDom(page, timeout) {
  const deadline = Date.now() + Math.min(5_000, Math.max(1_000, Math.trunc(timeout / 3)));
  let previous = '';
  let stableCount = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(400);
    try {
      const signature = await page.evaluate(() =>
        JSON.stringify({
          href: location.href,
          title: document.title,
          textLength: document.body?.innerText?.length || 0,
          loading: /(?:加载中|正在加载|\bloading\b)/iu.test(document.body?.innerText || ''),
          elements: document.body?.childElementCount || 0,
        }),
      );
      stableCount = signature === previous ? stableCount + 1 : 0;
      previous = signature;
      if (stableCount >= 2 && !JSON.parse(signature).loading) break;
    } catch {
      // 页面可能正在由挑战脚本 reload；下一轮继续观察新文档。
      stableCount = 0;
    }
  }
}

async function captureSnapshot(page, bodyLimit, status, contentType) {
  return page.evaluate(
    ({ limit, responseStatus, responseContentType }) => {
      const clean = (value, max = 2_000) =>
        String(value || '')
          .replace(/\s+/gu, ' ')
          .trim()
          .slice(0, max);
      const meta = {};
      for (const element of document.querySelectorAll('meta')) {
        const key = clean(element.getAttribute('property') || element.getAttribute('name'), 100).toLowerCase();
        const value = clean(element.getAttribute('content'), 4_000);
        if (key && value && !meta[key]) meta[key] = value;
      }

      const noiseSelector = [
        'script',
        'style',
        'noscript',
        'template',
        'svg',
        'canvas',
        'nav',
        'header',
        'footer',
        'aside',
        'form',
        'button',
        '[aria-hidden="true"]',
        '.advertisement',
        '.ads',
        '.sidebar',
        '.comments',
        '.comment-list',
        '.related-posts',
      ].join(',');
      const candidateSelectors = [
        'article',
        'main',
        '[role="main"]',
        '[itemprop="articleBody"]',
        '.article-content',
        '.article_content',
        '.post-content',
        '.post_content',
        '.entry-content',
        '.markdown-body',
        '#article_content',
        '#articleContent',
        '#content',
      ];
      const candidates = [];
      const seen = new Set();
      const addCandidate = (element) => {
        if (!element || seen.has(element)) return;
        seen.add(element);
        const clone = element.cloneNode(true);
        for (const noise of clone.querySelectorAll(noiseSelector)) noise.remove();
        for (const br of clone.querySelectorAll('br')) br.replaceWith('\n');
        const text = clean(clone.textContent, Math.max(20_000, limit));
        const linkTextLength = clean(
          [...clone.querySelectorAll('a')].map((item) => item.textContent).join(' '),
          Math.max(20_000, limit),
        ).length;
        const density = text.length ? linkTextLength / text.length : 1;
        candidates.push({
          text,
          score: text.length * Math.max(0.15, 1 - density * 0.85) + clone.querySelectorAll('p').length * 40,
        });
      };
      for (const selector of candidateSelectors) {
        for (const element of document.querySelectorAll(selector)) addCandidate(element);
      }
      if (!candidates.some((item) => item.text.length >= 80)) addCandidate(document.body || document.documentElement);
      candidates.sort((a, b) => b.score - a.score || b.text.length - a.text.length);

      const jsonLd = [];
      let jsonLdLength = 0;
      for (const script of document.querySelectorAll('script[type="application/ld+json"]')) {
        const value = String(script.textContent || '').trim();
        if (!value || jsonLdLength >= 120_000) continue;
        const bounded = value.slice(0, 120_000 - jsonLdLength);
        jsonLd.push(bounded);
        jsonLdLength += bounded.length;
      }
      const scriptDiagnostics = [];
      let diagnosticLength = 0;
      for (const script of document.scripts) {
        if (diagnosticLength >= 120_000) break;
        const value = `${script.src || ''}\n${script.textContent || ''}`.slice(0, 12_000);
        scriptDiagnostics.push(value.slice(0, 120_000 - diagnosticLength));
        diagnosticLength += value.length;
      }
      const canonical = document.querySelector('link[rel~="canonical" i]')?.href || '';
      return {
        ok: true,
        url: location.href,
        status: responseStatus,
        contentType: responseContentType,
        documentTitle: clean(document.title, 1_000),
        meta,
        canonicalUrl: clean(canonical, 2_000),
        jsonLd,
        bodyText: String(candidates[0]?.text || '').slice(0, limit),
        signals: {
          scriptCount: document.scripts.length,
          passwordInput: Boolean(document.querySelector('input[type="password"]')),
          noscriptText: clean(
            [...document.querySelectorAll('noscript')].map((item) => item.textContent).join(' '),
            2_000,
          ),
          diagnosticText: clean(
            [
              location.href,
              document.title,
              document.body?.innerText?.slice(0, 5_000) || '',
              [...document.forms].map((form) => `${form.action} ${form.method}`).join(' '),
              scriptDiagnostics.join('\n'),
            ].join('\n'),
            130_000,
          ),
        },
      };
    },
    { limit: bodyLimit, responseStatus: status, responseContentType: contentType },
  );
}

async function run(config) {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    return { ok: false, reason: 'RENDERER_INSECURE_IDENTITY' };
  }
  const target = validatePublicWebUrl(config.url, { allowedPorts: [80, 443], defaultPortsOnly: true });
  currentStage = 'proxy_start';
  const proxy = await startSafeWebProxy({ maxRequests: config.maxRequests });
  let browser;
  try {
    currentStage = 'browser_launch';
    browser = await chromium.launch({
      executablePath: config.executablePath,
      headless: true,
      chromiumSandbox: true,
      proxy: { server: proxy.url },
      downloadsPath: process.env.TMPDIR,
      args: [
        '--disable-background-networking',
        '--disable-breakpad',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-dev-shm-usage',
        '--disable-extensions',
        '--disable-quic',
        '--disable-sync',
        '--force-webrtc-ip-handling-policy=disable_non_proxied_udp',
        '--metrics-recording-only',
        '--no-first-run',
        '--proxy-bypass-list=<-loopback>',
        '--safebrowsing-disable-auto-update',
      ],
    });
    currentStage = 'context_create';
    const context = await browser.newContext({
      acceptDownloads: false,
      hasTouch: config.profile === 'mobile',
      isMobile: config.profile === 'mobile',
      javaScriptEnabled: true,
      locale: 'zh-CN',
      serviceWorkers: 'block',
      userAgent: browserUserAgent(browser.version(), config.profile),
      viewport: config.profile === 'mobile' ? { width: 412, height: 915 } : { width: 1280, height: 800 },
    });
    const page = await context.newPage();
    page.on('popup', (popup) => void popup.close().catch(() => {}));
    let routedRequests = 0;
    const blockedMethods = {};
    const diagnosticFailures = [];
    page.on('requestfailed', (request) => {
      if (!config.diagnostics || diagnosticFailures.length >= 30) return;
      try {
        const parsed = new URL(request.url());
        diagnosticFailures.push({
          method: request.method(),
          resourceType: request.resourceType(),
          target: `${parsed.hostname}${parsed.pathname}`.slice(0, 300),
          error: String(request.failure()?.errorText || '').slice(0, 120),
        });
      } catch {}
    });
    await page.route('**/*', async (route) => {
      const request = route.request();
      try {
        if (!['GET', 'HEAD'].includes(request.method().toUpperCase())) {
          blockedMethods[request.method()] = Number(blockedMethods[request.method()] || 0) + 1;
          return route.abort('blockedbyclient');
        }
        // CSS chunk 可能是 SPA 的启动依赖，阻断会让应用直接进入错误边界；图片、媒体、字体
        // 与文本提取无关，继续阻断以控制带宽和请求量。
        if (['image', 'media', 'font', 'manifest'].includes(request.resourceType())) {
          return route.abort('blockedbyclient');
        }
        const resourceUrl = new URL(request.url());
        if (['data:', 'blob:'].includes(resourceUrl.protocol)) return route.continue();
        routedRequests += 1;
        if (routedRequests > config.maxRequests) return route.abort('blockedbyclient');
        const safeUrl = validatePublicWebUrl(resourceUrl, { allowedPorts: [80, 443], defaultPortsOnly: true });
        await lookupPublicAddresses(safeUrl.hostname);
        return route.continue();
      } catch {
        return route.abort('blockedbyclient');
      }
    });
    currentStage = 'navigate';
    const response = await page.goto(target.href, { waitUntil: 'domcontentloaded', timeout: config.timeout });
    currentStage = 'settle';
    await waitForRenderedDom(page, config.timeout);
    currentStage = 'response_inspect';
    const headers = (await response?.allHeaders().catch(() => ({}))) || {};
    const contentType = String(headers['content-type'] || '');
    if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/iu.test(contentType)) {
      return { ok: false, reason: 'NOT_HTML' };
    }
    currentStage = 'snapshot';
    const snapshot = await captureSnapshot(page, config.bodyLimit, response?.status() || 0, contentType);
    snapshot.signals.blockedMethods = blockedMethods;
    if (config.diagnostics) snapshot.signals.networkFailures = diagnosticFailures;
    return snapshot;
  } finally {
    await browser?.close().catch(() => {});
    await proxy.close().catch(() => {});
  }
}

let result;
try {
  currentStage = 'input';
  const config = await readInput();
  result = await run(config);
} catch (error) {
  result = { ok: false, reason: stableReason(error), stage: currentStage };
}
// Runner 是一次性隔离进程。Linux 上 Chromium/Playwright 关闭后可能仍短暂保留底层
// 活动句柄；若只设置 exitCode，父进程会一直等到渲染硬超时并把成功误报为超时。
// 先等待协议结果完整写入 stdout，再显式结束已经完成清理的 Runner。
await new Promise((resolve) => process.stdout.write(JSON.stringify(result), resolve));
process.exit(0);

export const webPageRendererRunnerInternals = Object.freeze({ browserUserAgent, stableReason });
