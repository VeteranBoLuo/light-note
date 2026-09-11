import { describe, expect, it, vi } from 'vitest';
import webpush from 'web-push';
import { browserPushRelays, deliverBrowserPush } from './browserPushTransport.js';
import { browserPushEnabled } from './browserPushPolicy.js';
import worker, { handleRelay } from '../../../scripts/browser-push-relay/worker.mjs';
const keyPair = webpush.generateVAPIDKeys();
const subscription = {
  endpoint: 'https://fcm.googleapis.com/wp/test',
  keys: { p256dh: keyPair.publicKey, auth: Buffer.alloc(16, 7).toString('base64url') },
};
const relays = [
  { url: 'https://first.example.com/push', token: 'a'.repeat(32) },
  { url: 'https://second.example.com/push', token: 'b'.repeat(32) },
];
const env = {
  LIGHTNOTE_RUNTIME_ENV: 'production',
  BROWSER_PUSH_ENABLED: 'true',
  BROWSER_PUSH_ORIGIN: 'https://light.test',
  BROWSER_PUSH_VAPID_SUBJECT: 'mailto:test@example.com',
  BROWSER_PUSH_VAPID_PUBLIC_KEY: keyPair.publicKey,
  BROWSER_PUSH_VAPID_PRIVATE_KEY: keyPair.privateKey,
  BROWSER_PUSH_RELAYS: JSON.stringify(relays),
};
const options = {
  vapidDetails: {
    subject: env.BROWSER_PUSH_VAPID_SUBJECT,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
  },
  TTL: 60,
};
const details = () =>
  webpush.generateRequestDetails(subscription, JSON.stringify({ title: 'private notification' }), options);
const request = (patch = {}, token = relays[0].token) => {
  const d = details();
  return new Request('https://relay.test/push', {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ endpoint: d.endpoint, headers: d.headers, body: d.body.toString('base64'), ...patch }),
  });
};
describe('push failover', () => {
  it('prevents local runtimes consuming production jobs even when accidentally enabled', () => {
    expect(browserPushEnabled({ ...env, LIGHTNOTE_RUNTIME_ENV: 'local' })).toBe(false);
    expect(browserPushEnabled({ ...env, LIGHTNOTE_RUNTIME_ENV: 'production' })).toBe(true);
  });
  it('falls back to second relay without forwarding VAPID private key or plaintext', async () => {
    const relay = vi.fn().mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce({ statusCode: 201 });
    const direct = vi.fn();
    await expect(
      deliverBrowserPush(subscription, { title: 'private notification' }, 60, env, { relay, direct }),
    ).resolves.toEqual({ statusCode: 201 });
    expect(relay).toHaveBeenCalledTimes(2);
    expect(direct).not.toHaveBeenCalled();
    const forwarded = JSON.stringify(relay.mock.calls[0][1]);
    expect(forwarded).not.toContain(keyPair.privateKey);
    expect(forwarded).not.toContain('private notification');
  });
  it('tries direct after both relays fail', async () => {
    const relay = vi.fn().mockRejectedValue(new Error('timeout'));
    const direct = vi.fn().mockResolvedValue({ statusCode: 201 });
    await deliverBrowserPush(subscription, {}, 60, env, { relay, direct });
    expect(relay).toHaveBeenCalledTimes(2);
    expect(direct).toHaveBeenCalledOnce();
  });
  it.each([403, 404, 410])('does not bypass permanent provider rejection %s', async (statusCode) => {
    const relay = vi.fn().mockRejectedValue({ statusCode });
    const direct = vi.fn();
    await expect(deliverBrowserPush(subscription, {}, 60, env, { relay, direct })).rejects.toMatchObject({
      statusCode,
    });
    expect(relay).toHaveBeenCalledOnce();
    expect(direct).not.toHaveBeenCalled();
  });
  it('does not continue fallback after the notification expires', async () => {
    vi.useFakeTimers();
    try {
      const relay = vi.fn(async () => {
        vi.advanceTimersByTime(2000);
        throw new Error('timeout');
      });
      const direct = vi.fn();
      await expect(deliverBrowserPush(subscription, {}, 1, env, { relay, direct })).rejects.toMatchObject({
        code: 'PUSH_EXPIRED',
      });
      expect(relay).toHaveBeenCalledOnce();
      expect(direct).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
  it('leaves Apple direct and uses direct when no relay configured', async () => {
    const relay = vi.fn();
    const direct = vi.fn().mockResolvedValue({ statusCode: 201 });
    await deliverBrowserPush({ ...subscription, endpoint: 'https://web.push.apple.com/test' }, {}, 60, env, {
      relay,
      direct,
    });
    await deliverBrowserPush(subscription, {}, 60, { ...env, BROWSER_PUSH_RELAYS: '' }, { relay, direct });
    expect(relay).not.toHaveBeenCalled();
    expect(direct).toHaveBeenCalledTimes(2);
  });
  it.each([
    'bad',
    '{}',
    JSON.stringify([...relays, ...relays]),
    JSON.stringify([{ url: 'http://relay.test/push', token: 'a'.repeat(32) }]),
    JSON.stringify([{ url: 'https://127.0.0.1/push', token: 'a'.repeat(32) }]),
  ])('rejects invalid relay configuration', (value) => {
    expect(() => browserPushRelays({ BROWSER_PUSH_RELAYS: value })).toThrow();
  });
});
describe('encrypted relay', () => {
  it('forwards only encrypted payload and safe provider headers, never follows redirects', async () => {
    const send = vi.fn().mockResolvedValue(new Response(null, { status: 201 }));
    const response = await handleRelay(request(), { RELAY_TOKEN: relays[0].token }, send);
    expect(await response.json()).toEqual({ upstreamStatus: 201 });
    const [url, init] = send.mock.calls[0];
    expect(url).toBe(subscription.endpoint);
    expect(init.redirect).toBe('manual');
    expect(init.headers.get('authorization')).toMatch(/^vapid t=/);
    expect(init.headers.get('authorization')).not.toContain(relays[0].token);
  });
  it('rejects unauthenticated requests before parsing or forwarding', async () => {
    const send = vi.fn();
    const response = await handleRelay(request({}, 'wrong'), { RELAY_TOKEN: relays[0].token }, send);
    expect(response.status).toBe(401);
    expect(send).not.toHaveBeenCalled();
  });
  it.each([
    'https://127.0.0.1/a',
    'https://fcm.googleapis.com.evil.test/a',
    'http://fcm.googleapis.com/a',
    'https://user:pass@fcm.googleapis.com/a',
  ])('rejects arbitrary destination %s', async (endpoint) => {
    const send = vi.fn();
    expect((await handleRelay(request({ endpoint }), { RELAY_TOKEN: relays[0].token }, send)).status).toBe(400);
    expect(send).not.toHaveBeenCalled();
  });
  it('caps incoming body size and returns only low sensitivity transport errors', async () => {
    expect((await handleRelay(request({ body: 'a'.repeat(20000) }), { RELAY_TOKEN: relays[0].token })).status).toBe(
      413,
    );
    const send = vi.fn().mockRejectedValue(new Error('secret endpoint details'));
    const response = await handleRelay(request(), { RELAY_TOKEN: relays[0].token }, send);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain('secret');
  });
  it('Cloudflare entrypoint does not mistake execution context for fetch', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 201 })));
    try {
      const response = await worker.fetch(request(), { RELAY_TOKEN: relays[0].token }, { waitUntil: vi.fn() });
      expect(await response.json()).toEqual({ upstreamStatus: 201 });
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
