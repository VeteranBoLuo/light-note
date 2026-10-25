import { afterEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';

import {
  fetchGitHubApiJson,
  fetchGitHubTokenSafely,
  selectGitHubTokenEndpoint,
  httpsRequestViaIp,
} from './githubOAuth.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

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

describe('GitHub 换票传输边界', () => {
  function transport() {
    const req = new EventEmitter();
    req.end = vi.fn();
    req.destroy = vi.fn((error) => {
      req.emit('error', error);
      return req;
    });
    const request = vi.spyOn(https, 'request').mockReturnValue(req);
    return { req, request };
  }
  it('固定 GitHub TLS 身份与 Host，单独连接不复用空闲探测 socket', async () => {
    const { req, request } = transport();
    const reading = httpsRequestViaIp(
      '192.0.2.1',
      { method: 'POST', path: '/login/oauth/access_token', headers: {}, body: 'code=one-time' },
      1000,
    );
    const response = new EventEmitter();
    response.statusCode = 200;
    response.headers = {};
    request.mock.calls[0][1](response);
    response.emit('data', Buffer.from('{"access_token":"test"}'));
    response.emit('end');
    await expect(reading).resolves.toMatchObject({ status: 200 });
    expect(request.mock.calls[0][0]).toMatchObject({
      host: '192.0.2.1',
      servername: 'github.com',
      agent: false,
      headers: { Host: 'github.com' },
    });
    expect(req.end).toHaveBeenCalledExactlyOnceWith('code=one-time');
  });
  it('TCP/TLS 一直未建立也在硬期限内失败，不等待 socket timeout', async () => {
    vi.useFakeTimers();
    const { req } = transport();
    const reading = httpsRequestViaIp('192.0.2.1', { method: 'POST', path: '/token', headers: {} }, 50);
    const checked = expect(reading).rejects.toMatchObject({ code: 'ETIMEDOUT', transportPhase: 'CONNECT' });
    await vi.advanceTimersByTimeAsync(50);
    await checked;
    expect(req.destroy).toHaveBeenCalledOnce();
  });
  it('持续滴流不能延长请求总期限', async () => {
    vi.useFakeTimers();
    const { request } = transport();
    const reading = httpsRequestViaIp('192.0.2.1', { method: 'POST', path: '/token', headers: {} }, 50);
    const checked = expect(reading).rejects.toHaveProperty('code', 'ETIMEDOUT');
    const response = new EventEmitter();
    request.mock.calls[0][1](response);
    for (let i = 0; i < 4; i++) {
      response.emit('data', Buffer.from(' '));
      await vi.advanceTimersByTimeAsync(10);
    }
    await vi.advanceTimersByTimeAsync(10);
    await checked;
  });
});
