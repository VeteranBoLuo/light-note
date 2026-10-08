import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../util/common.js', () => ({ resultData: (data, status = 200, msg = '') => ({ data, status, msg }) }));
vi.mock('../util/browserPushService.js', () => ({
  bindHuaweiSubscription: vi.fn(),
  activatePushSubscription: vi.fn(),
  unbindPushSubscription: vi.fn(),
}));
import { subscribe, activate, unsubscribe } from './huaweiPushHandle.js';
import {
  bindHuaweiSubscription,
  activatePushSubscription,
  unbindPushSubscription,
} from '../util/browserPushService.js';
const token = 'a'.repeat(100);
const req = () => ({
  user: { id: 'alice', role: 'user' },
  body: { userId: 'bob', deviceToken: token, id: 'd', generation: 'g' },
  get: (name) => (name === 'origin' ? 'https://test.invalid' : 'same-origin'),
});
const res = () => ({ send: vi.fn() });
beforeEach(() => {
  vi.clearAllMocks();
  for (const [key, value] of Object.entries({
    LIGHTNOTE_RUNTIME_ENV: 'production',
    HUAWEI_PUSH_ENABLED: 'true',
    HUAWEI_PUSH_APP_ID: '1',
    HUAWEI_PUSH_PROJECT_ID: '2',
    HUAWEI_PUSH_APP_SECRET: 'test',
    HUAWEI_PUSH_ORIGIN: 'https://test.invalid',
  }))
    vi.stubEnv(key, value);
});
afterEach(() => vi.unstubAllEnvs());
it('binds and mutates only the authenticated owner', async () => {
  bindHuaweiSubscription.mockResolvedValue({ id: 'd', generation: 'g', userId: 'alice' });
  activatePushSubscription.mockResolvedValue(true);
  const response = res();
  await subscribe(req(), response);
  await activate(req(), response);
  await unsubscribe(req(), response);
  expect(bindHuaweiSubscription).toHaveBeenCalledWith('alice', token);
  expect(activatePushSubscription).toHaveBeenCalledWith('alice', 'd', 'g');
  expect(unbindPushSubscription).toHaveBeenCalledWith('alice', 'd', 'g');
});
it.each(['visitor', 'admin', 'cross-origin'])('rejects %s requests', async (kind) => {
  const request = req();
  if (kind === 'visitor') request.user.role = 'visitor';
  if (kind === 'admin') request.adminContext = {};
  if (kind === 'cross-origin') request.get = () => 'https://evil.invalid';
  const response = res();
  await subscribe(request, response);
  expect(response.send).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(bindHuaweiSubscription).not.toHaveBeenCalled();
});
it('reports invalid tokens without disclosing provider or token content', async () => {
  bindHuaweiSubscription.mockRejectedValue(Object.assign(new Error(token), { code: 'PUSH_SUBSCRIPTION_INVALID' }));
  const response = res();
  await subscribe(req(), response);
  expect(response.send).toHaveBeenCalledWith({ data: null, status: 410, msg: 'HUAWEI_PUSH_BIND_FAILED' });
});
