import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));

const { deriveAlertSignals, evaluateInfraAlerts, readDeployWindow, runInfraAlertCycle } =
  await import('./infraAlerts.js');

const available = (domain) => ({ domain, state: 'available' });
const diagnostics = (checks, sources = ['overview', 'services', 'storage', 'security'].map(available)) => ({
  checks,
  sources,
});
const check = (id, state, evidence = {}, domain = id.split('.')[0]) => ({ id, domain, state, evidence });

function step(rows, input, minute) {
  const result = evaluateInfraAlerts(rows, deriveAlertSignals(input), new Date(Date.UTC(2026, 9, 30, 4, minute)));
  const next = new Map(rows.map((row) => [row.alertKey, row]));
  for (const row of result.changed) next.set(row.alertKey, row);
  return { rows: [...next.values()], ...result };
}

describe('服务器告警信号', () => {
  it('服务按 ID 拆分、安全项只发站内通知、预警与采集错误不告警', () => {
    const { signals, servicesKnown } = deriveAlertSignals(
      diagnostics([
        check('services.health', 'fail', { unhealthy: ['mysql', 'lightnote-document-worker'] }, 'services'),
        check('storage.capacity', 'warning', { percent: 85 }),
        check('security.fail2ban', 'fail', { value: 'not-installed' }),
        check('collection.storage', 'unknown', { count: 1 }, 'storage'),
      ]),
    );
    expect(servicesKnown).toBe(true);
    expect(signals.get('service.mysql')).toMatchObject({ state: 'fail', title: 'MySQL 未运行', channel: 'urgent' });
    expect(signals.get('service.lightnote-document-worker')).toMatchObject({ title: '文档处理 Worker 未运行' });
    expect(signals.get('storage.capacity')).toMatchObject({ state: 'pass' });
    expect(signals.get('security.fail2ban')).toMatchObject({ state: 'fail', channel: 'notice' });
    expect(signals.has('collection.storage')).toBe(false);
    expect(signals.get('agent.offline')).toMatchObject({ state: 'pass' });
  });

  it('Agent 四个域都不可用时单独告警 Agent 离线', () => {
    const { signals, servicesKnown } = deriveAlertSignals(
      diagnostics(
        [check('services.health', 'unknown', {}, 'services')],
        ['overview', 'services', 'storage', 'security'].map((domain) => ({ domain, state: 'unavailable' })),
      ),
    );
    expect(signals.get('agent.offline')).toMatchObject({ state: 'fail', channel: 'urgent' });
    expect(servicesKnown).toBe(false);
  });
});

describe('服务器告警状态机', () => {
  const mysqlDown = diagnostics([check('services.health', 'fail', { unhealthy: ['mysql'] }, 'services')]);
  const allRunning = diagnostics([check('services.health', 'pass', { unhealthy: [] }, 'services')]);
  const servicesUnknown = diagnostics([check('services.health', 'unknown', {}, 'services')]);

  it('连续 3 分钟异常才开启告警，部署重启这类短暂异常不会通知', () => {
    let state = { rows: [] };
    state = step(state.rows, mysqlDown, 0);
    state = step(state.rows, mysqlDown, 1);
    expect(state.opened).toHaveLength(0);
    expect(state.rows.find((row) => row.alertKey === 'service.mysql')).toMatchObject({ state: 'pending' });
    state = step(state.rows, allRunning, 2);
    expect(state.rows.find((row) => row.alertKey === 'service.mysql')).toMatchObject({ state: 'clear' });
    expect(state.opened).toHaveLength(0);
    expect(state.resolved).toHaveLength(0);
  });

  it('开启后持续异常不重复通知，连续 3 分钟正常才发恢复', () => {
    let state = { rows: [] };
    for (const minute of [0, 1]) state = step(state.rows, mysqlDown, minute);
    state = step(state.rows, mysqlDown, 2);
    expect(state.opened.map((row) => row.alertKey)).toEqual(['service.mysql']);
    state = step(state.rows, mysqlDown, 3);
    expect(state.opened).toHaveLength(0);
    expect(state.changed).toHaveLength(0);
    // 未知状态既不计入恢复也不计入异常。
    state = step(state.rows, servicesUnknown, 4);
    expect(state.changed).toHaveLength(0);
    state = step(state.rows, allRunning, 5);
    state = step(state.rows, allRunning, 6);
    expect(state.resolved).toHaveLength(0);
    state = step(state.rows, allRunning, 7);
    expect(state.resolved.map((row) => row.alertKey)).toEqual(['service.mysql']);
    expect(state.rows.find((row) => row.alertKey === 'service.mysql')).toMatchObject({ state: 'clear' });
  });

  it('恢复途中再次异常会清零恢复计数，不提前宣布恢复', () => {
    let state = { rows: [] };
    for (const minute of [0, 1, 2]) state = step(state.rows, mysqlDown, minute);
    state = step(state.rows, allRunning, 3);
    state = step(state.rows, allRunning, 4);
    state = step(state.rows, mysqlDown, 5);
    expect(state.rows.find((row) => row.alertKey === 'service.mysql')).toMatchObject({ state: 'open', passStreak: 0 });
    state = step(state.rows, allRunning, 6);
    state = step(state.rows, allRunning, 7);
    expect(state.resolved).toHaveLength(0);
  });
});

