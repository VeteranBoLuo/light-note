import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import { githubOAuthRelay, requestGitHubRelay } from './githubOAuthRelay.js';

const GITHUB_HOST = 'github.com';
const TOKEN_PATH = '/login/oauth/access_token';
const DEFAULT_PROBE_TIMEOUT_MS = 2800;
const DEFAULT_TOKEN_TIMEOUT_MS = 8000;

// DNS 在部分网络环境下偶发只返回不可达地址，因此保留一组最近验证过的 GitHub Web 地址作为兜底。
// 可通过 GITHUB_OAUTH_HOST_IPS 追加运维侧验证过的地址；授权码仍只会向最终选中的一个地址提交一次。
const FALLBACK_GITHUB_HOST_IPS = [
  '140.82.121.4',
  '140.82.121.3',
  '140.82.116.3',
  '140.82.114.3',
  '140.82.113.3',
  '140.82.112.3',
  '20.27.177.113',
  '20.205.243.166',
];

export class GitHubOAuthError extends Error {
  constructor(code, message, { stage = 'UNKNOWN', status = 503, upstreamStatus, providerCode, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'GitHubOAuthError';
    this.code = code;
    this.stage = stage;
    this.status = status;
    this.upstreamStatus = upstreamStatus;
    this.providerCode = /^[A-Za-z0-9_.-]{1,80}$/.test(String(providerCode || '')) ? String(providerCode) : undefined;
  }
}

function configuredFallbackIps() {
  const configured = String(process.env.GITHUB_OAUTH_HOST_IPS || '')
    .split(',')
    .map((value) => value.trim())
    .filter((value) => net.isIP(value));
  return [...new Set([...configured, ...FALLBACK_GITHUB_HOST_IPS])];
}

async function resolveGitHubIpv4() {
  try {
    let timeout;
    const records = await Promise.race([
      dns.lookup(GITHUB_HOST, { all: true, family: 4, verbatim: true }),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error('dns timeout')), 1200);
      }),
    ]).finally(() => clearTimeout(timeout));
    return records.map((record) => record.address).filter((value) => net.isIPv4(value));
  } catch {
    return [];
  }
}

