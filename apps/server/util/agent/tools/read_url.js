import { fetchWebMeta } from '../../fetchWebMeta.js';
import { isAgentUrlAllowedByScope } from '../webAccessPolicy.js';
import redisClient from '../../redisClient.js';
import crypto from 'node:crypto';

const CACHE_PREFIX = 'agent:web-read:v1:';
const CACHE_TTL_SECONDS = 10 * 60;
const MIN_READABLE_TEXT = 180;

const REASON_MSG = {
  INVALID_URL: '网址格式无效',
  UNSUPPORTED_PROTOCOL: '仅支持 http/https 链接',
  URL_CREDENTIALS_FORBIDDEN: '不允许读取包含账号或密码的链接',
  BLOCKED_HOST: '拒绝访问内网/非法地址',
  NOT_HTML: '该链接不是网页(可能是文件、图片或需要登录)',
  ACCESS_DENIED: '网站拒绝了服务器读取，可能需要登录或存在访问限制',
  NOT_FOUND: '网页不存在或已经删除',
  RATE_LIMITED: '网站暂时限制了读取频率',
  TIMEOUT: '网站响应超时',
  DNS_FAILED: '无法解析网站域名',
  TLS_FAILED: '网站证书校验失败',
  FETCH_FAILED: '抓取失败,可能无法访问或超时',
  EMPTY_CONTENT: '未提取到有效正文',
};

function createLinkedController(parentSignal) {
  const controller = new AbortController();
  const abort = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abort();
  else parentSignal?.addEventListener('abort', abort, { once: true });
  return {
    controller,
    dispose() {
      parentSignal?.removeEventListener?.('abort', abort);
    },
  };
}

function isCacheableUrl(rawUrl) {
  try {
    const url = new URL(rawUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.hash) return false;
    const sensitive = [...url.searchParams.keys()].some((key) =>
      /token|auth|key|secret|signature|credential|password|session|expires|(?:^|[_-])sig(?:$|[_-])|jwt|code/i.test(key),
    );
    return !url.username && !url.password && !sensitive && url.href.length <= 2048;
  } catch {
    return false;
  }
}

function cacheKey(url) {
  return `${CACHE_PREFIX}${crypto.createHash('sha256').update(String(url)).digest('hex')}`;
}

async function readCache(url) {
  if (!isCacheableUrl(url)) return null;
  try {
    const raw = await redisClient.get(cacheKey(url));
    if (!raw) return null;
    const value = JSON.parse(raw);
    return value?.url && typeof value?.bodyText === 'string' ? value : null;
  } catch {
    return null;
  }
}

function writeCache(url, value) {
  if (!isCacheableUrl(url)) return;
  try {
    void Promise.resolve(redisClient.setEx(cacheKey(url), CACHE_TTL_SECONDS, JSON.stringify(value))).catch(() => {});
  } catch {
    // Redis 缓存只是读取加速层，不得影响网页正文主流程。
  }
}

