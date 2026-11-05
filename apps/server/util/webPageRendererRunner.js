import { chromium } from 'playwright-core';
import { startSafeWebProxy } from './safeWebProxy.js';
import { lookupPublicAddresses, validatePublicWebUrl } from './webUrlSafety.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

async function waitForRenderedDom(page, deadline, pendingRequests = () => 0) {
  let previous = '';
  let stableCount = 0;
  while (Date.now() < deadline) {
    await page.waitForTimeout(Math.min(400, Math.max(1, deadline - Date.now())));
    try {
      const signature = await page.evaluate(() =>
        JSON.stringify({
          href: location.href,
          title: document.title,
          text: String(document.body?.innerText || '')
            .trim()
            .slice(0, 2_000),
          description:
            document
              .querySelector(
                'meta[name="description" i],meta[property="og:description" i],meta[name="twitter:description" i]',
              )
              ?.getAttribute('content') || '',
          shareTitle:
            document
              .querySelector('meta[property="og:title" i],meta[name="twitter:title" i]')
              ?.getAttribute('content') || '',
          elements: document.body?.childElementCount || 0,
        }),
      );
      stableCount = signature === previous ? stableCount + 1 : 0;
      previous = signature;
      const snapshot = JSON.parse(signature);
      const hasMaterial =
        snapshot.text.length >= 40 ||
        snapshot.shareTitle.trim().length >= 3 ||
        (snapshot.title.trim().length >= 3 && snapshot.description.trim().length >= 8);
      const loading = snapshot.text.length < 800 && /(?:加载中|正在加载|\bloading\b)/iu.test(snapshot.text);
      if (stableCount >= 2 && hasMaterial && !loading && pendingRequests() === 0) break;
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
  const deadline = Date.now() + config.timeout;
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
    if (config.runtimeProbe === true) return { ok: true, uid: process.getuid?.() ?? null };
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
    const pendingRequests = new Set();
    let mainResponse = null;
    page.on('response', (response) => {
      if (response.request().isNavigationRequest() && response.frame() === page.mainFrame()) mainResponse = response;
    });
    page.on('request', (request) => {
      if (['document', 'script', 'stylesheet', 'xhr', 'fetch'].includes(request.resourceType()))
        pendingRequests.add(request);
    });
    const finishRequest = (request) => pendingRequests.delete(request);
    page.on('requestfinished', finishRequest);
    page.on('requestfailed', finishRequest);
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
    const response = await page.goto(target.href, {
      waitUntil: 'domcontentloaded',
      timeout: Math.max(1, deadline - Date.now()),
    });
    currentStage = 'settle';
    await waitForRenderedDom(page, deadline, () => pendingRequests.size);
    currentStage = 'response_inspect';
    const finalResponse = mainResponse || response;
    const headers = (await finalResponse?.allHeaders().catch(() => ({}))) || {};
    const contentType = String(headers['content-type'] || '');
    if (contentType && !/text\/html|application\/xhtml|text\/plain|application\/xml/iu.test(contentType)) {
      return { ok: false, reason: 'NOT_HTML' };
    }
    currentStage = 'snapshot';
    const snapshot = await captureSnapshot(page, config.bodyLimit, finalResponse?.status() || 0, contentType);
    snapshot.signals.blockedMethods = blockedMethods;
    if (config.diagnostics) snapshot.signals.networkFailures = diagnosticFailures;
    return snapshot;
  } finally {
    await browser?.close().catch(() => {});
    await proxy.close().catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  try {
    currentStage = 'input';
    const config = await readInput();
    result = await run(config);
  } catch (error) {
    result = { ok: false, reason: stableReason(error), stage: currentStage };
  }
  // Runner 是一次性隔离进程，先完成清理与结果写入，再主动退出。
  await new Promise((resolve) => process.stdout.write(JSON.stringify(result), resolve));
  process.exit(0);
}

export const webPageRendererRunnerInternals = Object.freeze({
  browserUserAgent,
  stableReason,
  waitForRenderedDom,
  run,
});
