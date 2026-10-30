import { describe, expect, it } from 'vitest';
import {
  applyDiagnosticSilences,
  applyFindingSilences,
  evaluateSilenceLifecycle,
  isSilenceableCheckId,
} from './infraAlertSilences.js';

const now = new Date('2026-10-30T05:00:00Z');
const silence = (checkId, overrides = {}) => ({
  checkId,
  reason: '已关闭密码登录，下周统一安装 Fail2ban',
  silencedUntil: new Date('2026-11-06T05:00:00Z'),
  passStreak: 0,
  createdBy: 'root-1',
  createdAt: new Date('2026-10-30T04:00:00Z'),
  actorAlias: '菠萝',
  ...overrides,
});
const check = (id, state, domain = 'security') => ({ id, domain, state, severity: 'medium', evidence: {}, target: {} });
const diagnostics = (checks) => ({ capturedAt: null, status: 'healthy', summary: {}, checks, sources: [] });

describe('风险静默', () => {
  it('只允许静默资源与安全检查，服务故障、备份中断、采集异常和安全快照不可静默', () => {
    expect(isSilenceableCheckId('security.fail2ban')).toBe(true);
    expect(isSilenceableCheckId('storage.capacity')).toBe(true);
    for (const id of [
      'services.health',
      'agent.offline',
      'collection.storage',
      'security.snapshot',
      'service.mysql',
      'security.database-backup',
    ]) {
      expect(isSilenceableCheckId(id)).toBe(false);
    }
  });

  it('静默项不计入异常与整体状态，单独计数并带回原因与操作者', () => {
    const result = applyDiagnosticSilences(
      diagnostics([
        check('security.fail2ban', 'fail'),
        check('security.ssh-root-login', 'warning'),
        check('services.health', 'pass', 'services'),
      ]),
      [silence('security.fail2ban'), silence('security.ssh-root-login')],
      now,
    );
    expect(result.summary).toEqual({ failed: 0, warning: 0, passed: 1, unknown: 0, silenced: 2 });
    expect(result.status).toBe('healthy');
    expect(result.checks[0]).toMatchObject({
      silenceable: true,
      silence: {
        reason: '已关闭密码登录，下周统一安装 Fail2ban',
        until: '2026-11-06T05:00:00.000Z',
        actorUserId: 'root-1',
        actorAlias: '菠萝',
      },
    });
    expect(result.checks[2]).toMatchObject({ silenceable: false, silence: null });
  });

  it('已到期、已恢复或状态未知的静默不再遮住检查项', () => {
    const result = applyDiagnosticSilences(
      diagnostics([
        check('security.fail2ban', 'fail'),
        check('system.cpu', 'pass'),
        check('storage.capacity', 'unknown'),
      ]),
      [
        silence('security.fail2ban', { silencedUntil: new Date('2026-10-30T05:00:00Z') }),
        silence('system.cpu'),
        silence('storage.capacity'),
      ],
      now,
    );
    expect(result.checks.every((item) => item.silence === null)).toBe(true);
    expect(result.summary).toMatchObject({ failed: 1, passed: 1, unknown: 1, silenced: 0 });
    expect(result.status).toBe('critical');
  });

  it('安全检查页按同一检查项标记静默', () => {
    const findings = applyFindingSilences(
      [check('fail2ban', 'fail'), check('firewall', 'pass')],
      [silence('security.fail2ban'), silence('security.firewall')],
      now,
    );
    expect(findings[0].silence).toMatchObject({ reason: expect.any(String) });
    expect(findings[1].silence).toBeNull();
  });

  it('连续恢复达到阈值才自动解除，中途再异常会清零计数', () => {
    const policy = { resolveAfter: 3 };
    let rows = [silence('security.fail2ban')];
    const run = (state) =>
      evaluateSilenceLifecycle(rows, diagnostics([check('security.fail2ban', state)]), now, policy);

    let result = run('pass');
    expect(result.suppressed.has('security.fail2ban')).toBe(true);
    expect(result.streakUpdates).toEqual([{ silence: rows[0], passStreak: 1 }]);
    rows = [silence('security.fail2ban', { passStreak: 2 })];
    result = run('fail');
    expect(result.streakUpdates).toEqual([{ silence: rows[0], passStreak: 0 }]);
    result = run('pass');
    expect(result.removals).toEqual([{ silence: rows[0], remind: false }]);
    // 恢复当轮仍在静默期内，恢复通知同样不投递。
    expect(result.suppressed.has('security.fail2ban')).toBe(true);
  });

  it('到期仍异常时解除并提醒一次；到期时状态未知先保留等待判断', () => {
    const expired = silence('security.fail2ban', { silencedUntil: new Date('2026-10-30T04:59:00Z') });
    const policy = { resolveAfter: 3 };
    const failing = evaluateSilenceLifecycle(
      [expired],
      diagnostics([check('security.fail2ban', 'warning')]),
      now,
      policy,
    );
    expect(failing.removals).toEqual([{ silence: expired, remind: true, state: 'warning' }]);
    expect(failing.suppressed.size).toBe(0);

    const unknown = evaluateSilenceLifecycle([expired], diagnostics([]), now, policy);
    expect(unknown).toMatchObject({ removals: [], streakUpdates: [] });
    expect(unknown.suppressed.size).toBe(0);

    const recovered = evaluateSilenceLifecycle(
      [expired],
      diagnostics([check('security.fail2ban', 'pass')]),
      now,
      policy,
    );
    expect(recovered.removals).toEqual([{ silence: expired, remind: false }]);
  });
});