export function httpsRequestViaIp(ip, { method, path, headers, body }, timeoutMs) {
  return new Promise((resolve, reject) => {
    let phase = 'CONNECT';
    let settled = false;
    let timer;
    const finish = (error, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        error.transportPhase = phase;
        reject(error);
      } else resolve(value);
    };
    const req = https.request(
      {
        host: ip,
        servername: GITHUB_HOST,
        port: 443,
        method,
        path,
        headers: { Host: GITHUB_HOST, ...headers },
        timeout: timeoutMs,
        // 一次性授权码请求不复用探测或其他登录遗留的空闲连接。
        agent: false,
      },
      (res) => {
        phase = 'RESPONSE_HEADERS';
        const chunks = [];
        let size = 0;
        res.on('data', (chunk) => {
          size += chunk.length;
          if (size <= 64 * 1024) chunks.push(chunk);
          else req.destroy(Object.assign(new Error('GitHub response is too large'), { code: 'RESPONSE_TOO_LARGE' }));
        });
        res.on('end', () => {
          if (size > 64 * 1024) {
            finish(new Error('GitHub response is too large'));
            return;
          }
          finish(null, {
            status: Number(res.statusCode || 0),
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
        res.once('error', (error) => finish(error));
        res.once('aborted', () => finish(Object.assign(new Error('GitHub response aborted'), { code: 'ECONNRESET' })));
      },
    );
    const timedOut = () =>
      req.destroy(Object.assign(new Error('GitHub request deadline exceeded'), { code: 'ETIMEDOUT' }));
    // socket timeout 不覆盖等待连接、TLS 和持续滴流，额外设置整次请求的硬期限。
    timer = setTimeout(timedOut, timeoutMs);
    req.once('socket', (socket) =>
      socket.once('secureConnect', () => {
        phase = 'TLS_READY';
      }),
    );
    req.once('finish', () => {
      phase = 'REQUEST_SENT';
    });
    req.once('timeout', timedOut);
    req.once('error', (error) => finish(error));
    req.end(body || undefined);
  });
}

async function probeGitHubIp(ip, timeoutMs = DEFAULT_PROBE_TIMEOUT_MS) {
  const startedAt = Date.now();
  // 使用无效的公开参数探测同一种 POST；不包含应用密钥、用户 code 或 token。
  const body = 'client_id=light-note-connectivity-check';
  const response = await httpsRequestViaIp(
    ip,
    {
      method: 'POST',
      path: TOKEN_PATH,
      headers: {
        'User-Agent': 'light-note-oauth-health',
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
      body,
    },
    timeoutMs,
  );
  if (![200, 400, 401, 404, 422].includes(response.status)) throw new Error('GitHub endpoint is unhealthy');
  return { ip, latencyMs: Date.now() - startedAt };
}

/**
 * 在提交一次性授权码之前完成线路选择。探测请求不携带 code，不会消费 OAuth 授权。
 */
export async function selectGitHubTokenEndpoint({ resolveIps = resolveGitHubIpv4, probeIp = probeGitHubIp } = {}) {
  const resolved = await resolveIps();
  const candidates = [...new Set([...resolved, ...configuredFallbackIps()])];
  if (!candidates.length) {
    throw new GitHubOAuthError('GITHUB_OAUTH_ROUTE_UNAVAILABLE', 'GitHub 登录线路暂不可用', {
      stage: 'TOKEN_CONNECT',
    });
  }

  try {
    // 所有候选同时做无副作用的完整 HTTPS 探测，最先成功的线路即为本次唯一换票线路。
    return await Promise.any(candidates.map((ip) => probeIp(ip)));
  } catch (cause) {
    throw new GitHubOAuthError('GITHUB_OAUTH_ROUTE_UNAVAILABLE', 'GitHub 登录线路暂不可用', {
      stage: 'TOKEN_CONNECT',
      cause,
    });
  }
}

/**
 * 安全换取 GitHub OAuth token：先选路，再且仅再提交一次授权码。
 * 请求发出后的超时结果具有不确定性，绝不换 IP 重放同一个 code。
 */
export async function fetchGitHubTokenSafely(
  bodyStr,
  {
    selectEndpoint = selectGitHubTokenEndpoint,
    requestViaIp = httpsRequestViaIp,
    relay = githubOAuthRelay(),
    requestRelay = requestGitHubRelay,
  } = {},
) {
  let endpoint;
  if (relay) {
    const startedAt = Date.now();
    try {
      const probe = await requestRelay(relay, { operation: 'probe' }, 5000);
      if (![200, 400, 401, 404, 422].includes(probe.status)) throw new Error('unhealthy');
      endpoint = { ip: 'relay', latencyMs: Date.now() - startedAt };
    } catch (cause) {
      throw new GitHubOAuthError('GITHUB_OAUTH_ROUTE_UNAVAILABLE', 'GitHub 登录线路暂不可用', {
        stage: 'TOKEN_CONNECT',
        cause,
      });
    }
  } else endpoint = await selectEndpoint();
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(bodyStr),
    'User-Agent': 'light-note',
  };

  let response;
  try {
    response = relay
      ? await requestRelay(relay, { operation: 'token', body: bodyStr }, 10000)
      : await requestViaIp(
          endpoint.ip,
          { method: 'POST', path: TOKEN_PATH, headers, body: bodyStr },
          DEFAULT_TOKEN_TIMEOUT_MS,
        );
  } catch (cause) {
    const error = new GitHubOAuthError('GITHUB_OAUTH_TOKEN_RESULT_UNKNOWN', 'GitHub 响应超时，请重新发起授权', {
      stage: 'TOKEN_EXCHANGE',
      cause,
    });
    error.transportPhase = cause?.transportPhase;
    throw error;
  }

  let data;
  try {
    data = JSON.parse(response.body);
  } catch (cause) {
    throw new GitHubOAuthError('GITHUB_OAUTH_TOKEN_RESPONSE_INVALID', 'GitHub 返回了无效响应', {
      stage: 'TOKEN_EXCHANGE',
      cause,
    });
  }
  if (response.status === 200 && data?.access_token) {
    return { ...data, route: { ip: endpoint.ip, latencyMs: endpoint.latencyMs } };
  }

  const githubError = String(data?.error || '');
  const rejected = ['bad_verification_code', 'incorrect_client_credentials', 'redirect_uri_mismatch'].includes(
    githubError,
  );
  throw new GitHubOAuthError(
    rejected ? 'GITHUB_OAUTH_CODE_REJECTED' : 'GITHUB_OAUTH_TOKEN_EXCHANGE_FAILED',
    rejected ? 'GitHub 授权已失效，请重新发起授权' : 'GitHub 暂时无法完成认证',
    {
      stage: 'TOKEN_EXCHANGE',
      status: rejected ? 400 : 503,
      upstreamStatus: response.status,
      providerCode: githubError || undefined,
    },
  );
}

function retryDelayMs(response, attempt) {
  const retryAfterHeader = response?.headers?.get?.('retry-after');
  const retryAfter = retryAfterHeader == null || retryAfterHeader === '' ? Number.NaN : Number(retryAfterHeader);
  if (Number.isFinite(retryAfter) && retryAfter >= 0) return Math.min(retryAfter * 1000, 2500);
  return 300 * 2 ** attempt + Math.floor(Math.random() * 120);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * 读取 GitHub API。仅重试可安全重放的 GET，并覆盖网络异常、限流和瞬时 5xx。
 */
export async function fetchGitHubApiJson(
  path,
  accessToken,
  {
    attempts = 3,
    timeoutMs = 6500,
    fetchImpl = globalThis.fetch,
    waitImpl = wait,
    relay = githubOAuthRelay(),
    requestRelay = requestGitHubRelay,
  } = {},
) {
  if (relay && !['/user', '/user/emails'].includes(path)) {
    throw new GitHubOAuthError('GITHUB_OAUTH_API_PATH_INVALID', 'GitHub 接口不可用', { stage: 'PROFILE_FETCH' });
  }
  let lastResponse;
  let lastCause;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = relay
        ? await requestRelay(
            relay,
            {
              operation: path === '/user' ? 'user' : 'emails',
              accessToken,
            },
            timeoutMs,
          ).then((result) => ({
            ok: result.status >= 200 && result.status < 300,
            status: result.status,
            headers: { get: (name) => result.headers[name] ?? null },
            json: async () => JSON.parse(result.body),
          }))
        : await fetchImpl(`https://api.github.com${path}`, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${accessToken}`,
              Accept: 'application/vnd.github+json',
              'X-GitHub-Api-Version': '2022-11-28',
              'User-Agent': 'light-note',
            },
          });
      lastResponse = response;
      if (response.ok) return await response.json();

      const rateLimited403 =
        response.status === 403 &&
        (response.headers?.get?.('x-ratelimit-remaining') === '0' || Boolean(response.headers?.get?.('retry-after')));
      const retryable = response.status === 429 || rateLimited403 || [500, 502, 503, 504].includes(response.status);
      if (!retryable || attempt === attempts - 1) break;
      await waitImpl(retryDelayMs(response, attempt));
    } catch (cause) {
      lastCause = cause;
      if (attempt === attempts - 1) break;
      await waitImpl(300 * 2 ** attempt + Math.floor(Math.random() * 120));
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new GitHubOAuthError('GITHUB_OAUTH_API_UNAVAILABLE', 'GitHub 用户信息暂时不可用', {
    stage: 'PROFILE_FETCH',
    status: lastResponse?.status === 401 ? 400 : 503,
    upstreamStatus: lastResponse?.status,
    cause: lastCause,
  });
}
