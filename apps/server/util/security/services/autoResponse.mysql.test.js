import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../../db/index.js', () => ({ default: { query: (...args) => state.query(...args) } }));
import { applyAutomaticSecurityResponse, releaseAutomaticSecurityResponse } from './autoResponseService.js';
import { automaticBanEvents } from './autoResponsePolicy.js';
import { updateIpReputation } from './ipReputation.js';
import { SECURITY_CONFIG } from '../rules.js';
const socket = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `ln_security_auto_${process.pid}`;
let admin, db;
const ip = '8.8.8.8';
const evidence = {
  ruleCode: 'SENSITIVE_PATH_PROBE',
  matchedField: 'path',
  detector: 'signature',
  policyMode: 'block',
  scoreDelta: 55,
  confidence: 86,
  exceptionIds: [],
};
const context = { method: 'GET', path: '/.env', sourceIp: ip, visitorActor: true, userId: 'visitor' };
let seq = 0;
async function event(patch = {}) {
  const id = (++seq).toString(16).padStart(32, '0');
  await db.query('INSERT INTO security_events (event_id,source_ip) VALUES (?,?)', [id, ip]);
  return {
    eventId: id,
    context: { ...context, ...patch },
    evidenceList: [evidence],
    decision: { blocked: true },
    statusCode: 403,
    db,
  };
}
const ban = async () => {
  const [[r]] = await db.query('SELECT * FROM security_ip_reputation WHERE ip=?', [ip]);
  return r;
};
describe.skipIf(!socket)('automatic security response on isolated MySQL', () => {
  beforeAll(async () => {
    if (!socket.startsWith('/tmp/')) throw Error('ISOLATED_SOCKET_REQUIRED');
    admin = await mysql.createConnection({ socketPath: socket, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath: socket, user: 'root', database: schema, connectionLimit: 6 });
    await db.query(
      `CREATE TABLE security_events(id BIGINT AUTO_INCREMENT PRIMARY KEY,event_id VARCHAR(32) UNIQUE,source_ip VARCHAR(45),workflow_status VARCHAR(20) DEFAULT 'new',disposition VARCHAR(40) DEFAULT 'unknown',handled_status VARCHAR(32) DEFAULT 'unhandled',handled_by VARCHAR(64),handled_at DATETIME,reviewed_by VARCHAR(64),reviewed_at DATETIME,review_reason TEXT,remark TEXT,created_at DATETIME DEFAULT CURRENT_TIMESTAMP,INDEX(source_ip,created_at)) ENGINE=InnoDB`,
    );
    await db.query(
      `CREATE TABLE security_ip_reputation(ip VARCHAR(45) PRIMARY KEY,is_banned TINYINT DEFAULT 0,banned_until DATETIME,ban_reason VARCHAR(255),first_seen_at DATETIME,last_seen_at DATETIME,total_attacks INT DEFAULT 0,high_risk_count INT DEFAULT 0,critical_count INT DEFAULT 0,risk_score INT DEFAULT 0,attack_type_breakdown JSON,last_attack_time DATETIME) ENGINE=InnoDB`,
    );
    await db.query(
      `CREATE TABLE security_whitelist(id INT AUTO_INCREMENT PRIMARY KEY,target_type VARCHAR(20),target_value VARCHAR(64),enabled INT DEFAULT 1)`,
    );
    await db.query(
      `CREATE TABLE security_policy_audit(id INT AUTO_INCREMENT PRIMARY KEY,policy_type VARCHAR(32),action VARCHAR(20),policy_version INT,operator_id VARCHAR(64),reason TEXT,snapshot_json JSON,created_at DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    );
    await db.query(
      `CREATE TABLE admin_operation_audit(id VARCHAR(64) PRIMARY KEY,actor_user_id VARCHAR(64),action VARCHAR(64),target_type VARCHAR(64),target_id VARCHAR(64),outcome VARCHAR(20),reason TEXT,request_id VARCHAR(64),ip_masked VARCHAR(64),metadata JSON)`,
    );
  });
  beforeEach(async () => {
    for (const t of [
      'security_events',
      'security_ip_reputation',
      'security_whitelist',
      'security_policy_audit',
      'admin_operation_audit',
    ])
      await db.query(`DELETE FROM ${t}`);
    state.query.mockReset().mockImplementation((...args) => db.query(...args));
    SECURITY_CONFIG.autoResponseEnabled = true;
    SECURITY_CONFIG.blockEnabled = true;
    SECURITY_CONFIG.ipAutoBanEnabled = false;
    seq = 0;
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  });
  it.each(['autoResponseEnabled', 'blockEnabled'])(
    'a disabled %s leaves events pending and creates no restriction',
    async (flag) => {
      SECURITY_CONFIG[flag] = false;
      const a = await event();
      expect(await applyAutomaticSecurityResponse(a)).toBeNull();
      expect(await ban()).toBeUndefined();
      const [[r]] = await db.query('SELECT workflow_status FROM security_events WHERE event_id=?', [a.eventId]);
      expect(r.workflow_status).toBe('new');
    },
  );
  it('reviews the first probe and restricts only after two, without extending the active period', async () => {
    expect(await applyAutomaticSecurityResponse(await event())).toEqual({ reviewed: true, restricted: false });
    expect(Number((await ban()).is_banned)).toBe(0);
    const second = await event();
    expect(await applyAutomaticSecurityResponse(second)).toEqual({ reviewed: true, restricted: true });
    const before = await ban();
    expect(automaticBanEvents(before.ban_reason)).toContain(second.eventId);
    expect(before.banned_until.getTime() - Date.now()).toBeGreaterThan(3500000);
    expect(await applyAutomaticSecurityResponse(await event())).toEqual({ reviewed: true, restricted: false });
    expect((await ban()).banned_until).toEqual(before.banned_until);
    const [[r]] = await db.query(
      "SELECT COUNT(*) n FROM security_events WHERE workflow_status='resolved' AND disposition='confirmed_attack'",
    );
    expect(r.n).toBe(3);
  });
  it('serializes concurrent probes and does not duplicate reviews or policy audits', async () => {
    const a = await event(),
      b = await event();
    await Promise.all([applyAutomaticSecurityResponse(a), applyAutomaticSecurityResponse(b)]);
    expect(Number((await ban()).is_banned)).toBe(1);
    expect(await applyAutomaticSecurityResponse(a)).toBeNull();
    const [[p]] = await db.query('SELECT COUNT(*) n FROM security_policy_audit');
    const [[r]] = await db.query('SELECT COUNT(*) n FROM admin_operation_audit');
    expect(p.n).toBe(1);
    expect(r.n).toBe(2);
  });
  it.each(['ip', 'user'])('honors %s whitelists without silently resolving tests', async (type) => {
    await db.query('INSERT INTO security_whitelist(target_type,target_value) VALUES (?,?)', [
      type,
      type === 'ip' ? ip : 'visitor',
    ]);
    const a = await event();
    expect(await applyAutomaticSecurityResponse(a)).toBeNull();
    const [[r]] = await db.query('SELECT workflow_status FROM security_events');
    expect(r.workflow_status).toBe('new');
  });
  it('does not count old probes, reviewed false positives, or unqualified current requests', async () => {
    const a = await event();
    await applyAutomaticSecurityResponse(a);
    await db.query('UPDATE security_events SET created_at=DATE_SUB(NOW(),INTERVAL 6 MINUTE)');
    await applyAutomaticSecurityResponse(await event());
    expect(Number((await ban()).is_banned)).toBe(0);
    await db.query("UPDATE security_events SET handled_status='false_positive'");
    await applyAutomaticSecurityResponse(await event());
    expect(Number((await ban()).is_banned)).toBe(0);
    expect(await applyAutomaticSecurityResponse(await event({ visitorActor: false }))).toBeNull();
  });
  it('does not shorten a manual restriction or ignore a recent manual release', async () => {
    await db.query(
      "INSERT INTO security_ip_reputation(ip,is_banned,banned_until,ban_reason) VALUES (?,1,DATE_ADD(NOW(),INTERVAL 7 DAY),'manual')",
      [ip],
    );
    const before = await ban();
    await applyAutomaticSecurityResponse(await event());
    await applyAutomaticSecurityResponse(await event());
    expect((await ban()).banned_until).toEqual(before.banned_until);
    expect((await ban()).ban_reason).toBe('manual');
    await db.query('UPDATE security_ip_reputation SET is_banned=0,banned_until=NULL,ban_reason=NULL');
    await db.query(
      "INSERT INTO security_policy_audit(policy_type,action,snapshot_json) VALUES ('source_deny','revoke',?)",
      [JSON.stringify({ ip })],
    );
    expect((await applyAutomaticSecurityResponse(await event())).restricted).toBe(false);
    expect(Number((await ban()).is_banned)).toBe(0);
  });
  it('releases only an automatic restriction tied to the reclassified event', async () => {
    const a = await event();
    await applyAutomaticSecurityResponse(a);
    await applyAutomaticSecurityResponse(await event());
    const c = await db.getConnection();
    try {
      await c.beginTransaction();
      expect(
        await releaseAutomaticSecurityResponse({ connection: c, event: { event_id: a.eventId, source_ip: ip } }),
      ).toBe(true);
      await c.commit();
    } finally {
      c.release();
    }
    expect(Number((await ban()).is_banned)).toBe(0);
    await db.query("UPDATE security_ip_reputation SET is_banned=1,ban_reason='manual'");
    const c2 = await db.getConnection();
    try {
      await c2.beginTransaction();
      expect(
        await releaseAutomaticSecurityResponse({ connection: c2, event: { event_id: a.eventId, source_ip: ip } }),
      ).toBe(false);
      await c2.commit();
    } finally {
      c2.release();
    }
    expect(Number((await ban()).is_banned)).toBe(1);
  });
  it('rolls back review and restriction if mandatory auditing fails', async () => {
    await applyAutomaticSecurityResponse(await event());
    const a = await event();
    const getConnection = db.getConnection.bind(db);
    const failing = {
      getConnection: async () => {
        const c = await getConnection();
        return {
          query: (sql, ...args) =>
            sql.includes('INSERT INTO admin_operation_audit')
              ? Promise.reject(Object.assign(Error('audit unavailable'), { code: 'TEST_AUDIT_FAILURE' }))
              : c.query(sql, ...args),
          beginTransaction: c.beginTransaction.bind(c),
          commit: c.commit.bind(c),
          rollback: c.rollback.bind(c),
          release: c.release.bind(c),
        };
      },
    };
    await expect(applyAutomaticSecurityResponse({ ...a, db: failing })).rejects.toMatchObject({
      code: 'ADMIN_AUDIT_UNAVAILABLE',
    });
    expect(Number((await ban()).is_banned)).toBe(0);
    const [[r]] = await db.query('SELECT workflow_status FROM security_events WHERE event_id=?', [a.eventId]);
    expect(r.workflow_status).toBe('new');
  });
  it('a reputation update read before an automatic ban cannot erase it afterwards', async () => {
    await applyAutomaticSecurityResponse(await event());
    let resume, read;
    const seen = new Promise((r) => (read = r)),
      barrier = new Promise((r) => (resume = r));
    state.query.mockImplementation(async (sql, ...args) => {
      const result = await db.query(sql, ...args);
      if (sql.startsWith('SELECT * FROM security_ip_reputation') && sql.includes('LIMIT 1')) {
        read();
        await barrier;
      }
      return result;
    });
    const updating = updateIpReputation({ ip, attackType: 'SCANNER', severity: 'high', threatScore: 55 });
    await seen;
    await applyAutomaticSecurityResponse(await event());
    resume();
    await updating;
    expect(Number((await ban()).is_banned)).toBe(1);
    expect(automaticBanEvents((await ban()).ban_reason)).toHaveLength(2);
  });
});
