import { afterEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { githubOAuthRelay, requestGitHubRelay } from './githubOAuthRelay.js';
import { guardedPublicLookup } from './webUrlSafety.js';
import worker, { handleGitHubRelay } from '../../../scripts/github-oauth-relay/worker.mjs';

const secret = 's'.repeat(43);
const relay = { url: 'https://relay.example.com/github', token: secret };
const tokenBody = new URLSearchParams({
  client_id: 'client',
  client_secret: 'client-secret',
  code: 'code'.repeat(500),
  redirect_uri: 'https://app.example.com/callback',
  code_verifier: 'v'.repeat(43),
}).toString();
const request = (payload = { operation: 'probe' }, options = {}) =>
  new Request(relay.url, {
    method: 'POST',
    headers: { authorization: `Bearer ${secret}`, 'content-type': 'application/json' },
    body: JSON.stringify(payload),
    ...options,
  });
const response = (data, init = {}) => Response.json(data, init);
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('GitHub relay configuration', () => {
  it('only enables explicitly configured HTTPS relay and secret, empty configuration keeps direct access', () => {
    expect(githubOAuthRelay({})).toBeNull();
    expect(githubOAuthRelay({ GITHUB_OAUTH_RELAY_URL: relay.url, GITHUB_OAUTH_RELAY_TOKEN: secret })).toEqual(relay);
  });
  it.each([
    ['', secret],
    [relay.url, ''],
    [relay.url, 'short'],
    ['http://relay.example.com/github', secret],
    ['https://127.0.0.1/github', secret],
    ['https://relay.example.com:8443/github', secret],
    ['https://relay.example.com/github?url=https://github.com', secret],
    ['https://user:pass@relay.example.com/github', secret],
    ['https://relay.example.com/other', secret],
    ['https://relay.example.com/github#fragment', secret],
  ])('rejects incomplete or unsafe configuration %s', (url, token) => {
    expect(() => githubOAuthRelay({ GITHUB_OAUTH_RELAY_URL: url, GITHUB_OAUTH_RELAY_TOKEN: token })).toThrowError(
      expect.objectContaining({ code: 'GITHUB_OAUTH_RELAY_CONFIG_INVALID' }),
    );
  });
});

describe('GitHub Pages Function', () => {
  const invoke = (input, send) => handleGitHubRelay(request(input), { RELAY_TOKEN: secret }, send);

  it('probes the same GitHub POST with no code, client secret, access token or relay secret', async () => {
    const send = vi.fn(async () => response({ error: 'not_found' }, { status: 404 }));
    const res = await invoke({ operation: 'probe' }, send);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toMatchObject({ status: 404 });
    expect(send).toHaveBeenCalledOnce();
    const [url, init] = send.mock.calls[0];
    expect(url).toBe('https://github.com/login/oauth/access_token');
    expect(init).toMatchObject({ method: 'POST', body: 'client_id=light-note-connectivity-check', redirect: 'manual' });
    expect(JSON.stringify(init)).not.toContain(secret);
    expect(init.headers.Authorization).toBeUndefined();
  });

  it('forwards a long opaque code and PKCE unchanged and only returns allowlisted upstream headers', async () => {
    const send = vi.fn(async () =>
      response(
        { access_token: 'test-token' },
        {
          headers: { 'set-cookie': 'private', 'retry-after': '1', 'x-ratelimit-remaining': '0' },
        },
      ),
    );
    const res = await invoke({ operation: 'token', body: tokenBody }, send);
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][1]).toMatchObject({ method: 'POST', body: tokenBody, redirect: 'manual' });
    expect(send.mock.calls[0][1].headers.Authorization).toBeUndefined();
    expect((await res.json()).headers).toEqual({ 'retry-after': '1', 'x-ratelimit-remaining': '0' });
  });

  it.each([
    ['user', '/user'],
    ['emails', '/user/emails'],
  ])('only reads the fixed %s API using the GitHub token', async (operation, path) => {
    const send = vi.fn(async () => response({ id: 1 }));
    await invoke({ operation, accessToken: 'github-token' }, send);
    const [url, init] = send.mock.calls[0];
    expect(url).toBe(`https://api.github.com${path}`);
    expect(init).toMatchObject({
      method: 'GET',
      redirect: 'manual',
      headers: {
        Authorization: 'Bearer github-token',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    expect(JSON.stringify(init)).not.toContain(secret);
  });

  it.each([
    { operation: 'fetch', url: 'https://127.0.0.1' },
    { operation: 'user', accessToken: 'token', url: 'https://evil.test' },
    { operation: 'probe', body: 'code=private' },
    { operation: 'token', body: 'code=x' },
    { operation: 'token', body: `${tokenBody}&code=duplicate` },
    { operation: 'token', body: `${tokenBody}&url=https://evil.test` },
    { operation: 'emails', accessToken: 'bad\r\ntoken' },
    [],
    null,
  ])('rejects invalid input without an upstream call: %j', async (payload) => {
    const send = vi.fn();
    expect((await invoke(payload, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('refuses missing configuration, unauthenticated clients, wrong routes and excessive bodies', async () => {
    const send = vi.fn();
    expect((await handleGitHubRelay(request(), {}, send)).status).toBe(503);
    expect((await handleGitHubRelay(request({}, { headers: {} }), { RELAY_TOKEN: secret }, send)).status).toBe(401);
    const wrongPath = new Request('https://relay.example.com/push', request());
    expect((await handleGitHubRelay(wrongPath, { RELAY_TOKEN: secret }, send)).status).toBe(404);
    expect((await invoke({ operation: 'token', body: 'x'.repeat(17000) }, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });

  it('bounds upstream bodies and never follows redirects or retries a failed token exchange', async () => {
    const failed = vi.fn(async () => {
      throw new Error('private upstream details');
    });
    const res = await invoke({ operation: 'token', body: tokenBody }, failed);
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'UPSTREAM_UNREACHABLE' });
    expect(failed).toHaveBeenCalledOnce();
    const tooLarge = vi.fn(async () => new Response('x'.repeat(65537)));
    expect((await invoke({ operation: 'user', accessToken: 'token' }, tooLarge)).status).toBe(502);
    const redirect = vi.fn(async () => new Response('', { status: 302, headers: { location: 'https://evil.test' } }));
    expect((await (await invoke({ operation: 'token', body: tokenBody }, redirect)).json()).status).toBe(302);
    expect(redirect).toHaveBeenCalledOnce();
    expect(redirect.mock.calls[0][1].redirect).toBe('manual');
  });

  it('terminates an upstream request at its deadline without retrying a token POST', async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    vi.spyOn(AbortSignal, 'timeout').mockImplementation((ms) => {
      setTimeout(() => controller.abort(), ms);
      return controller.signal;
    });
    const send = vi.fn(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
    );
    const reading = invoke({ operation: 'token', body: tokenBody }, send);
    await vi.advanceTimersByTimeAsync(7000);
    expect((await reading).status).toBe(502);
    expect(send).toHaveBeenCalledOnce();
  });

  it('Cloudflare entrypoint does not treat execution context as fetch', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => response({ error: 'not_found' })),
    );
    try {
      expect((await worker.fetch(request(), { RELAY_TOKEN: secret }, { waitUntil: vi.fn() })).status).toBe(200);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('backend relay transport', () => {
  function transport() {
    const req = new EventEmitter();
    req.end = vi.fn();
    req.destroy = vi.fn((error) => {
      req.emit('error', error);
      return req;
    });
    const call = vi.spyOn(https, 'request').mockReturnValue(req);
    return { req, call };
  }
  function finish(call, value, status = 200) {
    const res = new EventEmitter();
    res.statusCode = status;
    call.mock.calls[0][2](res);
    res.emit('data', Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
    res.emit('end');
  }
  it('uses socket-bound DNS validation, a fresh TLS connection and separate service authorization', async () => {
    const { call, req } = transport();
    const reading = requestGitHubRelay(relay, { operation: 'user', accessToken: 'github-token' }, 50);
    finish(call, { status: 200, body: '{"id":1}', headers: {} });
    await expect(reading).resolves.toEqual({ status: 200, body: '{"id":1}', headers: {} });
    expect(call.mock.calls[0][1]).toMatchObject({
      agent: false,
      lookup: guardedPublicLookup,
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'light-note' },
    });
    expect(JSON.parse(req.end.mock.calls[0][0])).toEqual({ operation: 'user', accessToken: 'github-token' });
  });
  it.each([
    '<html>bad</html>',
    { status: 200, body: {}, headers: {} },
    { status: 200, body: 'x'.repeat(65537), headers: {} },
    { status: 0, body: '{}', headers: {} },
    { status: 200, body: '{}', headers: { 'retry-after': 'bad' } },
  ])('rejects malformed or oversized relay results', async (value) => {
    const { call } = transport();
    const reading = requestGitHubRelay(relay, { operation: 'probe' }, 50);
    finish(call, value);
    await expect(reading).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_RESPONSE_INVALID');
  });
  it('does not follow an HTTP redirect from the relay', async () => {
    const { call } = transport();
    const reading = requestGitHubRelay(relay, { operation: 'token', body: tokenBody }, 50);
    finish(call, {}, 302);
    await expect(reading).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_UNAVAILABLE');
    expect(call).toHaveBeenCalledOnce();
  });
  it('ends a stalled connection at its hard deadline', async () => {
    vi.useFakeTimers();
    const { req } = transport();
    const reading = requestGitHubRelay(relay, { operation: 'token', body: tokenBody }, 50);
    const checked = expect(reading).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_UNAVAILABLE');
    await vi.advanceTimersByTimeAsync(50);
    await checked;
    expect(req.destroy).toHaveBeenCalledOnce();
  });
});
