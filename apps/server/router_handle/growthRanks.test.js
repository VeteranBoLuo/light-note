import { afterEach, describe, expect, it, vi } from 'vitest';

const database = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: database }));
vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
  L: (_req, zh) => zh,
}));
const { getRanks } = await import('./growthHandle.js');
afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('rank table billing and gift contract', () => {
  it('loads the signed-in registration cohort and returns all fifteen gifts without writes', async () => {
    vi.stubEnv('AI_DAILY_QUOTA_MODE', 'off');
    database.query.mockResolvedValue([[{ create_time: new Date('2026-10-01T00:00:00Z') }]]);
    const res = { send: vi.fn() };
    await getRanks({ user: { id: 'rank-user', role: 'user' } }, res);
    const response = res.send.mock.calls[0][0];
    expect(response.status).toBe(200);
    expect(response.data).toHaveLength(15);
    expect(response.data[0]).toMatchObject({
      billingMode: 'permanent_only',
      aiTokenDaily: 0,
      aiLevelGift: { tokens: 120000 },
    });
    expect(response.data[14].aiLevelGift.cumulativeTokens).toBe(4190000);
    expect(database.query).toHaveBeenCalledOnce();
    expect(database.query.mock.calls[0]).toEqual(['SELECT create_time FROM user WHERE id = ? LIMIT 1', ['rank-user']]);
  });
  it('keeps legacy daily figures and lets anonymous readers inspect levels without a database write', async () => {
    vi.stubEnv('AI_DAILY_QUOTA_MODE', 'level');
    const res = { send: vi.fn() };
    await getRanks({ user: { id: 'visitor', role: 'visitor' } }, res);
    expect(res.send.mock.calls[0][0].data[0]).toMatchObject({
      aiTokenDaily: 100000,
      billingMode: 'daily_and_permanent',
    });
    expect(database.query).not.toHaveBeenCalled();
  });
});
