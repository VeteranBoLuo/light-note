import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiGiftNetworkBatches, aiGiftRiskPolicy, assessAiLevelGiftRisk } from './aiLevelGiftRisk.js';

afterEach(() => vi.unstubAllEnvs());
describe('AI gift risk policy', () => {
  it('uses safe defaults and requires distinct accounts in the same network', () => {
    expect(aiGiftRiskPolicy({ AI_GIFT_NETWORK_REGISTRATION_LIMIT: '-2' })).toEqual({
      networkRegistrations: 3,
      globalRegistrations: 20,
      newAccountTokens: 500000,
    });
    const rows = [
      { user_id: 'a', ip: '198.51.100.1' },
      { user_id: 'a', ip: '198.51.100.2' },
      { user_id: 'b', ip: '198.51.100.9' },
      { user_id: 'c', ip: '198.51.101.1' },
    ];
    expect(aiGiftNetworkBatches(rows)).toEqual([]);
    expect(aiGiftNetworkBatches([...rows, { user_id: 'c', ip: '::ffff:198.51.100.3' }])).toEqual([['a', 'b', 'c']]);
  });
  it('normalizes IPv6 /64 without grouping missing or invalid IPs', () => {
    expect(
      aiGiftNetworkBatches([
        { user_id: 'a', ip: '2001:db8:abcd:1::1' },
        { user_id: 'b', ip: '2001:db8:abcd:0001:0:0:0:2' },
        { user_id: 'c', ip: '2001:db8:abcd:1::3' },
        { user_id: 'd', ip: '2001:db8:abcd:2::1' },
        { user_id: 'e', ip: 'unknown' },
        { user_id: 'f', ip: '' },
        { user_id: 'g', ip: 'not-an-ip' },
      ]),
    ).toEqual([['a', 'b', 'c']]);
  });
  it('only prunes expired facts when gifts are disabled, without assessment, holds or notifications', async () => {
    vi.stubEnv('AI_LEVEL_GIFT_MODE', 'off');
    const database = { getConnection: vi.fn(), query: vi.fn().mockResolvedValue([{ affectedRows: 0 }]) };
    expect(await assessAiLevelGiftRisk({ database })).toEqual({ disabled: true });
    expect(database.getConnection).not.toHaveBeenCalled();
    expect(database.query).toHaveBeenCalledTimes(2);
    expect(database.query.mock.calls.every(([sql]) => sql.startsWith('DELETE FROM ai_level_gift_'))).toBe(true);
  });
});
