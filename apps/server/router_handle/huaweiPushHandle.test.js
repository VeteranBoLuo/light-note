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
  expect(bindHuaweiSubscription).toHaveBeenCalledWith('alice', token, null);
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
  expect(response.send).toHaveBeenCalledWith({ data: null, status: 410, msg: 'HUAWEI_PUSH_TOKEN_INVALID' });
});
it.each([
  ['PUSH_DEVICE_LIMIT', 409, 'HUAWEI_PUSH_DEVICE_LIMIT'],
  ['PUSH_BINDING_EXPIRED', 409, 'HUAWEI_PUSH_BINDING_EXPIRED'],
  ['INVALID_PUSH_BINDING', 400, 'HUAWEI_PUSH_BINDING_INVALID'],
  ['PUSH_ACCOUNT_UNAVAILABLE', 403, 'HUAWEI_PUSH_ACCOUNT_REQUIRED'],
  ['INVALID_HUAWEI_INSTALLATION', 400, 'HUAWEI_PUSH_INSTALLATION_INVALID'],
  ['HUAWEI_PUSH_APPLICATION_MISMATCH', 409, 'HUAWEI_PUSH_APPLICATION_MISMATCH'],
  ['HUAWEI_PUSH_CLIENT_UPGRADE_REQUIRED', 409, 'HUAWEI_PUSH_CLIENT_UPGRADE_REQUIRED'],
  ['HUAWEI_PUSH_INSTALLATION_UNAVAILABLE', 503, 'HUAWEI_PUSH_INSTALLATION_UNAVAILABLE'],
  ['PUSH_INSTALLATION_RETIRED', 409, 'HUAWEI_PUSH_INSTALLATION_RETIRED'],
  ['PUSH_INSTALLATION_SUPERSEDED', 409, 'HUAWEI_PUSH_INSTALLATION_SUPERSEDED'],
  ['UNKNOWN_DATABASE_FAILURE', 500, 'HUAWEI_PUSH_BIND_FAILED'],
])('reports %s with a stable, non-sensitive result', async (code, status, msg) => {
  bindHuaweiSubscription.mockRejectedValue(Object.assign(new Error(token), { code }));
  const response = res();
  await subscribe(req(), response);
  expect(response.send).toHaveBeenCalledWith({ data: null, status, msg });
});
it('passes the replacement receipt while keeping the authenticated account authoritative', async () => {
  const request = req();
  request.body.previousBinding = { id: 'old', generation: 'g', userId: 'bob' };
  await subscribe(request, res());
  expect(bindHuaweiSubscription).toHaveBeenCalledWith('alice', token, request.body.previousBinding);
});
it('routes protocol two through server-owned installation handling and rejects incomplete protocol negotiation', async () => {
  const request = req();
  request.body.protocolVersion = 2;
  request.body.installation = { id: 'native-installation' };
  await subscribe(request, res());
  expect(bindHuaweiSubscription).toHaveBeenCalledWith(
    'alice',
    token,
    null,
    expect.anything(),
    request.body.installation,
  );
  vi.clearAllMocks();
  delete request.body.installation;
  const response = res();
  await subscribe(request, response);
  expect(response.send).toHaveBeenCalledWith({ data: null, status: 400, msg: 'HUAWEI_PUSH_INSTALLATION_INVALID' });
  expect(bindHuaweiSubscription).not.toHaveBeenCalled();
});
it('returns a scoped handshake without exposing device tokens', async () => {
  bindHuaweiSubscription.mockRejectedValueOnce(
    Object.assign(new Error(token), { code: 'PUSH_INSTALLATION_CHALLENGE_REQUIRED', currentInstallationId: null }),
  );
  const response = res();
  await subscribe(req(), response);
  expect(response.send).toHaveBeenCalledWith({
    data: { currentInstallationId: null },
    status: 409,
    msg: 'HUAWEI_PUSH_INSTALLATION_CHALLENGE_REQUIRED',
  });
});