describe('数据库备份告警', () => {
  it('备份中断虽属安全检查也走邮件通道，详情按整小时变化', () => {
    const backup = (ageHours, extra = {}) =>
      deriveAlertSignals(
        diagnostics([check('security.database-backup', 'fail', { ageHours, lastRunOk: false, ...extra })]),
      ).signals.get('security.database-backup');
    expect(backup(40.4, { errorCode: 'MYSQLDUMP_FAILED' })).toEqual({
      state: 'fail',
      title: '数据库备份中断',
      detail: '最近一次成功备份在 40 小时前，最近一次运行失败：MYSQLDUMP_FAILED',
      channel: 'urgent',
    });
    expect(backup(40.9).detail).toBe(backup(40.4).detail);
    expect(backup(null).detail).toBe('没有找到成功的备份');
    expect(
      deriveAlertSignals(diagnostics([check('security.fail2ban', 'fail', { value: 'not-installed' })])).signals.get(
        'security.fail2ban',
      ).channel,
    ).toBe('notice');
  });
});

describe('服务器告警执行', () => {
  function fakeDatabase(rows = [], silences = []) {
    const queries = [];
    return {
      queries,
      query: vi.fn(async (sql, params) => {
        queries.push({ sql, params });
        if (sql.startsWith('SELECT alert_key')) return [rows];
        if (sql.startsWith('SELECT check_id')) return [silences];
        if (sql.includes("role='root'")) return [[{ id: 'root-1', email: 'root@example.com' }]];
        return [{ affectedRows: 1 }];
      }),
    };
  }
  const openRow = (alertKey, channel, failStreak = 2) => ({
    alert_key: alertKey,
    state: 'pending',
    channel,
    fail_streak: failStreak,
    pass_streak: 0,
    title: 'x',
    detail: null,
    first_failed_at: new Date('2026-10-30T04:00:00Z'),
    opened_at: null,
    resolved_at: null,
  });

  it('先落库再通知：服务故障发站内通知和邮件，安全项只发站内通知', async () => {
    const db = fakeDatabase([openRow('service.mysql', 'urgent'), openRow('security.fail2ban', 'notice')]);
    const notify = vi.fn();
    const sendEmail = vi.fn();
    const result = await runInfraAlertCycle({
      db,
      notify,
      sendEmail,
      now: new Date('2026-10-30T04:03:00Z'),
      siteUrl: 'https://example.test',
      loadDiagnostics: async () =>
        diagnostics([
          check('services.health', 'fail', { unhealthy: ['mysql'] }, 'services'),
          check('security.fail2ban', 'fail', { value: 'not-installed' }),
        ]),
    });
    expect(result.opened.map((row) => row.alertKey).sort()).toEqual(['security.fail2ban', 'service.mysql']);
    const upsertIndex = db.queries.findIndex((item) => item.sql.startsWith('INSERT INTO infra_alerts'));
    const recipientIndex = db.queries.findIndex((item) => item.sql.includes("role='root'"));
    expect(upsertIndex).toBeGreaterThan(-1);
    expect(upsertIndex).toBeLessThan(recipientIndex);
    expect(notify).toHaveBeenCalledWith(
      'root-1',
      expect.objectContaining({
        type: 'system',
        title: '服务器告警：MySQL 未运行',
        link: '/serverManagement/diagnostics',
        sourceType: 'infra_alert',
        sourceId: `service.mysql@${Date.parse('2026-10-30T04:03:00Z') / 1000}`,
      }),
    );
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        emailType: 'infra_alert',
        recipient: 'root@example.com',
        subject: '【轻笺服务器告警】MySQL 未运行',
        text: expect.stringContaining('https://example.test/serverManagement/diagnostics'),
      }),
    );
  });

  it('通知失败只记日志，不中断其余告警', async () => {
    const db = fakeDatabase([openRow('service.mysql', 'urgent'), openRow('service.redis', 'urgent')]);
    const notify = vi.fn().mockRejectedValueOnce(Object.assign(new Error('down'), { code: 'NOTIFY_DOWN' }));
    const sendEmail = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await runInfraAlertCycle({
      db,
      notify,
      sendEmail,
      now: new Date('2026-10-30T04:03:00Z'),
      loadDiagnostics: async () =>
        diagnostics([check('services.health', 'fail', { unhealthy: ['mysql', 'redis'] }, 'services')]),
    });
    expect(notify).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
    error.mockRestore();
  });

  const silenceRow = (checkId, until, passStreak = 0) => ({
    check_id: checkId,
    reason: '已关闭密码登录，下周统一安装',
    silenced_until: new Date(until),
    pass_streak: passStreak,
    created_by: 'root-1',
    created_at: new Date('2026-10-29T04:00:00Z'),
  });

  it('静默期内照常推进告警状态，但开启通知不投递', async () => {
    const db = fakeDatabase(
      [openRow('security.fail2ban', 'notice'), openRow('service.mysql', 'urgent')],
      [silenceRow('security.fail2ban', '2026-11-05T04:00:00Z')],
    );
    const notify = vi.fn();
    const result = await runInfraAlertCycle({
      db,
      notify,
      sendEmail: vi.fn(),
      now: new Date('2026-10-30T04:03:00Z'),
      loadDiagnostics: async () =>
        diagnostics([
          check('services.health', 'fail', { unhealthy: ['mysql'] }, 'services'),
          check('security.fail2ban', 'fail', { value: 'not-installed' }),
        ]),
    });
    expect(result.opened.map((row) => row.alertKey).sort()).toEqual(['security.fail2ban', 'service.mysql']);
    expect(db.queries.some((item) => item.params?.[0] === 'security.fail2ban' && item.sql.startsWith('INSERT'))).toBe(
      true,
    );
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('root-1', expect.objectContaining({ title: '服务器告警：MySQL 未运行' }));
  });

  it('静默到期仍异常时解除静默并只发一条站内提醒', async () => {
    const until = '2026-10-30T04:02:00Z';
    const db = fakeDatabase([], [silenceRow('security.ssh-login-failures', until)]);
    const notify = vi.fn();
    const sendEmail = vi.fn();
    await runInfraAlertCycle({
      db,
      notify,
      sendEmail,
      now: new Date('2026-10-30T04:03:00Z'),
      loadDiagnostics: async () => diagnostics([check('security.ssh-login-failures', 'fail', { failures24h: 1841 })]),
    });
    const removal = db.queries.find((item) => item.sql.startsWith('DELETE FROM infra_alert_silences'));
    expect(removal.params).toEqual(['security.ssh-login-failures', new Date(until)]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'root-1',
      expect.objectContaining({
        title: '静默已到期，仍未恢复：SSH 失败登录尝试过多',
        content: expect.stringContaining('24 小时内失败 1841 次'),
        sourceType: 'infra_alert',
        sourceId: `security.ssh-login-failures#${Date.parse(until) / 1000}`,
        meta: { alertKey: 'security.ssh-login-failures', state: 'silence_expired' },
      }),
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it('静默期内恢复满 3 轮时自动解除，恢复通知同样不投递', async () => {
    const opened = { ...openRow('security.fail2ban', 'notice'), state: 'open', fail_streak: 0, pass_streak: 2 };
    const db = fakeDatabase([opened], [silenceRow('security.fail2ban', '2026-11-05T04:00:00Z', 2)]);
    const notify = vi.fn();
    const result = await runInfraAlertCycle({
      db,
      notify,
      sendEmail: vi.fn(),
      now: new Date('2026-10-30T04:03:00Z'),
      loadDiagnostics: async () => diagnostics([check('security.fail2ban', 'pass')]),
    });
    expect(result.resolved.map((row) => row.alertKey)).toEqual(['security.fail2ban']);
    expect(db.queries.some((item) => item.sql.startsWith('DELETE FROM infra_alert_silences'))).toBe(true);
    expect(notify).not.toHaveBeenCalled();
  });

  it('静默表尚未建好时照常告警', async () => {
    const db = fakeDatabase([openRow('security.fail2ban', 'notice')]);
    const query = db.query.getMockImplementation();
    db.query.mockImplementation(async (sql, params) => {
      if (sql.startsWith('SELECT check_id')) throw Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' });
      return query(sql, params);
    });
    const notify = vi.fn();
    await runInfraAlertCycle({
      db,
      notify,
      sendEmail: vi.fn(),
      now: new Date('2026-10-30T04:03:00Z'),
      loadDiagnostics: async () => diagnostics([check('security.fail2ban', 'fail', { value: 'not-installed' })]),
    });
    expect(notify).toHaveBeenCalledTimes(1);
  });
});

describe('部署窗口', () => {
  const now = new Date('2026-10-30T07:00:00Z');
  const epoch = (offsetMs) => Math.floor((now.getTime() + offsetMs) / 1000);

  it('窗口内服务告警暂停，资源与安全项照常评估', () => {
    const input = diagnostics([
      check('services.health', 'fail', { unhealthy: ['lightnote-document-worker'] }, 'services'),
      check('security.fail2ban', 'fail', { value: 'not-installed' }),
    ]);
    const { signals, servicesKnown } = deriveAlertSignals(input, { servicesPaused: true });
    expect(servicesKnown).toBe(false);
    expect([...signals.keys()].sort()).toEqual(['agent.offline', 'security.fail2ban']);
  });

  it('部署中停掉的 Worker 不累计失败次数，也不通知', async () => {
    const queries = [];
    const pending = {
      alert_key: 'service.lightnote-document-worker',
      state: 'pending',
      channel: 'urgent',
      fail_streak: 2,
      pass_streak: 0,
      title: '文档处理 Worker 未运行',
      detail: null,
      first_failed_at: new Date('2026-10-30T06:58:00Z'),
      opened_at: null,
      resolved_at: null,
    };
    const db = {
      query: vi.fn(async (sql, params) => {
        queries.push({ sql, params });
        if (sql.startsWith('SELECT alert_key')) return [[pending]];
        if (sql.startsWith('SELECT check_id')) return [[]];
        return [{ affectedRows: 1 }];
      }),
    };
    const notify = vi.fn();
    const result = await runInfraAlertCycle({
      db,
      notify,
      sendEmail: vi.fn(),
      now,
      deployWindow: async () => true,
      loadDiagnostics: async () =>
        diagnostics([check('services.health', 'fail', { unhealthy: ['lightnote-document-worker'] }, 'services')]),
    });
    expect(result.changed).toEqual([]);
    expect(queries.some((item) => item.sql.startsWith('INSERT INTO infra_alerts'))).toBe(false);
    expect(notify).not.toHaveBeenCalled();
  });

  it('只采信 30 分钟内到期的有效标记；缺失、损坏、过期都按不在部署中处理', async () => {
    const dir = await mkdtemp(path.join(tmpdir(), 'deploy-window-'));
    const file = path.join(dir, 'deploy-window.json');
    try {
      expect(await readDeployWindow(now, file)).toBe(false);
      await writeFile(file, JSON.stringify({ until: epoch(15 * 60_000) }));
      expect(await readDeployWindow(now, file)).toBe(true);
      await writeFile(file, JSON.stringify({ until: epoch(-1000) }));
      expect(await readDeployWindow(now, file)).toBe(false);
      await writeFile(file, JSON.stringify({ until: epoch(31 * 60_000) }));
      expect(await readDeployWindow(now, file)).toBe(false);
      await writeFile(file, '{"until":');
      expect(await readDeployWindow(now, file)).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it('部署脚本在停文档 Worker 前写标记，全部进程重启后、健康检查前删除', async () => {
    const script = await readFile(new URL('../../../scripts/deploy-server.sh', import.meta.url), 'utf8');
    const writeIndex = script.indexOf("> '$DEPLOY_WINDOW_FILE'");
    const stopIndex = script.indexOf("pm2 stop '$DOCUMENT_WORKER_PM2'");
    const saveIndex = script.indexOf('pm2 save');
    const removeIndex = script.indexOf("rm -f '$DEPLOY_WINDOW_FILE'");
    const healthIndex = script.indexOf('https://boluo66.top/api/user/me');
    expect(script).toContain('DEPLOY_WINDOW_FILE="$REMOTE/.runtime/deploy-window.json"');
    expect(script).toContain("--exclude '.runtime/'");
    expect(writeIndex).toBeGreaterThan(-1);
    expect(stopIndex).toBeGreaterThan(writeIndex);
    expect(removeIndex).toBeGreaterThan(saveIndex);
    expect(healthIndex).toBeGreaterThan(removeIndex);
    // 脚本给出的窗口必须落在告警端的采信上限内，否则标记会被当成异常而失效。
    expect(Number(script.match(/DEPLOY_WINDOW_SECONDS=(\d+)/u)?.[1]) * 1000).toBeLessThanOrEqual(30 * 60_000);
  });
});
