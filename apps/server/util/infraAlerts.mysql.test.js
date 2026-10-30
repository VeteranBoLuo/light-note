import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('./emailDelivery.js', () => ({ sendTrackedEmail: vi.fn() }));

const { runInfraAlertCycle } = await import('./infraAlerts.js');
const { UPSERT_SILENCE_SQL, loadInfraAlertSilences } = await import('./infraAlertSilences.js');

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('服务器告警状态持久化（隔离 MySQL）', () => {
  const schema = `infra_alerts_${randomUUID().replaceAll('-', '')}`;
  let admin;
  let db;
  let created = false;

  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 2 });
    await db.query(await readFile(new URL('../migrations/20261030_infra_alerts.sql', import.meta.url), 'utf8'));
    // 迁移必须可重复执行，部署每次都会跑。
    await db.query(await readFile(new URL('../migrations/20261030_infra_alerts.sql', import.meta.url), 'utf8'));
    for (let i = 0; i < 2; i += 1) {
      await db.query(
        await readFile(new URL('../migrations/20261030_infra_alert_silences.sql', import.meta.url), 'utf8'),
      );
    }
    await db.query(
      'CREATE TABLE user (id VARCHAR(255) PRIMARY KEY, email VARCHAR(255), role VARCHAR(16), del_flag INT, alias VARCHAR(64)) DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci',
    );
    await db.query(
      "INSERT INTO user VALUES ('root-1','root@example.com','root',0,'菠萝'),('user-1','u@example.com','user',0,null)",
    );
  });

  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it('跨轮次累计异常、开启后只通知一次，恢复后状态回到 clear', async () => {
    const notify = vi.fn();
    const sendEmail = vi.fn();
    const mysqlDown = {
      sources: ['overview', 'services', 'storage', 'security'].map((domain) => ({ domain, state: 'available' })),
      checks: [{ id: 'services.health', domain: 'services', state: 'fail', evidence: { unhealthy: ['mysql'] } }],
    };
    const healthy = {
      ...mysqlDown,
      checks: [{ id: 'services.health', domain: 'services', state: 'pass', evidence: { unhealthy: [] } }],
    };
    const cycle = (input, minute) =>
      runInfraAlertCycle({
        db,
        notify,
        sendEmail,
        loadDiagnostics: async () => input,
        now: new Date(2026, 9, 30, 12, minute),
      });

    for (const minute of [0, 1, 2, 3]) await cycle(mysqlDown, minute);
    const [[open]] = await db.query("SELECT * FROM infra_alerts WHERE alert_key='service.mysql'");
    expect(open).toMatchObject({ state: 'open', channel: 'urgent', title: 'MySQL 未运行', fail_streak: 3 });
    expect(open.opened_at).toEqual(new Date(2026, 9, 30, 12, 2));
    expect(open.first_failed_at).toEqual(new Date(2026, 9, 30, 12, 0));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith('root-1', expect.objectContaining({ title: '服务器告警：MySQL 未运行' }));
    expect(sendEmail).toHaveBeenCalledTimes(1);

    for (const minute of [4, 5, 6]) await cycle(healthy, minute);
    const [[cleared]] = await db.query("SELECT * FROM infra_alerts WHERE alert_key='service.mysql'");
    expect(cleared).toMatchObject({ state: 'clear', pass_streak: 3, fail_streak: 0 });
    expect(cleared.resolved_at).toEqual(new Date(2026, 9, 30, 12, 6));
    expect(notify).toHaveBeenLastCalledWith('root-1', expect.objectContaining({ title: '已恢复：MySQL 未运行' }));
    expect(sendEmail).toHaveBeenCalledTimes(1);

    // 已恢复的告警在持续正常时不再写库。
    await cycle(healthy, 7);
    const [[still]] = await db.query("SELECT pass_streak FROM infra_alerts WHERE alert_key='service.mysql'");
    expect(still.pass_streak).toBe(3);
  });

  it('静默期内告警照常开启但不通知；恢复计数按截止时刻条件写入；到期仍异常提醒一次并删除', async () => {
    const notify = vi.fn();
    const security = (state) => ({
      sources: ['overview', 'services', 'storage', 'security'].map((domain) => ({ domain, state: 'available' })),
      checks: [{ id: 'security.fail2ban', domain: 'security', state, evidence: { value: 'not-installed' } }],
    });
    const at = (minute) => new Date(2026, 9, 31, 9, minute);
    const until = new Date(2026, 9, 31, 9, 10);
    await db.query(UPSERT_SILENCE_SQL, ['security.fail2ban', '下周统一安装 Fail2ban', until, 'root-1', at(0)]);
    const cycle = (state, minute) =>
      runInfraAlertCycle({
        db,
        notify,
        sendEmail: vi.fn(),
        loadDiagnostics: async () => security(state),
        now: at(minute),
      });

    for (const minute of [0, 1, 2]) await cycle('fail', minute);
    const [[alert]] = await db.query("SELECT state FROM infra_alerts WHERE alert_key='security.fail2ban'");
    expect(alert.state).toBe('open');
    expect(notify).not.toHaveBeenCalled();

    await cycle('pass', 3);
    const [[silence]] = await loadInfraAlertSilences(db, { withActors: true }).then((rows) => [rows]);
    expect(silence).toMatchObject({ passStreak: 1, actorAlias: '菠萝' });
    expect(silence.silencedUntil).toEqual(until);
    await cycle('fail', 4);
    expect((await loadInfraAlertSilences(db))[0].passStreak).toBe(0);

    await cycle('fail', 10);
    expect(await loadInfraAlertSilences(db)).toEqual([]);
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify).toHaveBeenCalledWith(
      'root-1',
      expect.objectContaining({ title: '静默已到期，仍未恢复：Fail2ban 未启用' }),
    );
    await cycle('fail', 11);
    expect(notify).toHaveBeenCalledTimes(1);
  });
});
