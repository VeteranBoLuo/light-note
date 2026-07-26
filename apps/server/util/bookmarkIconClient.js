/**
 * 轻笺书签图标 - favicon-api HTTP 客户端
 *
 * 封装与 favicon-api 的通信，将 HTTP 响应解析为结构化结果。
 * 不持有数据库连接。不依赖 Express req/res 对象。
 */

import http from 'http';
import https from 'https';

const FAVICON_API_TIMEOUT_MS = parseInt(process.env.BOOKMARK_ICON_API_TIMEOUT_MS || '12000', 10);
const FAVICON_API_BASE_URL = process.env.FAVICON_API_BASE_URL || 'http://127.0.0.1:3480/favimg/';
const MAX_FAVICON_API_RESPONSE_BYTES = 6 * 1024 * 1024;
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 24,
  maxFreeSockets: 8,
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 24,
  maxFreeSockets: 8,
});

export function buildFaviconApiUrl(pathname = '', baseUrl = FAVICON_API_BASE_URL, params = {}) {
  const normalizedBase = String(baseUrl || '').endsWith('/') ? String(baseUrl) : `${String(baseUrl)}/`;
  const normalizedPath = String(pathname || '').replace(/^\/+/, '');
  const url = new URL(normalizedPath, normalizedBase);
  for (const [key, value] of Object.entries(params || {})) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }
  return url;
}

function getTransport(url) {
  if (url.protocol === 'http:') return { client: http, agent: httpAgent };
  if (url.protocol === 'https:') return { client: https, agent: httpsAgent };
  throw new Error('INVALID_FAVICON_API_BASE_URL');
}

function requestFaviconApi(url, { maxBytes = MAX_FAVICON_API_RESPONSE_BYTES } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    let transport;
    try {
      transport = getTransport(url);
    } catch {
      finish({
        ok: false,
        errorCode: 'INTERNAL_ERROR',
        retryable: true,
        durationMs: 0,
      });
      return;
    }

    const start = Date.now();
    const request = transport.client.get(url, { agent: transport.agent }, (response) => {
      const chunks = [];
      let totalBytes = 0;

      response.on('data', (chunk) => {
        totalBytes += chunk.length;
        if (totalBytes > maxBytes) {
          response.destroy();
          finish({
            ok: false,
            statusCode: response.statusCode,
            errorCode: 'UPSTREAM_ERROR',
            retryable: true,
            durationMs: Date.now() - start,
          });
          return;
        }
        chunks.push(chunk);
      });
      response.on('end', () => {
        finish({
          ok: true,
          statusCode: response.statusCode,
          headers: response.headers,
          buffer: Buffer.concat(chunks),
          durationMs: Date.now() - start,
        });
      });
      response.on('error', () => {
        finish({
          ok: false,
          statusCode: response.statusCode,
          errorCode: 'UPSTREAM_ERROR',
          retryable: true,
          durationMs: Date.now() - start,
        });
      });
    });

    request.on('error', () => {
      finish({
        ok: false,
        errorCode: 'UPSTREAM_ERROR',
        retryable: true,
        durationMs: Date.now() - start,
      });
    });
    request.setTimeout(FAVICON_API_TIMEOUT_MS, () => {
      request.destroy();
      finish({
        ok: false,
        errorCode: 'UPSTREAM_TIMEOUT',
        retryable: true,
        durationMs: Date.now() - start,
      });
    });
  });
}

/**
 * 调用 favicon-api 获取指定 URL 的 favicon
 *
 * @param {string} domainOrUrl - 需要获取图标的域名或完整 URL
 * @returns {Promise<{ok:boolean, buffer?:Buffer, contentType?:string, sourceType?:string, errorCode?:string, retryable?:boolean, durationMs?:number}>}
 */
export async function fetchFaviconFromApi(domainOrUrl) {
  const response = await requestFaviconApi(
    buildFaviconApiUrl('', FAVICON_API_BASE_URL, {
      url: domainOrUrl,
      preview: 1,
    }),
  );
  if (!response.ok) return response;

  const contentType = response.headers?.['content-type'] || '';
  const xCache = response.headers?.['x-favicon-cache'] || '';
  const xSourceType = response.headers?.['x-favicon-source-type'] || '';
  const xDuration = response.headers?.['x-favicon-duration-ms'] || '';
  if (response.statusCode === 200 && contentType.startsWith('image/')) {
    return {
      ok: true,
      buffer: response.buffer,
      contentType,
      sourceType: xSourceType || 'unknown',
      cacheHit: xCache === 'hit',
      faviconDurationMs: parseInt(xDuration, 10) || response.durationMs,
      durationMs: response.durationMs,
    };
  }

  try {
    const body = JSON.parse(response.buffer.toString('utf8'));
    return {
      ok: false,
      statusCode: response.statusCode,
      errorCode: body.code || 'INTERNAL_ERROR',
      retryable: body.retryable !== false,
      durationMs: response.durationMs,
    };
  } catch {
    return {
      ok: false,
      statusCode: response.statusCode,
      errorCode: 'UPSTREAM_ERROR',
      retryable: true,
      durationMs: response.durationMs,
    };
  }
}

export async function checkFaviconApiHealth() {
  const response = await requestFaviconApi(buildFaviconApiUrl('health'), { maxBytes: 64 * 1024 });
  if (!response.ok || response.statusCode !== 200) {
    return {
      ok: false,
      errorCode: response.errorCode || 'UPSTREAM_ERROR',
    };
  }

  try {
    const body = JSON.parse(response.buffer.toString('utf8'));
    return body?.status === 'ok' ? { ok: true } : { ok: false, errorCode: 'UPSTREAM_ERROR' };
  } catch {
    return { ok: false, errorCode: 'UPSTREAM_ERROR' };
  }
}

/**
 * 从 URL 中规范化提取 Origin
 * @param {string} rawUrl
 * @returns {string|null} 例如 "https://github.com"
 */
export function normalizeOrigin(rawUrl) {
  try {
    const value = String(rawUrl || '').trim();
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * 判断 favicon-api 返回的错误码是否可重试
 */
export function isRetryableError(errorCode) {
  const retryableCodes = ['DNS_ERROR', 'UPSTREAM_TIMEOUT', 'UPSTREAM_ERROR', 'QUEUE_FULL', 'INTERNAL_ERROR'];
  return retryableCodes.includes(errorCode);
}

/**
 * 判断 favicon-api 返回的错误码是否永久性（不值得重试）
 */
export function isPermanentError(errorCode) {
  const permanentCodes = ['INVALID_URL', 'PRIVATE_ADDRESS'];
  return permanentCodes.includes(errorCode);
}
