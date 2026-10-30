import { afterEach, describe, expect, it, vi } from 'vitest';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { connectGitHubRelayTls, githubOAuthRelay, requestGitHubRelay } from './githubOAuthRelay.js';
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

describe('relay TLS selection', () => {
  const url = new URL(relay.url);
  const addresses = [
    { address: '192.0.2.1', family: 4 },
    { address: '192.0.2.2', family: 4 },
    { address: '2001:db8::1', family: 6 },
  ];
  function connections() {
    const sockets = [];
    const connectTls = vi.fn(() => {
      const socket = new EventEmitter();
      socket.destroy = vi.fn();
      sockets.push(socket);
      return socket;
    });
    return { sockets, connectTls };
  }
  it('validates every DNS address first, preserves the relay TLS identity, and closes losing connections', async () => {
    const { sockets, connectTls } = connections();
    const resolveIps = vi.fn(async () => addresses);
    const connecting = connectGitHubRelayTls(url, { resolveIps, connectTls });
    await Promise.resolve();
    expect(resolveIps).toHaveBeenCalledExactlyOnceWith('relay.example.com');
    expect(connectTls).toHaveBeenCalledTimes(3);
    expect(connectTls.mock.calls[1][0]).toEqual({
      host: '192.0.2.2',
      port: 443,
      family: 4,
      servername: 'relay.example.com',
      rejectUnauthorized: true,
    });
    sockets[1].emit('secureConnect');
    await expect(connecting).resolves.toBe(sockets[1]);
    expect(sockets[0].destroy).toHaveBeenCalledOnce();
    expect(sockets[2].destroy).toHaveBeenCalledOnce();
    expect(sockets[1].destroy).not.toHaveBeenCalled();
  });
  it('sends no HTTP request when DNS validation rejects a private answer', async () => {
    const { connectTls } = connections();
    const request = vi.spyOn(https, 'request');
    const resolveIps = vi.fn(async () => {
      throw new Error('BLOCKED_PRIVATE_IP');
    });
    await expect(connectGitHubRelayTls(url, { resolveIps, connectTls })).rejects.toThrow('BLOCKED_PRIVATE_IP');
    expect(connectTls).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });
  it('a failed IPv6 connection does not abort a viable IPv4 handshake', async () => {
    const { sockets, connectTls } = connections();
    const connecting = connectGitHubRelayTls(url, { resolveIps: async () => addresses, connectTls });
    await Promise.resolve();
    sockets[2].emit('error', Object.assign(new Error('unreachable'), { code: 'ENETUNREACH' }));
    sockets[0].emit('secureConnect');
    await expect(connecting).resolves.toBe(sockets[0]);
  });
  it('rejects after all handshakes fail and closes every candidate', async () => {
    const { sockets, connectTls } = connections();
    const connecting = connectGitHubRelayTls(url, { resolveIps: async () => addresses, connectTls });
    await Promise.resolve();
    for (const socket of sockets) socket.emit('error', new Error('bad certificate'));
    await expect(connecting).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_UNAVAILABLE');
    for (const socket of sockets) expect(socket.destroy).toHaveBeenCalled();
  });
  it('the caller deadline closes stalled TLS handshakes without an HTTP request', async () => {
    const { sockets, connectTls } = connections();
    const controller = new AbortController();
    const connecting = connectGitHubRelayTls(url, {
      resolveIps: async () => addresses,
      connectTls,
      signal: controller.signal,
    });
    await Promise.resolve();
    controller.abort();
    await expect(connecting).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_TIMEOUT');
    for (const socket of sockets) expect(socket.destroy).toHaveBeenCalled();
  });
});

describe('backend relay transport', () => {
  const relayTransport = { connect: connectGitHubRelayTls };
  const readRelay = (payload, timeoutMs = 1000) =>
    requestGitHubRelay(relay, payload, timeoutMs, {
      connect: relayTransport.connect,
    });
  function transport() {
    const socket = { destroy: vi.fn() };
    const connect = vi.fn(async () => socket);
    vi.spyOn(relayTransport, 'connect').mockImplementation(connect);
    const req = new EventEmitter();
    req.end = vi.fn();
    req.destroy = vi.fn((error) => {
      req.emit('error', error);
      return req;
    });
    const call = vi.spyOn(https, 'request').mockReturnValue(req);
    return { req, call, socket };
  }
  async function finish(call, value, status = 200) {
    // Wait until the injected TLS handshake has completed, before delivering the HTTP response.
    await vi.waitFor(() => expect(call).toHaveBeenCalledOnce());
    const res = new EventEmitter();
    res.statusCode = status;
    call.mock.calls[0][2](res);
    res.emit('data', Buffer.from(typeof value === 'string' ? value : JSON.stringify(value)));
    res.emit('end');
  }
  it('sends one authenticated HTTP request on a fresh selected TLS connection', async () => {
    const { call, req, socket } = transport();
    const reading = readRelay({ operation: 'user', accessToken: 'github-token' });
    await finish(call, { status: 200, body: '{"id":1}', headers: {} });
    await expect(reading).resolves.toEqual({ status: 200, body: '{"id":1}', headers: {} });
    expect(call.mock.calls[0][1]).toMatchObject({
      method: 'POST',
      headers: { authorization: `Bearer ${secret}`, 'user-agent': 'light-note' },
    });
    expect(call.mock.calls[0][1].agent.keepAlive).toBe(false);
    expect(call.mock.calls[0][1].agent.createConnection()).toBe(socket);
    expect(socket.destroy).toHaveBeenCalled();
    expect(req.end).toHaveBeenCalledOnce();
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
    const reading = readRelay({ operation: 'probe' });
    const checked = expect(reading).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_RESPONSE_INVALID');
    await finish(call, value);
    await checked;
  });
  it('does not follow an HTTP redirect from the relay', async () => {
    const { call } = transport();
    const reading = readRelay({ operation: 'token', body: tokenBody });
    const checked = expect(reading).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_UNAVAILABLE');
    await finish(call, {}, 302);
    await checked;
    expect(call).toHaveBeenCalledOnce();
  });
  it('ends a stalled connection at its hard deadline', async () => {
    vi.useFakeTimers();
    const { req } = transport();
    const reading = readRelay({ operation: 'token', body: tokenBody }, 50);
    const checked = expect(reading).rejects.toHaveProperty('code', 'GITHUB_OAUTH_RELAY_TIMEOUT');
    await vi.advanceTimersByTimeAsync(50);
    await checked;
    expect(req.destroy).toHaveBeenCalledOnce();
  });
  it('the hard deadline also covers DNS and TLS selection before an HTTP request exists', async () => {
    vi.useFakeTimers();
    const call = vi.spyOn(https, 'request');
    const connect = vi.fn(() => new Promise(() => {}));
    const reading = requestGitHubRelay(relay, { operation: 'probe' }, 50, { connect });
    const checked = expect(reading).rejects.toMatchObject({
      code: 'GITHUB_OAUTH_RELAY_TIMEOUT',
      transportPhase: 'CONNECT',
    });
    await vi.advanceTimersByTimeAsync(50);
    await checked;
    expect(call).not.toHaveBeenCalled();
  });
});
