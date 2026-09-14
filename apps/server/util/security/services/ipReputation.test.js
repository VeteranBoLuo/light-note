import { describe, expect, it, vi } from 'vitest';
vi.mock('../../../db/index.js', () => ({ default: {} }));
import { rebuildIpReputationFromEvents } from './ipReputation.js';

const ip = '203.0.113.10';
function database(events, current = {}) {
  return {
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT * FROM security_ip_reputation')) return [[{ ip, ...current }]];
      if (sql.includes('FROM security_events')) return [events];
      return [{ affectedRows: 1 }];
    }),
  };
}
const insertValues = (connection) =>
  connection.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO security_ip_reputation'))[1];
const flood = (delta = 0) => ({ attack_type: 'FLOOD', severity: 'high', threat_score: 35, ip_risk_delta: delta });

describe('复核后 IP 风险画像重算', () => {
  it.each([0, 4])('高频流量不因零增量回退或历史增量 %s 累积 IP 风险', async (delta) => {
    const connection = database([flood(delta), flood(delta)]);
    await rebuildIpReputationFromEvents({ ip, connection });
    const values = insertValues(connection);
    expect(values[2]).toBe(2);
    expect(values[5]).toBe(0);
  });

  it('排除高频风险时仍保留真实攻击的风险增量', async () => {
    const connection = database([
      flood(),
      { attack_type: 'SQL_INJECTION', severity: 'high', threat_score: 55, ip_risk_delta: 6 },
      flood(4),
      { attack_type: 'SCANNER', severity: 'medium', threat_score: 32, ip_risk_delta: 0 },
    ]);
    await rebuildIpReputationFromEvents({ ip, connection });
    expect(insertValues(connection)[5]).toBe(10);
  });

  it('风险回落后解除由高频误算造成的自动封禁', async () => {
    const connection = database([flood()], {
      is_banned: 1,
      ban_reason: 'IP风险分 80 达到自动封禁阈值 80',
      banned_until: new Date(),
    });
    await rebuildIpReputationFromEvents({ ip, connection });
    expect(insertValues(connection).slice(5, 10)).toEqual([0, JSON.stringify({ FLOOD: 1 }), 0, null, '']);
  });

  it('风险重算保留管理员手动封禁', async () => {
    const connection = database([flood()], { is_banned: 1, ban_reason: '管理员核实后封禁' });
    await rebuildIpReputationFromEvents({ ip, connection });
    expect(insertValues(connection)[7]).toBe(1);
    expect(insertValues(connection)[9]).toBe('管理员核实后封禁');
  });
});
