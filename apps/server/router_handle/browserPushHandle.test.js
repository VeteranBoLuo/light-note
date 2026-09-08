import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ query: vi.fn(), bind: vi.fn(), activate: vi.fn(), unbind: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: { query: mocks.query } }));
vi.mock('../util/common.js', () => ({ resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }) }));
vi.mock('../util/browserPushService.js', () => ({
  bindPushSubscription: mocks.bind,
  activatePushSubscription: mocks.activate,
  unbindPushSubscription: mocks.unbind,
}));
import { config, subscribe, activate, unsubscribe } from './browserPushHandle.js';
const req = () => ({
  user: { id: 'u1', role: 'user' },
  body: {},
  get: (key) => (key === 'origin' ? 'https://light.test' : 'same-origin'),
});
const res = () => ({ send: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('BROWSER_PUSH_ORIGIN', 'https://light.test');
  vi.stubEnv('BROWSER_PUSH_ENABLED', 'false');
});
describe('browser push API', () => {
  it.each([config, subscribe, activate, unsubscribe])('rejects visitors and administrator preview', async (handler) => {
    for (const request of [
      { ...req(), user: { id: 'guest', role: 'visitor' } },
      { ...req(), adminContext: {} },
    ]) {
      const response = res();
      await handler(request, response);
      expect(response.send.mock.calls[0][0].status).toBe(403);
    }
    expect(mocks.bind).not.toHaveBeenCalled();
  });
  it('rejects a cross-origin request regardless of authentication', async () => {
    const response = res();
    await unsubscribe({ ...req(), get: () => 'https://evil.test' }, response);
    expect(response.send.mock.calls[0][0].status).toBe(403);
    expect(mocks.unbind).not.toHaveBeenCalled();
  });
  it('disabled service does not create subscriptions', async () => {
    const response = res();
    await subscribe(req(), response);
    expect(response.send.mock.calls[0][0].status).toBe(503);
    expect(mocks.bind).not.toHaveBeenCalled();
  });
  it('unbind uses the authenticated owner even if a body userId is supplied', async () => {
    const response = res();
    await unsubscribe({ ...req(), body: { userId: 'someone-else', id: 's1', generation: 'g1' } }, response);
    expect(mocks.unbind).toHaveBeenCalledWith('u1', 's1', 'g1');
  });
  it('returns unavailable config without exposing private keys', async () => {
    mocks.query.mockResolvedValueOnce([[]]);
    const response = res();
    await config(req(), response);
    expect(response.send.mock.calls[0][0].data).toMatchObject({ available: false, enabled: false, userId: 'u1' });
    expect(response.send.mock.calls[0][0].data).not.toHaveProperty('privateKey');
  });
});
