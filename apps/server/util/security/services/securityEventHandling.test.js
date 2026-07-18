import { beforeEach, describe, expect, it, vi } from 'vitest';

const reputationMocks = vi.hoisted(() => ({
  revertIp: vi.fn(),
  rebuildIp: vi.fn(),
  revertAccount: vi.fn(),
  rebuildAccount: vi.fn(),
}));

vi.mock('./ipReputation.js', () => ({
  revertIpReputationImpact: reputationMocks.revertIp,
  rebuildIpReputationFromEvents: reputationMocks.rebuildIp,
}));

vi.mock('./accountReputation.js', () => ({
  revertAccountReputationImpact: reputationMocks.revertAccount,
  rebuildAccountReputationFromEvents: reputationMocks.rebuildAccount,
}));

import { applySecurityEventHandle } from './securityEventHandling.js';

const createEvent = (patch = {}) => ({
  event_id: 'event-1',
  source_ip: '203.0.113.10',
  user_id: 'user-1',
  attack_type: 'XSS',
  severity: 'high',
  ip_risk_delta: 6,
  user_risk_delta: 6,
  ip_risk_reverted: 0,
  user_risk_reverted: 0,
  ...patch,
});

describe('安全事件风险状态同步', () => {
  const connection = { query: vi.fn().mockResolvedValue([{}]) };

  beforeEach(() => {
    vi.clearAllMocks();
    connection.query.mockResolvedValue([{}]);
  });

  it.each(['false_positive', 'authorized_test'])('%s 会回滚 IP 与账号风险且保留事件', async (normalizedStatus) => {
    await applySecurityEventHandle({
      connection,
      event: createEvent(),
      normalizedStatus,
      remark: '授权安全测试',
      operatorId: 'root-1',
    });

    expect(connection.query).toHaveBeenNthCalledWith(1, expect.stringContaining('SET handled_status = ?'), [
      normalizedStatus,
      '授权安全测试',
      'root-1',
      'event-1',
    ]);
    expect(reputationMocks.revertIp).toHaveBeenCalledOnce();
    expect(reputationMocks.revertAccount).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET ip_risk_reverted = 1'), ['event-1']);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET user_risk_reverted = 1'), ['event-1']);
  });

  it('已经排除风险的事件改回未处理时会恢复风险画像', async () => {
    await applySecurityEventHandle({
      connection,
      event: createEvent({ ip_risk_reverted: 1, user_risk_reverted: 1 }),
      normalizedStatus: 'unhandled',
      remark: '',
      operatorId: 'root-1',
    });

    expect(reputationMocks.revertIp).not.toHaveBeenCalled();
    expect(reputationMocks.revertAccount).not.toHaveBeenCalled();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET ip_risk_reverted = 0'), ['event-1']);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET user_risk_reverted = 0'), ['event-1']);
    expect(reputationMocks.rebuildIp).toHaveBeenCalledOnce();
    expect(reputationMocks.rebuildAccount).toHaveBeenCalledOnce();
  });

  it('重复标记授权测试不会重复回滚风险', async () => {
    await applySecurityEventHandle({
      connection,
      event: createEvent({ ip_risk_reverted: 1, user_risk_reverted: 1 }),
      normalizedStatus: 'authorized_test',
      remark: '仍为测试流量',
      operatorId: 'root-1',
    });

    expect(reputationMocks.revertIp).not.toHaveBeenCalled();
    expect(reputationMocks.revertAccount).not.toHaveBeenCalled();
    expect(reputationMocks.rebuildIp).not.toHaveBeenCalled();
    expect(reputationMocks.rebuildAccount).not.toHaveBeenCalled();
  });

  it('旧事件没有记录增量时通过重建画像排除风险', async () => {
    await applySecurityEventHandle({
      connection,
      event: createEvent({ ip_risk_delta: 0, user_risk_delta: 0 }),
      normalizedStatus: 'authorized_test',
      remark: '历史授权测试',
      operatorId: 'root-1',
    });

    expect(reputationMocks.revertIp).not.toHaveBeenCalled();
    expect(reputationMocks.revertAccount).not.toHaveBeenCalled();
    expect(reputationMocks.rebuildIp).toHaveBeenCalledOnce();
    expect(reputationMocks.rebuildAccount).toHaveBeenCalledOnce();
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET ip_risk_reverted = 1'), ['event-1']);
    expect(connection.query).toHaveBeenCalledWith(expect.stringContaining('SET user_risk_reverted = 1'), ['event-1']);
  });

  it('游客事件只调整 IP 风险，不创建账号侧操作', async () => {
    await applySecurityEventHandle({
      connection,
      event: createEvent({ user_id: null }),
      normalizedStatus: 'authorized_test',
      remark: '游客授权测试',
      operatorId: 'root-1',
    });

    expect(reputationMocks.revertIp).toHaveBeenCalledOnce();
    expect(reputationMocks.revertAccount).not.toHaveBeenCalled();
    expect(reputationMocks.rebuildAccount).not.toHaveBeenCalled();
    expect(connection.query).not.toHaveBeenCalledWith(expect.stringContaining('user_risk_reverted'), expect.anything());
  });
});
