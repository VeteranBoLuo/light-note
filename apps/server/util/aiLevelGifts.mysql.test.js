import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/index.js', () => ({
  default: {
    query: (...args) => state.db.query(...args),
    getConnection: (...args) => state.db.getConnection(...args),
  },
}));
vi.mock('./notification.js', () => ({ createNotification: vi.fn() }));
vi.mock('./growthAchievementState.js', () => ({ persistAchievementUnlocksForMetrics: vi.fn() }));
vi.mock('./publicResources/growthMetrics.js', () => ({
  publicResourceGrowthMetrics: vi.fn(),
  persistPublicResourceAchievements: vi.fn(),
}));
const { grantExp } = await import('./growth.js');
const { ensureAiLevelGiftSchema } = await import('./aiLevelGiftSchema.js');
const { AI_BONUS_WALLET_TABLE_SQL } = await import('./aiBonusWalletSchema.js');
const { grantOutstandingLevelGifts } = await import('./aiLevelGifts.js');
const quota = await import('./aiQuota.js');
const { assessAiLevelGiftRisk } = await import('./aiLevelGiftRisk.js');
const { recordAiGiftRegistration, preserveAiGiftRiskOnDeletion } = await import('./aiLevelGiftRiskFacts.js');
const { insertAiExecution, insertAiProviderSpan } = await import('./aiExecution/persistence.js');
const { runAiLevelGiftBackfill } = await import('./aiLevelGiftBackfill.js');
const { getUserAiUsage, getUserAiUsageDetail } = await import('./aiUsageService.js');
const { generateReservationReport } = await import('./aiQuotaReservationReport.js');
const { localSqlStatements } = await import('./localSqlStatements.js');
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `ai_level_gifts_${randomUUID().replaceAll('-', '')}`;
const userId = 'gift-user';

