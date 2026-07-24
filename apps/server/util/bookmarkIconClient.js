/**
 * 轻笺书签图标 - favicon-api HTTP 客户端
 *
 * 封装与 favicon-api 的通信，将 HTTP 响应解析为结构化结果。
 * 不持有数据库连接。不依赖 Express req/res 对象。
 */

import http from 'http';
import https from 'https';

const FAVICON_API_TIMEOUT_MS = parseInt(process.env.BOOKMARK_ICON_API_TIMEOUT_MS || "12000", 10);
// favicon-api 默认运行在 3456，但轻笺通过工具箱 hub(:3480) 代理 /favimg/ 路径
const FAVICON_API_HOST = process.env.FAVICON_API_HOST || '127.0.0.1';
const FAVICON_API_PORT = parseInt(process.env.FAVICON_API_PORT || "3480", 10);
const FAVICON_API_PATH = process.env.FAVICON_API_PATH || '/favimg/';

/**
 * 调用 favicon-api 获取指定 URL 的 favicon
 *
 * @param {string} domainOrUrl - 需要获取图标的域名或完整 URL
 * @returns {Promise<{ok:boolean, buffer?:Buffer, contentType?:string, sourceType?:string, errorCode?:string, retryable?:boolean, durationMs?:number}>}
 */
export function fetchFaviconFromApi(domainOrUrl) {
  return new Promise((resolve) => {
    const url = `/favimg/?url=${encodeURIComponent(domainOrUrl)}&preview=1`;
    const start = Date.now();

    const request = http.get(
      {
        hostname: FAVICON_API_HOST,
        port: FAVICON_API_PORT,
        path: url,
      },
      (response) => {
        const durationMs = Date.now() - start;
        const chunks = [];
        const contentType = response.headers['content-type'] || '';
        const xCache = response.headers['x-favicon-cache'] || '';
        const xSourceType = response.headers['x-favicon-source-type'] || '';
        const xDuration = response.headers['x-favicon-duration-ms'] || '';

        response.on('data', (c) => chunks.push(c));
        response.on('end', () => {
          if (response.statusCode === 200 && contentType.startsWith('image/')) {
            const buffer = Buffer.concat(chunks);
            resolve({
              ok: true,
              buffer,
              contentType,
              sourceType: xSourceType || 'unknown',
              cacheHit: xCache === 'hit',
              faviconDurationMs: parseInt(xDuration) || durationMs,
              durationMs,
            });
            return;
          }

          // 非 200 响应：解析结构化 JSON 错误
          try {
            const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            resolve({
              ok: false,
              statusCode: response.statusCode,
              errorCode: body.code || 'INTERNAL_ERROR',
              retryable: body.retryable !== false,
              error: body.error || 'Unknown error',
              durationMs,
            });
          } catch {
            // 无法解析 JSON，按通用错误处理
            resolve({
              ok: false,
              statusCode: response.statusCode,
              errorCode: 'UPSTREAM_ERROR',
              retryable: true,
              error: `Unexpected response: ${response.statusCode}`,
              durationMs,
            });
          }
        });
      },
    );

    request.on('error', (err) => {
      resolve({
        ok: false,
        errorCode: err.code === 'ECONNREFUSED' ? 'UPSTREAM_ERROR' : 'UPSTREAM_ERROR',
        retryable: true,
        error: err.message,
        durationMs: Date.now() - start,
      });
    });

    request.setTimeout(FAVICON_API_TIMEOUT_MS, () => {
      request.destroy();
      resolve({
        ok: false,
        errorCode: 'UPSTREAM_TIMEOUT',
        retryable: true,
        error: 'Favicon API timed out',
        durationMs: Date.now() - start,
      });
    });
  });
}

/**
 * 从 URL 中规范化提取 Origin
 * @param {string} rawUrl
 * @returns {string|null} 例如 "https://github.com"
 */
export function normalizeOrigin(rawUrl) {
  try {
    const url = new URL(rawUrl.startsWith('http') ? rawUrl : `https://${rawUrl}`);
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