async function readBoundedFetchText(response, maxBytes = 2 * 1024 * 1024) {
  const contentLength = Number(response.headers?.get?.('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) return '';
  if (!response.body?.getReader) {
    const text = String(await response.text());
    return Buffer.byteLength(text, 'utf8') <= maxBytes ? text : '';
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value?.byteLength || 0;
      if (total > maxBytes) {
        await reader.cancel();
        return '';
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock?.();
  }
}

function readabilityServiceUrl() {
  const configured = String(process.env.READABILITY_SERVICE_URL || '').trim();
  if (/^(?:off|false|disabled)$/i.test(configured)) return '';
  return configured || 'http://127.0.0.1:3466/';
}

async function fetchFromReadabilityService(url, signal) {
  const service = readabilityServiceUrl();
  if (!service || !isCacheableUrl(url) || typeof fetch !== 'function') return null;
  let endpoint;
  try {
    endpoint = new URL(service);
    if (!['http:', 'https:'].includes(endpoint.protocol) || endpoint.username || endpoint.password) return null;
    endpoint.searchParams.set('url', url);
  } catch {
    return null;
  }
  const timerController = new AbortController();
  const abort = () => timerController.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => timerController.abort(new DOMException('阅读服务超时', 'TimeoutError')), 12_000);
  timer.unref?.();
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'application/json' },
      signal: timerController.signal,
    });
    if (!response.ok) return null;
    const responseText = await readBoundedFetchText(response);
    if (!responseText) return null;
    let raw;
    try {
      raw = JSON.parse(responseText);
    } catch {
      return null;
    }
    const text = String(raw?.textContent || '')
      .trim()
      .slice(0, 12_000);
    if (raw?.error || text.length < MIN_READABLE_TEXT) return null;
    return {
      ok: true,
      url: String(raw.url || url),
      title: String(raw.title || ''),
      description: String(raw.excerpt || raw.description || ''),
      siteName: String(raw.siteName || ''),
      keywords: '',
      bodyText: text,
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

function externalReaderEndpoint(url) {
  const template = String(process.env.WEB_READER_EXTERNAL_FALLBACK_TEMPLATE || '').trim();
  if (!template || !isCacheableUrl(url) || (!template.includes('{rawUrl}') && !template.includes('{encodedUrl}'))) {
    return null;
  }
  try {
    const resolveTemplate = (value) =>
      new URL(template.replaceAll('{rawUrl}', value).replaceAll('{encodedUrl}', encodeURIComponent(value)));
    const firstProbe = resolveTemplate('https://example.com/a');
    const secondProbe = resolveTemplate('https://example.net/b');
    if (firstProbe.origin !== secondProbe.origin) return null;
    const endpoint = new URL(template.replaceAll('{rawUrl}', url).replaceAll('{encodedUrl}', encodeURIComponent(url)));
    if (
      !['http:', 'https:'].includes(endpoint.protocol) ||
      endpoint.username ||
      endpoint.password ||
      endpoint.origin !== firstProbe.origin
    ) {
      return null;
    }
    return endpoint;
  } catch {
    return null;
  }
}

async function fetchFromExternalReader(url, signal) {
  const endpoint = externalReaderEndpoint(url);
  if (!endpoint || typeof fetch !== 'function') return null;
  const timerController = new AbortController();
  const abort = () => timerController.abort(signal?.reason);
  if (signal?.aborted) abort();
  else signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => timerController.abort(new DOMException('增强阅读服务超时', 'TimeoutError')), 10_000);
  timer.unref?.();
  try {
    const response = await fetch(endpoint, {
      headers: { Accept: 'text/plain,text/markdown;q=0.9,application/json;q=0.5' },
      signal: timerController.signal,
    });
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    let text = '';
    let title = '';
    const responseText = await readBoundedFetchText(response);
    if (!responseText) return null;
    if (contentType.includes('application/json')) {
      let raw;
      try {
        raw = JSON.parse(responseText);
      } catch {
        return null;
      }
      text = String(raw?.data?.content || raw?.content || raw?.text || '').trim();
      title = String(raw?.data?.title || raw?.title || '').trim();
    } else {
      text = responseText.trim();
    }
    text = text.slice(0, 12_000);
    if (text.length < MIN_READABLE_TEXT) return null;
    if (!title) title = text.match(/^#\s+(.+)$/m)?.[1]?.trim() || '';
    return {
      ok: true,
      url,
      title,
      description: '',
      siteName: '',
      keywords: '',
      bodyText: text,
    };
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    return null;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', abort);
  }
}

function isMeaningful(result) {
  return result?.ok === true && String(result.bodyText || '').trim().length >= MIN_READABLE_TEXT;
}

async function fetchReadablePage(url, signal) {
  const cached = await readCache(url);
  if (cached) return { ...cached, ok: true };

  // 本地 Cheerio 主正文提取与独立 Mozilla Readability 服务并行，任一先得到有效正文即返回，
  // 避免反爬/超时站点按串行重试把等待时间翻倍。胜出后主动中止另一条请求。
  const direct = createLinkedController(signal);
  const readability = createLinkedController(signal);
  const directPromise = fetchWebMeta(url, {
    signal: direct.controller.signal,
    timeout: 12_000,
    bodyLimit: 12_000,
  })
    .then((value) => ({ index: 0, value }))
    .catch((error) => {
      if (signal?.aborted) throw error;
      return { index: 0, value: { ok: false, reason: 'FETCH_FAILED' } };
    });
  const readabilityPromise = fetchFromReadabilityService(url, readability.controller.signal)
    .then((value) => ({ index: 1, value }))
    .catch((error) => {
      if (signal?.aborted) throw error;
      return { index: 1, value: null };
    });
  const wrapped = [directPromise, readabilityPromise];
  try {
    const first = await Promise.race(wrapped);
    if (isMeaningful(first.value)) {
      if (first.index === 0) readability.controller.abort(new DOMException('已有可用正文', 'AbortError'));
      else direct.controller.abort(new DOMException('已有可用正文', 'AbortError'));
      writeCache(url, first.value);
      return first.value;
    }
    const second = await wrapped[first.index === 0 ? 1 : 0];
    if (isMeaningful(second.value)) {
      writeCache(url, second.value);
      return second.value;
    }
    const internalFallback = first.value?.ok
      ? first.value
      : second.value?.ok
        ? second.value
        : first.value || second.value;
    const internalReasons = [first.value?.reason, second.value?.reason].filter(Boolean);
    if (
      internalReasons.some((reason) =>
        ['INVALID_URL', 'UNSUPPORTED_PROTOCOL', 'URL_CREDENTIALS_FORBIDDEN', 'BLOCKED_HOST'].includes(reason),
      )
    ) {
      return internalFallback;
    }
    const external = await fetchFromExternalReader(url, signal);
    if (isMeaningful(external)) {
      writeCache(url, external);
      return external;
    }
    return internalFallback;
  } finally {
    direct.controller.abort(new DOMException('网页读取已结束', 'AbortError'));
    readability.controller.abort(new DOMException('网页读取已结束', 'AbortError'));
    direct.dispose();
    readability.dispose();
  }
}

export default {
  name: 'read_url',
  description:
    '读取一个网页链接的标题、描述与正文摘录,用于"读这个链接/总结这个网页/根据这个网址回答我"等请求。返回内容后请据实总结或回答,不要编造网页里没有的信息。',
  parameters: {
    type: 'object',
    properties: {
      url: { type: 'string', description: '要读取的网页链接,必填' },
    },
    required: ['url'],
  },
  requireRoot: false,
  isWrite: false,
  timeoutMs: 24_000,
  resultBudget: 14_000,
  async prepareArgs(args, ctx) {
    const url = String(args.url || '').trim();
    if (!url) throw new Error('URL_REQUIRED: 网址不能为空');
    if (
      !isAgentUrlAllowedByScope({
        message: ctx.question,
        url,
        externalWeb: ctx.agentContentScope?.externalWeb === true,
        allowedUrls: ctx.agentContentScope?.allowedWebUrls,
      })
    ) {
      throw new Error('URL_SCOPE_FORBIDDEN: 只能读取你在本轮消息中明确提供的网页链接。');
    }
    return { url };
  },
  toSources(raw) {
    if (raw?.error || !raw?.url) return [];
    return [
      {
        type: 'web',
        id: raw.url,
        title: raw.title || raw.siteName || raw.url,
        url: raw.url,
        excerpt: raw.description || raw.text,
        target: 'web-url',
      },
    ];
  },
  async execute(args, ctx) {
    let url = String(args.url || '').trim();
    if (!url) return { error: 'URL_REQUIRED', message: '网址不能为空' };
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;

    const meta = await fetchReadablePage(url, ctx.signal);
    if (!meta?.ok) return { error: meta?.reason || 'FETCH_FAILED', message: REASON_MSG[meta?.reason] || '读取失败' };
    return {
      url: meta.url,
      title: meta.title,
      description: meta.description,
      siteName: meta.siteName,
      text: meta.bodyText,
    };
  },
  transform(raw) {
    if (raw.error) return `读取失败:${raw.message}`;
    // 结构化正文喂给模型,由模型据实总结/回答
    return [
      `链接:${raw.url}`,
      `标题:${raw.title || '(无)'}`,
      raw.description ? `描述:${raw.description}` : '',
      raw.siteName ? `站点:${raw.siteName}` : '',
      `正文摘录:\n${raw.text || '(无)'}`,
    ]
      .filter(Boolean)
      .join('\n');
  },
  summarize(raw) {
    if (raw.error) return `读取链接失败:${raw.message}`;
    return `读取链接「${raw.title || raw.url}」`;
  },
};