describe.skipIf(!socketPath)('one-time AI gifts / reservations (isolated MySQL)', () => {
  let admin;
  let created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (Number(server.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.db = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 16,
      multipleStatements: true,
    });
    await state.db.query(`CREATE TABLE user (
      id varchar(64) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,
      role varchar(16) NOT NULL DEFAULT 'user', del_flag varchar(1) NOT NULL DEFAULT '0',
      create_time datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, preferences JSON
    ) ENGINE=InnoDB`);
    for (const name of [
      '20260708_growth.sql',
      '20260708_ai_token_usage.sql',
      '20260719_ai_quota_hardening.sql',
      '20260823_ai_execution_ledger.sql',
      '20260825_ai_execution_rule_versions_and_lease.sql',
    ]) {
      await state.db.query(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
    }
    await state.db.query('ALTER TABLE user_growth ADD ai_bonus_tokens bigint unsigned NOT NULL DEFAULT 0');
    await state.db.query(
      'ALTER TABLE ai_executions ADD input_diagnostics_json JSON NULL, ADD organize_run_id char(36) CHARACTER SET ascii COLLATE ascii_bin NULL, ADD organize_item_id char(36) CHARACTER SET ascii COLLATE ascii_bin NULL',
    );
    await state.db.query(
      'CREATE TABLE organize_suggestion_runs (id char(36) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY, user_id varchar(128), status varchar(32)) ENGINE=InnoDB',
    );
    await state.db.query(
      "ALTER TABLE ai_provider_spans ADD billing_scope varchar(16) NOT NULL DEFAULT 'user', ADD trigger_code varchar(64) NULL, ADD sequence_no int DEFAULT 0, ADD estimated_tokens bigint DEFAULT 0",
    );
    await state.db.query(`CREATE TABLE security_account_restrictions (
      id bigint AUTO_INCREMENT PRIMARY KEY, user_id varchar(64), restriction_type varchar(32),
      status varchar(16), expires_at datetime NULL, scope_json JSON, reason varchar(500), created_by varchar(64), KEY idx_active(user_id,status)
    ) ENGINE=InnoDB`);
    await state.db.query(
      `CREATE TABLE security_policy_audit (id bigint AUTO_INCREMENT PRIMARY KEY, policy_type varchar(40), policy_id bigint, action varchar(32), policy_version int, operator_id varchar(64), reason varchar(500), snapshot_json JSON)`,
    );
    await state.db.query(
      `CREATE TABLE api_logs (id varchar(64) PRIMARY KEY, user_id varchar(64), url varchar(255), method varchar(16), ip varchar(255), del_flag int DEFAULT 0, request_time datetime DEFAULT CURRENT_TIMESTAMP)`,
    );
    for (const sql of AI_BONUS_WALLET_TABLE_SQL) await state.db.query(sql);
    await ensureAiLevelGiftSchema(state.db);
  }, 30000);
  beforeEach(async () => {
    vi.unstubAllEnvs();
    vi.stubEnv('AI_LEVEL_GIFT_MODE', 'on');
    for (const table of [
      'ai_provider_spans',
      'ai_executions',
      'ai_bonus_lot_allocations',
      'ai_bonus_lots',
      'ai_bonus_ledger',
      'ai_token_reservations',
      'ai_token_usage',
      'security_account_restrictions',
      'security_policy_audit',
      'api_logs',
      'ai_level_gift_registrations',
      'ai_level_gift_risk_usage',
      'growth_events',
      'user_growth',
      'user',
    ]) {
      await state.db.query(`DELETE FROM ${table}`);
    }
    await state.db.query('UPDATE ai_level_gift_controls SET paused_from = NULL, reviewed_at=NULL WHERE id = 1');
    await state.db.query('INSERT INTO user (id,create_time) VALUES (?,DATE_SUB(NOW(),INTERVAL 30 DAY))', [userId]);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await state.db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  const balance = async () => {
    const [[row]] = await state.db.query('SELECT ai_bonus_tokens AS tokens FROM user_growth WHERE user_id = ?', [
      userId,
    ]);
    return Number(row?.tokens || 0);
  };
  const receiptCount = async () => {
    const [[row]] = await state.db.query("SELECT COUNT(*) AS n FROM ai_bonus_ledger WHERE source_type='level_gift'");
    return Number(row.n);
  };
  const register = async (id, ip = '198.51.100.1') => {
    await state.db.query('INSERT INTO user(id) VALUES (?)', [id]);
    await recordAiGiftRegistration(state.db, id, ip);
  };
  const anonymize = async (id) => {
    const connection = await state.db.getConnection();
    try {
      await connection.beginTransaction();
      await preserveAiGiftRiskOnDeletion(
        connection,
        new Set(['api_logs', 'ai_level_gift_registrations', 'ai_level_gift_risk_usage', 'ai_executions']),
        id,
      );
      await connection.query("UPDATE user SET role='deleted',del_flag='1' WHERE id=?", [id]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  };
  const execution = (actorUserId) => ({
    id: randomUUID(),
    requestId: randomUUID(),
    actorUserId,
    subjectUserId: actorUserId,
    billingPolicy: 'user',
    surface: 'test',
    taskType: 'skill_note_transform_text',
    skillId: 'note.transform_text',
    skillVersion: 1,
    billingRuleVersion: 1,
    validationRuleVersion: 1,
    leaseExpiresAt: new Date(Date.now() + 60000),
  });
  const span = (executionId, tokens) => ({
    id: randomUUID(),
    executionId,
    traceId: randomUUID(),
    stage: 'model_generation',
    taskType: 'skill_note_transform_text',
    kind: 'complete',
    billingScope: 'user',
    sequenceNo: 1,
    provider: 'test',
    model: 'test',
    status: 'success',
    triggerCode: null,
    usageStatus: 'reported',
    estimatedTokens: tokens,
    usage: { promptTokens: tokens, completionTokens: 0, totalTokens: tokens },
    estimatedCost: 0,
    durationMs: 1,
    errorCode: null,
  });

  it('parallel registration/fallback-style transactions credit each level once and preserve purchased balances', async () => {
    await state.db.query('INSERT INTO user_growth (user_id,exp,ai_bonus_tokens) VALUES (?,2700,300000)', [userId]);
    await Promise.all(Array.from({ length: 16 }, () => grantOutstandingLevelGifts(userId)));
    expect(await balance()).toBe(810000);
    expect(await receiptCount()).toBe(5);
    await state.db.query('UPDATE user_growth SET exp=1000 WHERE user_id=?', [userId]);
    await grantOutstandingLevelGifts(userId);
    await state.db.query('UPDATE user_growth SET exp=2700 WHERE user_id=?', [userId]);
    await grantOutstandingLevelGifts(userId);
    expect(await balance()).toBe(810000);
    expect(await receiptCount()).toBe(5);
  });
  it('max level grants 4190000 including registration, and reruns remain idempotent', async () => {
    await state.db.query('INSERT INTO user_growth (user_id,exp) VALUES (?,50000)', [userId]);
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(4190000);
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(0);
    expect(await balance()).toBe(4190000);
    expect(await receiptCount()).toBe(15);
  });
  it('AI reservation and gifting compete safely; refunding concurrent reservations leaves gifts intact', async () => {
    await state.db.query('INSERT INTO user_growth (user_id,exp) VALUES (?,2700)', [userId]);
    const request = { headers: {}, ip: '127.0.0.1' };
    const [first, second] = await Promise.all([
      quota.reserve(request, { userId, userRole: 'user', requestId: 'request-a', reserveTokens: 150000 }),
      quota.reserve(request, { userId, userRole: 'user', requestId: 'request-b', reserveTokens: 150000 }),
      grantOutstandingLevelGifts(userId),
    ]);
    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
    await Promise.all([quota.reconcile(first, 0), quota.reconcile(second, 0)]);
    expect(await balance()).toBe(510000);
    expect(await receiptCount()).toBe(5);
    expect(await quota.reconcile(first, 0)).toBe(true);
    expect(await balance()).toBe(510000);
  });
  it('real upgrades, AI reservations and backfill share the growth lock without duplicate gifts', async () => {
    vi.stubEnv('AI_DAILY_QUOTA_MODE', 'off');
    await state.db.query('INSERT INTO user_growth (user_id,exp,level) VALUES (?,499,1)', [userId]);
    const [upgrade, first, second] = await Promise.all([
      grantExp(userId, 'first_own_resource', { amount: 1, refId: 'cross-level', userRole: 'user' }),
      quota.reserve({}, { userId, userRole: 'user', requestId: 'mixed-first', reserveTokens: 20000 }),
      quota.reserve({}, { userId, userRole: 'user', requestId: 'mixed-second', reserveTokens: 20000 }),
      grantOutstandingLevelGifts(userId),
    ]);
    expect(upgrade).toMatchObject({ granted: 1, fromLevel: 1, toLevel: 2, leveledUp: true });
    expect(first.blocked).toBe(false);
    expect(second.blocked).toBe(false);
    await Promise.all([quota.reconcile(first, 5000), quota.reconcile(second, 0)]);
    expect(await balance()).toBe(195000);
    expect(await receiptCount()).toBe(2);
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(0);
  });

  it('a stop committed while a gift waits on the account row prevents credit', async () => {
    const blocker = await state.db.getConnection();
    try {
      await blocker.beginTransaction();
      await blocker.query("UPDATE user SET del_flag='1' WHERE id=?", [userId]);
      const pending = grantOutstandingLevelGifts(userId);
      await blocker.commit();
      expect((await pending).status).toBe('ineligible');
      expect(await receiptCount()).toBe(0);
      const [[row]] = await state.db.query('SELECT COUNT(*) AS n FROM user_growth WHERE user_id=?', [userId]);
      expect(Number(row.n)).toBe(0);
    } finally {
      blocker.release();
    }
  });
  it('new-account pause and older batch hold block awards and clearing both restores exact eligibility', async () => {
    await state.db.query('UPDATE ai_level_gift_controls SET paused_from=DATE_SUB(NOW(),INTERVAL 31 DAY) WHERE id=1');
    expect((await grantOutstandingLevelGifts(userId)).status).toBe('held');
    await state.db.query('UPDATE ai_level_gift_controls SET paused_from=NOW() WHERE id=1');
    await state.db.query(
      "INSERT INTO security_account_restrictions(user_id,restriction_type,status) VALUES (?,'gift_hold','active')",
      [userId],
    );
    expect((await grantOutstandingLevelGifts(userId)).reason).toBe('gift_hold');
    await state.db.query("UPDATE security_account_restrictions SET status='revoked'");
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(120000);
  });
  it('personal usage includes only the owner platform brief; stats, filtering and detail charge zero', async () => {
    const entries = [
      ['user', userId, 'other', 'note.transform_text', 100],
      ['system', 'system:daily_brief', userId, 'routine.daily_brief', 200],
      ['system', 'system:daily_brief', 'other', 'routine.daily_brief', 300],
      ['system', 'system:archive', userId, 'routine.daily_brief', 400],
      ['system', 'system:daily_brief', userId, 'note.transform_text', 500],
      ['user', 'root-actor', userId, 'note.transform_text', 600],
    ];
    const ids = [];
    for (const [policy, actor, subject, skill, tokens] of entries) {
      const id = randomUUID();
      ids.push(id);
      await state.db.query(
        `INSERT INTO ai_executions
        (id, request_id, actor_user_id, subject_user_id, billing_policy, surface, task_type, skill_id,
         status, model_called, provider_tokens, charged_tokens)
        VALUES (?, ?, ?, ?, ?, 'test', ?, ?, 'success', 1, ?, ?)`,
        [
          id,
          randomUUID(),
          actor,
          subject,
          policy,
          skill === 'routine.daily_brief' ? 'skill_routine_daily_brief' : 'skill_note_transform_text',
          skill,
          tokens,
          tokens,
        ],
      );
    }
    for (const groupOrganize of [false, true]) {
      const usage = await getUserAiUsage(userId, { groupOrganize }, state.db);
      expect(usage.pagination.total).toBe(2);
      if (groupOrganize) expect(usage.groupingAvailable).toBe(true);
      expect(usage.summary).toMatchObject({
        chargedTokens: 100,
        providerTokens: 300,
        platformCoveredTokens: 200,
        zeroChargeModelActions: 1,
      });
      expect(usage.daily[0]).toMatchObject({ chargedTokens: 100, providerTokens: 300 });
      expect(usage.items.find((i) => i.id === ids[1])).toMatchObject({
        billingPolicy: 'system',
        chargedTokens: 0,
        providerTokens: 200,
      });
    }
    const filtered = await getUserAiUsage(userId, { module: 'routine' }, state.db);
    expect(filtered.pagination.total).toBe(1);
    expect(filtered.summary.chargedTokens).toBe(0);
    await state.db.query(
      "INSERT INTO ai_provider_spans (id,execution_id,trace_id,stage,task_type,kind,billing_scope,status,usage_status,total_tokens) VALUES (?,?,?,'model_generation','test','complete','user','success','reported',200)",
      [randomUUID(), ids[1], randomUUID()],
    );
    const detail = await getUserAiUsageDetail(userId, ids[1], state.db);
    expect(detail.execution).toMatchObject({ chargedTokens: 0, billingPolicy: 'system' });
    expect(detail.calls[0]).toMatchObject({ billingScope: 'platform', totalTokens: 200 });
    for (const id of ids.slice(2))
      await expect(getUserAiUsageDetail(userId, id, state.db)).rejects.toMatchObject({
        code: 'AI_USAGE_EXECUTION_NOT_FOUND',
      });
    await expect(getUserAiUsageDetail('other', ids[1], state.db)).rejects.toMatchObject({
      code: 'AI_USAGE_EXECUTION_NOT_FOUND',
    });
  });

  it('backfill is read-only by default and reconciles concurrent upgrades, prior grants and reruns', async () => {
    vi.stubEnv('AI_LEVEL_GIFT_MODE', 'off');
    await state.db.query('INSERT INTO user_growth (user_id,exp,ai_bonus_tokens) VALUES (?,1700,300000)', [userId]);
    const dry = await runAiLevelGiftBackfill({ database: state.db });
    expect(dry.preview).toMatchObject({ accounts: 1, missingTokens: 390000 });
    expect(await balance()).toBe(300000);
    expect(await receiptCount()).toBe(0);
    vi.stubEnv('AI_LEVEL_GIFT_MODE', 'on');
    const result = await runAiLevelGiftBackfill({
      database: state.db,
      apply: true,
      beforeApply: async () => {
        await state.db.query('UPDATE user_growth SET exp=2700 WHERE user_id=?', [userId]);
        await grantOutstandingLevelGifts(userId);
        const handle = await quota.reserve(
          {},
          { userId, userRole: 'user', requestId: 'during-backfill', reserveTokens: 20000 },
        );
        await quota.reconcile(handle, 5000);
      },
    });
    expect(result).toMatchObject({
      complete: true,
      preview: { missingTokens: 390000 },
      applied: { grantedTokens: 0, levelChanged: 1, alreadyIssued: 1, failed: 0 },
      verification: { missingTokens: 0, issuedTokens: 510000 },
    });
    expect((await runAiLevelGiftBackfill({ database: state.db, apply: true })).applied.grantedTokens).toBe(0);
    expect(await receiptCount()).toBe(5);
    expect(JSON.stringify(result)).not.toContain(userId);
  });
  it('network holds are idempotent, preserve already issued credits and do not reapply a reviewed batch', async () => {
    for (let i = 0; i < 3; i++) {
      const id = 'network-' + i;
      await state.db.query('INSERT INTO user(id) VALUES (?)', [id]);
      await state.db.query("INSERT INTO api_logs(id,user_id,url,ip) VALUES (?,?,'/api/user/registerUser',?)", [
        randomUUID(),
        id,
        '198.51.100.' + (i + 1),
      ]);
    }
    await state.db.query("INSERT INTO user(id,role) VALUES ('root','root')");
    await grantOutstandingLevelGifts('network-0');
    const notify = vi.fn();
    expect(await assessAiLevelGiftRisk({ database: state.db, notify })).toMatchObject({
      paused: false,
      heldAccounts: 3,
    });
    expect(notify).toHaveBeenCalledTimes(1);
    expect((await grantOutstandingLevelGifts('network-1')).reason).toBe('gift_hold');
    expect(await receiptCount()).toBe(1);
    expect((await assessAiLevelGiftRisk({ database: state.db, notify })).heldAccounts).toBe(0);
    await state.db.query("UPDATE security_account_restrictions SET status='revoked'");
    expect((await assessAiLevelGiftRisk({ database: state.db, notify })).heldAccounts).toBe(0);
    expect((await grantOutstandingLevelGifts('network-1')).creditedTokens).toBe(120000);
  });
  it('global pause holds all seven-day accounts and a reviewed restart ignores the same previous facts', async () => {
    for (let i = 0; i < 21; i++) await state.db.query('INSERT INTO user(id) VALUES (?)', ['global-' + i]);
    expect(await assessAiLevelGiftRisk({ database: state.db, notify: vi.fn() })).toMatchObject({
      paused: true,
      heldAccounts: 21,
    });
    await state.db.query("INSERT INTO user(id) VALUES ('later')");
    expect((await grantOutstandingLevelGifts('later')).reason).toBe('new_accounts_paused');
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(120000);
    await state.db.query('UPDATE ai_level_gift_controls SET paused_from=NULL,reviewed_at=NOW(3) WHERE id=1');
    expect((await assessAiLevelGiftRisk({ database: state.db, notify: vi.fn() })).paused).toBe(false);
    expect((await grantOutstandingLevelGifts('later')).creditedTokens).toBe(120000);
    expect((await grantOutstandingLevelGifts('global-0')).reason).toBe('gift_hold');
  });

  it('registration query strings, case and trailing slashes cannot bypass legacy network checks', async () => {
    const urls = ['/user/registerUser?ref=review', '/api/user/registerUser/', '/USER/REGISTERUSER/?a=1'];
    for (let i = 0; i < 3; i++) {
      await state.db.query('INSERT INTO user(id)VALUES(?)', ['url-' + i]);
      await state.db.query('INSERT INTO api_logs(id,user_id,url,ip)VALUES(?,?,?,?)', [
        randomUUID(),
        'url-' + i,
        urls[i],
        '198.51.100.' + (i + 1),
      ]);
    }
    expect((await assessAiLevelGiftRisk({ database: state.db, notify: vi.fn() })).heldAccounts).toBe(3);
    expect((await grantOutstandingLevelGifts('url-2')).reason).toBe('gift_hold');
    expect(await receiptCount()).toBe(0);
  });
  it('domain registration facts enforce the network threshold without any API logs', async () => {
    for (let i = 0; i < 3; i++) await register('fact-' + i, '198.51.100.' + (i + 1));
    expect((await grantOutstandingLevelGifts('fact-0')).reason).toBe('risk_check_pending');
    expect((await assessAiLevelGiftRisk({ database: state.db, notify: vi.fn() })).heldAccounts).toBe(3);
    expect((await grantOutstandingLevelGifts('fact-2')).reason).toBe('gift_hold');
    expect(await receiptCount()).toBe(0);
  });
  it('a failed risk transaction blocks AI fallback, upgrades and backfill until a successful check', async () => {
    vi.stubEnv('AI_DAILY_QUOTA_MODE', 'off');
    await register('pending');
    await state.db.query("INSERT INTO user_growth(user_id,exp)VALUES('pending',499)");
    const broken = {
      getConnection: async () => {
        const raw = await state.db.getConnection();
        return new Proxy(raw, {
          get(target, key) {
            if (key === 'query')
              return async (sql, ...args) => {
                if (String(sql).includes('AS registrations FROM'))
                  throw Object.assign(new Error('synthetic'), { code: 'REVIEW_RISK_FAILURE' });
                return target.query(sql, ...args);
              };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
          },
        });
      },
    };
    await expect(assessAiLevelGiftRisk({ database: broken })).rejects.toMatchObject({ code: 'REVIEW_RISK_FAILURE' });
    expect((await grantOutstandingLevelGifts('pending', { trigger: 'ai_fallback' })).reason).toBe('risk_check_pending');
    expect(
      (
        await quota.reserve(
          {},
          { userId: 'pending', userRole: 'user', requestId: 'risk-pending', reserveTokens: 20000 },
        )
      ).blocked,
    ).toBe(true);
    expect(
      (await grantExp('pending', 'first_own_resource', { amount: 1, refId: 'pending-upgrade', userRole: 'user' }))
        .toLevel,
    ).toBe(2);
    expect(
      (await runAiLevelGiftBackfill({ database: state.db, apply: true, scopeAt: new Date(Date.now() + 2000) })).applied
        .held,
    ).toBe(1);
    const [[before]] = await state.db.query("SELECT ai_bonus_tokens FROM user_growth WHERE user_id='pending'");
    expect(Number(before.ai_bonus_tokens)).toBe(0);
    await assessAiLevelGiftRisk({ database: state.db });
    expect((await grantOutstandingLevelGifts('pending')).creditedTokens).toBe(200000);
    expect((await grantOutstandingLevelGifts('pending')).creditedTokens).toBe(0);
  });
  it('notification failure keeps committed holds and does not occupy the only pool connection', async () => {
    for (let i = 0; i < 3; i++) await register('notice-' + i);
    await state.db.query("INSERT INTO user(id,role)VALUES('notice-root','root')");
    const single = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 1 });
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const result = await assessAiLevelGiftRisk({
        database: single,
        notify: async () => {
          const [[row]] = await single.query(
            "SELECT COUNT(*) AS n FROM security_account_restrictions WHERE status='active'",
          );
          expect(Number(row.n)).toBe(3);
          throw Object.assign(new Error('synthetic'), { code: 'REVIEW_NOTICE_FAILURE' });
        },
      });
      expect(result).toMatchObject({ heldAccounts: 3, notificationFailures: 1 });
      expect((await grantOutstandingLevelGifts('notice-2')).reason).toBe('gift_hold');
      expect((await assessAiLevelGiftRisk({ database: single, notify: vi.fn() })).heldAccounts).toBe(0);
    } finally {
      warn.mockRestore();
      await single.end();
    }
  });
  it.each([0, 3])(
    'window expiration of event %i does not rehold a reviewed batch, but a new registration provides new evidence',
    async (expired) => {
      for (let i = 0; i < 4; i++) await register('expiry-' + i);
      expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(4);
      await state.db.query("UPDATE security_account_restrictions SET status='revoked'");
      await state.db.query('UPDATE user SET create_time=DATE_SUB(NOW(),INTERVAL 25 HOUR) WHERE id=?', [
        `expiry-${expired}`,
      ]);
      await state.db.query(
        'UPDATE ai_level_gift_registrations SET registered_at=DATE_SUB(NOW(),INTERVAL 25 HOUR) WHERE user_id=?',
        [`expiry-${expired}`],
      );
      expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(0);
      expect((await grantOutstandingLevelGifts('expiry-1')).creditedTokens).toBe(120000);
      await register('expiry-new');
      expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(4);
      const [duplicates] = await state.db.query(
        "SELECT user_id FROM security_account_restrictions WHERE status='active' GROUP BY user_id HAVING COUNT(*)>1",
      );
      expect(duplicates).toEqual([]);
    },
  );
  it('a global pause uses one stable episode and never duplicates existing active holds', async () => {
    for (let i = 0; i < 21; i++) await register('episode-' + i);
    expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(21);
    await register('episode-new');
    expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(1);
    const [[row]] = await state.db.query(
      "SELECT COUNT(*) AS n FROM security_account_restrictions WHERE status='active'",
    );
    expect(Number(row.n)).toBe(22);
    await state.db.query("UPDATE security_account_restrictions SET status='revoked' WHERE user_id='episode-0'");
    expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(0);
  });
  it('deleted accounts still count toward global registrations after their user rows are purged', async () => {
    for (let i = 0; i < 21; i++) {
      await register('deleted-' + i, '198.51.' + i + '.1');
      if (i < 20) {
        await anonymize('deleted-' + i);
        await state.db.query('DELETE FROM user WHERE id=?', ['deleted-' + i]);
      }
    }
    expect(await assessAiLevelGiftRisk({ database: state.db })).toMatchObject({ paused: true, heldAccounts: 1 });
    const [[row]] = await state.db.query('SELECT COUNT(*) AS n FROM ai_level_gift_registrations WHERE user_id IS NULL');
    expect(Number(row.n)).toBe(20);
  });
  it('anonymized registrations still count toward network limits', async () => {
    for (let i = 0; i < 3; i++) {
      await register('anonymous-' + i);
      if (i < 2) await anonymize('anonymous-' + i);
    }
    expect((await assessAiLevelGiftRisk({ database: state.db })).heldAccounts).toBe(1);
    expect((await grantOutstandingLevelGifts('anonymous-2')).reason).toBe('gift_hold');
  });
  it('actual provider usage survives deletion and late spans without duplication or user identity', async () => {
    await register('usage-new');
    const item = execution('usage-new');
    await insertAiExecution(item, state.db);
    const first = span(item.id, 300000);
    await insertAiProviderSpan(first, state.db);
    await expect(insertAiProviderSpan(first, state.db)).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });
    await state.db.query('UPDATE ai_executions SET provider_tokens=300000,model_called=1 WHERE id=?', [item.id]);
    vi.stubEnv('AI_GIFT_NEW_ACCOUNT_TOKEN_LIMIT', '400000');
    expect((await assessAiLevelGiftRisk({ database: state.db })).paused).toBe(false);
    await anonymize('usage-new');
    await state.db.query('DELETE FROM ai_provider_spans WHERE execution_id=?', [item.id]);
    await state.db.query('DELETE FROM ai_executions WHERE id=?', [item.id]);
    await state.db.query("DELETE FROM user WHERE id='usage-new'");
    await insertAiProviderSpan(span(item.id, 300000), state.db);
    const [[row]] = await state.db.query('SELECT * FROM ai_level_gift_risk_usage WHERE execution_id=?', [item.id]);
    expect(Number(row.provider_tokens)).toBe(600000);
    expect(Object.keys(row).sort()).toEqual(['created_at', 'execution_id', 'known_tokens', 'provider_tokens']);
    expect((await assessAiLevelGiftRisk({ database: state.db })).paused).toBe(true);
  });
  it('risk facts and runtime schema upgrade idempotently without rewriting pending registrations or assets', async () => {
    await register('schema-pending');
    const [[before]] = await state.db.query("SELECT * FROM ai_level_gift_registrations WHERE user_id='schema-pending'");
    const migration = await readFile(new URL('../migrations/20261106_ai_gift_risk_facts.sql', import.meta.url), 'utf8');
    for (let repeat = 0; repeat < 2; repeat++) {
      for (const statement of localSqlStatements(migration)) await state.db.query(statement);
      await ensureAiLevelGiftSchema(state.db);
    }
    const [[after]] = await state.db.query("SELECT * FROM ai_level_gift_registrations WHERE user_id='schema-pending'");
    expect(after).toEqual(before);
    expect(await receiptCount()).toBe(0);
  });
  it('risk retention still prunes expired facts while gifts are disabled', async () => {
    await register('retained');
    await register('expired');
    await register('anonymous-expired');
    await anonymize('anonymous-expired');
    await state.db.query(
      "UPDATE ai_level_gift_registrations SET registered_at=DATE_SUB(NOW(),INTERVAL 9 DAY) WHERE user_id='expired'",
    );
    await state.db.query(
      'UPDATE ai_level_gift_registrations SET registered_at=DATE_SUB(NOW(),INTERVAL 25 HOUR) WHERE user_id IS NULL',
    );
    await state.db.query(
      'INSERT INTO ai_level_gift_risk_usage(execution_id,provider_tokens,created_at)VALUES(?,100,DATE_SUB(NOW(),INTERVAL 25 HOUR))',
      [randomUUID()],
    );
    vi.stubEnv('AI_LEVEL_GIFT_MODE', 'off');
    expect(await assessAiLevelGiftRisk({ database: state.db })).toEqual({ disabled: true });
    const [rows] = await state.db.query('SELECT user_id,checked_at FROM ai_level_gift_registrations');
    expect(rows).toEqual([{ user_id: 'retained', checked_at: null }]);
    const [[usage]] = await state.db.query('SELECT COUNT(*) AS n FROM ai_level_gift_risk_usage');
    expect(Number(usage.n)).toBe(0);
    expect(await receiptCount()).toBe(0);
  });
  it('concurrent risk assessments and gift fallbacks create one hold per account and no gifts', async () => {
    for (let i = 0; i < 3; i++) await register('risk-race-' + i);
    await Promise.all([
      ...Array.from({ length: 3 }, () => assessAiLevelGiftRisk({ database: state.db })),
      ...Array.from({ length: 3 }, (_, i) => grantOutstandingLevelGifts('risk-race-' + i)),
    ]);
    const [[row]] = await state.db.query(
      "SELECT COUNT(*) AS n FROM security_account_restrictions WHERE status='active'",
    );
    expect(Number(row.n)).toBe(3);
    expect(await receiptCount()).toBe(0);
  });
  it('execution and span risk writes are atomic and safe to retry after a journal write failure', async () => {
    await register('journal-failure');
    const broken = (match) => ({
      getConnection: async () => {
        const raw = await state.db.getConnection();
        return new Proxy(raw, {
          get(target, key) {
            if (key === 'query')
              return async (sql, ...args) => {
                if (String(sql).includes(match))
                  throw Object.assign(new Error('synthetic'), { code: 'REVIEW_JOURNAL_FAILURE' });
                return target.query(sql, ...args);
              };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
          },
        });
      },
    });
    const item = execution('journal-failure');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await expect(insertAiExecution(item, broken('INSERT INTO ai_level_gift_risk_usage'))).rejects.toMatchObject({
        code: 'AI_EXECUTION_STORE_UNAVAILABLE',
      });
    } finally {
      log.mockRestore();
    }
    const [[root]] = await state.db.query('SELECT COUNT(*) AS n FROM ai_executions WHERE id=?', [item.id]);
    expect(Number(root.n)).toBe(0);
    await insertAiExecution(item, state.db);
    const call = span(item.id, 1000);
    await expect(insertAiProviderSpan(call, broken('UPDATE ai_level_gift_risk_usage'))).rejects.toMatchObject({
      code: 'REVIEW_JOURNAL_FAILURE',
    });
    const [[before]] = await state.db.query('SELECT COUNT(*) AS n FROM ai_provider_spans WHERE id=?', [call.id]);
    expect(Number(before.n)).toBe(0);
    await insertAiProviderSpan(call, state.db);
    const [[usage]] = await state.db.query(
      'SELECT provider_tokens FROM ai_level_gift_risk_usage WHERE execution_id=?',
      [item.id],
    );
    expect(Number(usage.provider_tokens)).toBe(1000);
  });
  it('known root usage remains counted when a span journal is incomplete, before and after deletion', async () => {
    await register('incomplete-span');
    const item = execution('incomplete-span');
    await insertAiExecution(item, state.db);
    await state.db.query('UPDATE ai_executions SET provider_tokens=600000,model_called=1 WHERE id=?', [item.id]);
    expect((await assessAiLevelGiftRisk({ database: state.db })).paused).toBe(true);
    await anonymize('incomplete-span');
    await state.db.query('DELETE FROM ai_executions WHERE id=?', [item.id]);
    await state.db.query('UPDATE ai_level_gift_controls SET paused_from=NULL WHERE id=1');
    const [[usage]] = await state.db.query(
      'SELECT provider_tokens,known_tokens FROM ai_level_gift_risk_usage WHERE execution_id=?',
      [item.id],
    );
    expect(Number(usage.provider_tokens)).toBe(0);
    expect(Number(usage.known_tokens)).toBe(600000);
    await insertAiProviderSpan(span(item.id, 600000), state.db);
    const [[replayed]] = await state.db.query(
      'SELECT GREATEST(provider_tokens,known_tokens) AS tokens FROM ai_level_gift_risk_usage WHERE execution_id=?',
      [item.id],
    );
    expect(Number(replayed.tokens)).toBe(600000);
    expect((await assessAiLevelGiftRisk({ database: state.db })).paused).toBe(true);
  });
  it('backfill rejects wrong gift amounts or versions instead of reporting completion', async () => {
    await grantOutstandingLevelGifts(userId);
    for (const [column, value] of [
      ['amount_tokens', 1],
      ['amount_tokens', 240000],
      ['policy_version', 'unknown'],
    ]) {
      await state.db.query(
        "UPDATE ai_bonus_ledger SET amount_tokens=120000,policy_version='ai-level-gifts-v1' WHERE user_id=?",
        [userId],
      );
      await state.db.query(`UPDATE ai_bonus_ledger SET ${column}=? WHERE user_id=?`, [value, userId]);
      await expect(runAiLevelGiftBackfill({ database: state.db, apply: true })).rejects.toMatchObject({
        code: 'AI_LEVEL_GIFT_RECEIPT_INVALID',
      });
      expect(await balance()).toBe(120000);
      expect(await receiptCount()).toBe(1);
    }
  });

  it('a partial multi-level gift transaction rolls back and retries each level exactly once', async () => {
    await state.db.query('INSERT INTO user_growth(user_id,exp)VALUES(?,2700)', [userId]);
    let writes = 0;
    const broken = {
      getConnection: async () => {
        const raw = await state.db.getConnection();
        return new Proxy(raw, {
          get(target, key) {
            if (key === 'query')
              return async (sql, ...args) => {
                if (String(sql).includes('INSERT INTO ai_bonus_ledger') && ++writes === 4)
                  throw Object.assign(new Error('synthetic'), { code: 'REVIEW_GIFT_FAILURE' });
                return target.query(sql, ...args);
              };
            return typeof target[key] === 'function' ? target[key].bind(target) : target[key];
          },
        });
      },
    };
    await expect(grantOutstandingLevelGifts(userId, { database: broken })).rejects.toMatchObject({
      code: 'REVIEW_GIFT_FAILURE',
    });
    expect(await balance()).toBe(0);
    expect(await receiptCount()).toBe(0);
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(510000);
    expect((await grantOutstandingLevelGifts(userId)).creditedTokens).toBe(0);
    expect(await balance()).toBe(510000);
    expect(await receiptCount()).toBe(5);
  });
  it('mixed actual charges and repeated concurrent settlements preserve the permanent wallet exactly', async () => {
    vi.stubEnv('AI_DAILY_QUOTA_MODE', 'off');
    await grantOutstandingLevelGifts(userId);
    const handles = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        quota.reserve({}, { userId, userRole: 'user', requestId: 'wallet-review-' + i, reserveTokens: 20000 }),
      ),
    );
    expect(handles.every((handle) => !handle.blocked)).toBe(true);
    expect(await balance()).toBe(0);
    const actual = [0, 1000, 2000, 3000, 4000, 5000];
    await Promise.all(handles.map((handle, i) => quota.reconcile(handle, actual[i])));
    await Promise.all(handles.map((handle, i) => quota.reconcile(handle, actual[i])));
    expect(await balance()).toBe(105000);
    expect(await receiptCount()).toBe(1);
  });
  it('backfill fails closed when a receipt changes after preview, without issuing later levels', async () => {
    await grantOutstandingLevelGifts(userId);
    await expect(
      runAiLevelGiftBackfill({
        database: state.db,
        apply: true,
        beforeApply: async () => {
          await state.db.query('UPDATE user_growth SET exp=2700 WHERE user_id=?', [userId]);
          await state.db.query('UPDATE ai_bonus_ledger SET amount_tokens=1 WHERE user_id=?', [userId]);
        },
      }),
    ).rejects.toMatchObject({ code: 'AI_LEVEL_GIFT_RECEIPT_INVALID' });
    expect(await balance()).toBe(120000);
    expect(await receiptCount()).toBe(1);
  });
  it('reports root actual usage against actual reserved amount and excludes platform repair', async () => {
    const id = randomUUID();
    const key = '1'.repeat(64);
    await state.db.query(
      `INSERT INTO ai_token_reservations
      (reservation_key,period_key,status,subjects_json,reserved_tokens) VALUES (?,'20261106','reconciled',?,1000)`,
      [key, JSON.stringify([{ type: 'user', key: userId, reservedTokens: 100 }])],
    );
    await state.db.query(
      `INSERT INTO ai_executions
      (id,request_id,actor_user_id,subject_user_id,billing_policy,surface,task_type,skill_id,status,model_called,quota_reservation_key)
      VALUES (?, ?, ?, ?, 'user', 'test', 'skill_note_transform_text', 'note.transform_text', 'success', 1, ?)`,
      [id, randomUUID(), userId, userId, key],
    );
    for (const [scope, tokens] of [
      ['user', 70],
      ['user', 50],
      ['platform', 900],
    ]) {
      await state.db.query(
        `INSERT INTO ai_provider_spans
        (id,execution_id,trace_id,stage,task_type,kind,billing_scope,status,usage_status,total_tokens)
        VALUES (?,?,?,'model_generation','test','complete',?,'success','reported',?)`,
        [randomUUID(), id, randomUUID(), scope, tokens],
      );
    }
    const result = await generateReservationReport(state.db);
    expect(result).toMatchObject({
      executions: 1,
      missingReservations: 0,
      extraTokensTotal: 20,
      groups: [{ samples: 1, exceedances: 1, extraTokens: 20, inputScale: 'unknown', observationalOnly: true }],
    });
    expect(JSON.stringify(result)).not.toContain(userId);
  });
});
