import { expect, it, vi } from 'vitest';
import { deriveHuaweiReceiptCheck, loadHuaweiReceiptCheck } from './huaweiPushHealth.js';
import { loadInfraDiagnostics } from './infraDiagnostics.js';
import { deriveAlertSignals, evaluateInfraAlerts } from './infraAlerts.js';

vi.mock('./hostAgentClient.js', () => ({
  getHostAgentDashboard: async () => {
    throw new Error('offline');
  },
  getHostAgentServices: async () => {
    throw new Error('offline');
  },
  getHostAgentStorage: async () => {
    throw new Error('offline');
  },
  getHostAgentSecurity: async () => {
    throw new Error('offline');
  },
}));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));
const env = {
  LIGHTNOTE_RUNTIME_ENV: 'production',
  HUAWEI_PUSH_ENABLED: 'true',
  HUAWEI_PUSH_APP_ID: '123',
  HUAWEI_PUSH_PROJECT_ID: '456',
  HUAWEI_PUSH_APP_SECRET: 'fixture',
  HUAWEI_PUSH_ORIGIN: 'https://fixture.invalid',
  HUAWEI_PUSH_RECEIPTS_ENABLED: 'true',
  HUAWEI_PUSH_RECEIPT_USERNAME: 'fixture',
  HUAWEI_PUSH_RECEIPT_SECRET: Buffer.alloc(32, 1).toString('base64'),
};
it('keeps disabled channels silent, insufficient samples unknown, and callback health separate from delivery', async () => {
  const db = { query: vi.fn() };
  expect(await loadHuaweiReceiptCheck({ db, env: {} })).toBeNull();
  expect(db.query).not.toHaveBeenCalled();
  expect(deriveHuaweiReceiptCheck({ accepted: 4, receipts: 0 }).state).toBe('unknown');
  expect(deriveHuaweiReceiptCheck({ accepted: 5, receipts: 0 }).state).toBe('fail');
  expect(deriveHuaweiReceiptCheck({ accepted: '5', receipts: '1' }).state).toBe('pass');
  expect(deriveHuaweiReceiptCheck(null).state).toBe('unknown');
  expect(deriveHuaweiReceiptCheck({ accepted: 5, receipts: 6 }).state).toBe('unknown');
});
it('reports missing authentication configuration and leaves database errors unknown', async () => {
  const db = { query: vi.fn().mockRejectedValue(new Error('unavailable')) };
  expect(await loadHuaweiReceiptCheck({ db, env: { ...env, HUAWEI_PUSH_RECEIPT_SECRET: '' } })).toMatchObject({
    state: 'fail',
    evidence: { configured: false },
  });
  expect(db.query).not.toHaveBeenCalled();
  expect(await loadHuaweiReceiptCheck({ db, env })).toMatchObject({ state: 'unknown' });
});
it('alerts after three failed cycles, preserves Host Agent offline detection, and recovers after verified callbacks', async () => {
  const pushCheck = deriveHuaweiReceiptCheck({ accepted: 5, receipts: 0 });
  const diagnostics = await loadInfraDiagnostics({ loadPushCheck: async () => pushCheck });
  expect(diagnostics.sources).toHaveLength(4);
  expect(diagnostics.summary.failed).toBeGreaterThanOrEqual(1);
  const signals = deriveAlertSignals(diagnostics);
  expect(signals.signals.get('agent.offline').state).toBe('fail');
  expect(signals.signals.get(pushCheck.id)).toMatchObject({ state: 'fail', channel: 'urgent' });
  let rows = [];
  let result;
  for (let i = 0; i < 3; i++) {
    result = evaluateInfraAlerts(rows, signals, new Date(1000 * i));
    rows = result.changed;
    expect(result.opened.some((row) => row.alertKey === pushCheck.id)).toBe(i === 2);
  }
  expect(evaluateInfraAlerts(rows, signals, new Date(3000)).opened).toEqual([]);
  const recovered = deriveAlertSignals({
    ...diagnostics,
    checks: [deriveHuaweiReceiptCheck({ accepted: 5, receipts: 1 })],
  });
  for (let i = 0; i < 3; i++) {
    result = evaluateInfraAlerts(rows, recovered, new Date(4000 + i));
    rows = result.changed;
    expect(result.resolved.some((row) => row.alertKey === pushCheck.id)).toBe(i === 2);
  }
});
