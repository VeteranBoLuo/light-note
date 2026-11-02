import { expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  validateHuaweiInstallation,
  huaweiInstallationsEnabled,
  bindLegacyHuaweiInstallation,
} from './huaweiPushInstallations.js';

const env = { HUAWEI_PUSH_APP_ID: '123', HUAWEI_PUSH_PACKAGE_NAME: 'app.test' };
const good = () => ({
  id: randomUUID(),
  key: 'a'.repeat(64),
  revision: 1,
  identityKind: 'scoped',
  packageName: 'app.test',
  pushAppId: '123',
  deviceLabel: 'Phone',
});
it('requires explicitly enabled installation support and validates the complete account-scoped metadata', () => {
  expect(huaweiInstallationsEnabled({})).toBe(false);
  expect(huaweiInstallationsEnabled({ HUAWEI_PUSH_INSTALLATION_V2_ENABLED: 'true' })).toBe(true);
  const value = good();
  expect(validateHuaweiInstallation(value, env)).toBe(value);
});
it.each([
  { id: 'bad' },
  { key: 'x'.repeat(64) },
  { revision: 0 },
  { revision: 1.2 },
  { revision: Number.MAX_SAFE_INTEGER + 1 },
  { identityKind: 'imei' },
  { deviceLabel: 'line\nfeed' },
  { deviceLabel: 'x'.repeat(97) },
  { packageName: [] },
  { expectedCurrentId: 'invalid' },
])('rejects malformed installation metadata %j', (bad) => {
  expect(() => validateHuaweiInstallation({ ...good(), ...bad }, env)).toThrow('INVALID_HUAWEI_INSTALLATION');
});
it.each([{ pushAppId: '456' }, { packageName: 'app.other' }])(
  'does not mix provider applications or packages %j',
  (bad) => {
    expect(() => validateHuaweiInstallation({ ...good(), ...bad }, env)).toThrow('HUAWEI_PUSH_APPLICATION_MISMATCH');
  },
);
it('does not let a dormant legacy client reactivate retired bindings', async () => {
  const db = { query: async () => [[{ id: 'old', generation: 'g', active: 0, retired_reason: 'reinstalled' }]] };
  await expect(bindLegacyHuaweiInstallation('alice', 'a'.repeat(100), db)).rejects.toMatchObject({
    code: 'HUAWEI_PUSH_CLIENT_UPGRADE_REQUIRED',
  });
});
