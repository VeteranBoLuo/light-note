import { describe, expect, it, vi } from 'vitest';

import { fetchGitHubApiJson, fetchGitHubTokenSafely, selectGitHubTokenEndpoint } from './githubOAuth.js';

describe('GitHub OAuth 安全直连', () => {
  it('只在提交授权码前探测线路，并选择首个完整 HTTPS 可达地址', async () => {
    const probeIp = vi.fn(async (ip) => {
      if (ip === '192.0.2.2') return { ip, latencyMs: 18 };
      throw new Error('unreachable');
    });

    await expect(
      selectGitHubTokenEndpoint({
        resolveIps: async () => ['192.0.2.1', '192.0.2.2'],
        probeIp,
      }),
    ).resolves.toEqual({ ip: '192.0.2.2', latencyMs: 18 });
    expect(probeIp).toHaveBeenCalledWith('192.0.2.1');
    expect(probeIp).toHaveBeenCalledWith('192.0.2.2');
  });

  it('换票请求超时后绝不向其他 IP 重放同一个 code', async () => {
    const requestViaIp = vi.fn(async () => {
      throw new Error('timeout');
    });

    await expect(
      fetchGitHubTokenSafely('code=one-time-code', {
        selectEndpoint: async () => ({ ip: '192.0.2.2', latencyMs: 20 }),
        requestViaIp,
      }),
    ).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_TOKEN_RESULT_UNKNOWN',
      stage: 'TOKEN_EXCHANGE',
    });
    expect(requestViaIp).toHaveBeenCalledTimes(1);
  });

  it('GitHub 明确拒绝授权码时返回可识别错误且不重试', async () => {
    const requestViaIp = vi.fn(async () => ({
      status: 200,
      body: JSON.stringify({ error: 'bad_verification_code' }),
    }));

    await expect(
      fetchGitHubTokenSafely('code=expired-code', {
        selectEndpoint: async () => ({ ip: '192.0.2.2', latencyMs: 20 }),
        requestViaIp,
      }),
    ).rejects.toMatchObject({ code: 'GITHUB_OAUTH_CODE_REJECTED', status: 400 });
    expect(requestViaIp).toHaveBeenCalledTimes(1);
  });

  it('GitHub 用户 GET 对 503 做安全重试并使用标准请求头', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 503, headers: { get: () => null } })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 1, login: 'boluo' }) });
    const waitImpl = vi.fn(async () => {});

    await expect(fetchGitHubApiJson('/user', 'token', { fetchImpl, waitImpl })).resolves.toEqual({
      id: 1,
      login: 'boluo',
    });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waitImpl).toHaveBeenCalledTimes(1);
    expect(fetchImpl.mock.calls[0][1].headers).toMatchObject({
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'light-note',
    });
  });

  it('GitHub 用户 GET 遇到 401 不重试', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 401, headers: { get: () => null } }));

    await expect(fetchGitHubApiJson('/user', 'token', { fetchImpl, waitImpl: vi.fn() })).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_API_UNAVAILABLE',
      status: 400,
    });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('GitHub 用户 GET 遇到明确限流的 403 时按 Retry-After 重试', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        headers: { get: (name) => (name === 'retry-after' ? '1' : name === 'x-ratelimit-remaining' ? '0' : null) },
      })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ id: 1 }) });
    const waitImpl = vi.fn(async () => {});

    await expect(fetchGitHubApiJson('/user', 'token', { fetchImpl, waitImpl })).resolves.toEqual({ id: 1 });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(waitImpl).toHaveBeenCalledWith(1000);
  });
});
