import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createFormsService } from './service.js';
import { POINTS_GRANT_OPERATIONS_TABLE_SQL } from '../growthCenterSchema.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'collections_' + randomUUID().replaceAll('-', '');
let admin, pool, service;
const definition = {
  title: '反馈',
  description: '',
  successMessage: '谢谢',
  questions: [
    {
      id: 'choice',
      title: '选择',
      type: 'multiple',
      required: true,
      options: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
    },
    { id: 'rating', title: '评分', type: 'rating', required: false, options: [] },
  ],
};
async function published(policy = 'multiple') {
  const { id } = await service.create('u', { definition: { ...definition, submissionPolicy: policy }, tagIds: ['t'] });
  await service.action('u', id, { action: 'publish', version: 1 });
  // Explicit historical fixture: production creation no longer allows multiple submissions.
  if (policy === 'multiple')
    await pool.query(
      "UPDATE collection_forms SET definition=JSON_SET(definition, '$.submissionPolicy', 'multiple') WHERE id=?",
      [id],
    );
  return service.get('u', id);
}
describe.skipIf(!socketPath)('公开收集 MySQL 原子性和统计', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Isolated socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[r]] = await admin.query('SELECT @@global.skip_networking isolated');
    if (Number(r.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    pool = mysql.createPool({
      socketPath,
      user: 'root',
      database: schema,
      connectionLimit: 8,
      timezone: 'Z',
      namedPlaceholders: true,
    });
    service = createFormsService(pool);
    await pool.query(
      "CREATE TABLE user(id VARCHAR(255) PRIMARY KEY,role VARCHAR(32),del_flag INT,alias VARCHAR(255) NOT NULL DEFAULT '')",
    );
    await pool.query(POINTS_GRANT_OPERATIONS_TABLE_SQL);
    // Exercise the explicit upgrade from the historical receipt table, not just a fresh schema.
    await pool.query('ALTER TABLE points_grant_operations DROP INDEX idx_points_grant_request_status');
    await pool.query('CREATE TABLE user_growth(user_id VARCHAR(64) PRIMARY KEY,points BIGINT NOT NULL DEFAULT 0)');
    await pool.query(
      'CREATE TABLE points_log(id BIGINT AUTO_INCREMENT PRIMARY KEY,user_id VARCHAR(64),delta BIGINT,reason VARCHAR(32),ref VARCHAR(64),policy_version VARCHAR(32),meta JSON,KEY idx_user_reason_ref(user_id,reason,ref))',
    );
    await pool.query(`CREATE TABLE notification (
      id CHAR(36) PRIMARY KEY, user_id VARCHAR(255) NOT NULL, type VARCHAR(32) NOT NULL,
      title VARCHAR(255) NOT NULL, content TEXT, link VARCHAR(255), meta JSON,
      batch_id CHAR(36), source_type VARCHAR(32), source_id VARCHAR(64),
      is_read TINYINT NOT NULL DEFAULT 0, del_flag TINYINT NOT NULL DEFAULT 0,
      browser_push_pending TINYINT NOT NULL DEFAULT 0, browser_push_created_at DATETIME(6),
      UNIQUE KEY uk_notification_source (user_id, source_type, source_id)
    )`);
    await pool.query(
      'CREATE TABLE tag(id VARCHAR(255) PRIMARY KEY,user_id VARCHAR(255),del_flag INT) CHARACTER SET utf8 COLLATE utf8_general_ci',
    );
    await pool.query(
      'CREATE TABLE security_account_restrictions(user_id VARCHAR(255),restriction_type VARCHAR(32),status VARCHAR(32),expires_at DATETIME)',
    );
    vi.stubEnv('COLLECTION_FORMS_IDENTITY_SECRET', 'test-only-collection-identity-secret-000000');
    for (const migration of [
      '20260923_collection_forms.sql',
      '20260924_collection_submission_identity.sql',
      '20261019_collection_member_rewards.sql',
      '20261019_collection_member_rewards.sql',
    ])
      for (const sql of (await readFile(new URL('../../migrations/' + migration, import.meta.url), 'utf8'))
        .replace(/^--.*$/gm, '')
        .split(';')
        .filter((s) => s.trim()))
        await pool.query(sql);
    await pool.query(
      "INSERT INTO user(id,role,del_flag) VALUES ('u','user',0),('other','user',0),('root-owner','root',0),('member','user',0),('another','user',0),('third','test',0),('guest','visitor',0),('disabled','user',1)",
    );
    await pool.query("UPDATE user SET alias='参与者' WHERE id='member'");
    await pool.query("INSERT INTO tag VALUES ('t','u',0)");
  });
  beforeEach(async () => {
    await pool.query('DELETE FROM collection_forms');
    await pool.query('DELETE FROM security_account_restrictions');
    await pool.query('DELETE FROM points_log');
    await pool.query('DELETE FROM points_grant_operations');
    await pool.query('DELETE FROM user_growth');
    await pool.query('DELETE FROM notification');
    await pool.query("UPDATE user SET role='root' WHERE id='root-owner'");
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await pool?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  it('并发重试只入库一次；关闭后同请求仍返回原回执', async () => {
    const f = await published(),
      input = { requestKey: randomUUID(), answers: { choice: ['b', 'a', 'b'], rating: 4 } };
    const receipts = await Promise.all(Array.from({ length: 8 }, () => service.submit(f.public_id, input)));
    expect(new Set(receipts.map((r) => r.receipt)).size).toBe(1);
    await service.action('u', f.id, { action: 'end', version: f.version });
    expect(await service.submit(f.public_id, input)).toEqual(receipts[0]);
    await expect(service.submit(f.public_id, { ...input, requestKey: randomUUID() })).rejects.toThrow('结束');
    await expect(service.submit(f.public_id, { ...input, answers: { choice: ['a'] } })).rejects.toMatchObject({
      status: 409,
    });
    expect((await service.responses('u', f.id)).total).toBe(1);
  });
  it('普通匿名表单不读取任何登录会话', async () => {
    const f = await published();
    const resolver = vi.fn(async () => {
      throw new Error('should not inspect sessions');
    });
    await service.publicForm(f.public_id, null, resolver);
    await service.submit(f.public_id, { requestKey: randomUUID(), answers: { choice: ['a'] } }, null, resolver);
    expect(resolver).not.toHaveBeenCalled();
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(0);
  });
  it('成员列与发奖索引满足对应的只读 Schema 断言', async () => {
    const source = await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const statements = source
      .replace(/^--.*$/gm, '')
      .split(';')
      .filter(
        (sql) =>
          sql.includes("'missing_collection_identity_column'") || sql.includes("'collection_member_reward_index'"),
      );
    expect(statements).toHaveLength(2);
    for (const sql of statements) expect((await pool.query(sql))[0]).toEqual([]);
  });
  async function memberForm(reward = { points: 20, maxRecipients: 100 }) {
    const { id } = await service.create('root-owner', { definition: { ...definition, membersOnly: true, reward } });
    await service.action('root-owner', id, { action: 'publish', version: 1 });
    return service.get('root-owner', id);
  }
  const account =
    (id = 'member') =>
    async () => ({ id });
  const memberInput = (id = 'member', extra = {}) => ({
    requestKey: randomUUID(),
    answers: { choice: ['a'] },
    expectedAccountId: id,
    ...extra,
  });
  it('仅 root 可创建和配置特殊表单，发布后锁定规则，复制关闭奖励', async () => {
    await expect(service.create('u', { definition: { ...definition, membersOnly: true } })).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      service.create('u', { definition: { ...definition, reward: { points: 20, maxRecipients: 2 } } }),
    ).rejects.toMatchObject({ status: 403 });
    const plain = await service.create('u', { definition });
    await expect(
      service.update('u', plain.id, { version: 1, definition: { ...definition, membersOnly: true } }),
    ).rejects.toMatchObject({ status: 403 });
    const f = await memberForm();
    for (const change of [
      { membersOnly: false, reward: null },
      { reward: { points: 30, maxRecipients: 100 } },
      { reward: { points: 20, maxRecipients: 101 } },
    ])
      await expect(
        service.update('root-owner', f.id, { version: f.version, definition: { ...f.definition, ...change } }),
      ).rejects.toThrow('规则已锁定');
    const copy = await service.action('root-owner', f.id, { action: 'copy' });
    expect((await service.get('root-owner', copy.id)).definition).toMatchObject({ membersOnly: true, reward: null });
    await pool.query("UPDATE user SET role='user' WHERE id='root-owner'");
    await expect(service.publicForm(f.public_id, null, account())).rejects.toMatchObject({ status: 404 });
    await expect(service.submit(f.public_id, memberInput(), null, account())).rejects.toMatchObject({ status: 403 });
  });
  it('登录、实时账号状态、必填项与账号切换校验均由服务端执行', async () => {
    const f = await memberForm();
    expect(await service.publicForm(f.public_id)).toMatchObject({
      requiresLogin: true,
      account: null,
      mySubmission: null,
    });
    await expect(service.submit(f.public_id, memberInput())).rejects.toMatchObject({ status: 401 });
    for (const id of ['guest', 'disabled', 'missing'])
      await expect(service.submit(f.public_id, memberInput(id), null, account(id))).rejects.toMatchObject({
        status: 403,
      });
    await expect(service.submit(f.public_id, memberInput('another'), null, account())).rejects.toMatchObject({
      status: 409,
      field: 'account',
    });
    await expect(service.submit(f.public_id, memberInput('member', { answers: {} }), null, account())).rejects.toThrow(
      '请填写此题',
    );
    await pool.query("INSERT INTO security_account_restrictions VALUES ('member','write_lock','active',NULL)");
    await expect(service.submit(f.public_id, memberInput(), null, account())).rejects.toMatchObject({ status: 423 });
    expect((await service.responses('root-owner', f.id)).total).toBe(0);
    expect((await pool.query('SELECT * FROM points_log'))[0]).toHaveLength(0);
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(0);
  });
  it('跨设备、并发提交和旧请求重放只留一份回答、奖励和到账通知各一次', async () => {
    const f = await memberForm();
    const firstInput = memberInput();
    const receipts = await Promise.all(
      Array.from({ length: 8 }, () => service.submit(f.public_id, firstInput, randomUUID(), account())),
    );
    expect(receipts.every((r) => r.receipt === receipts[0].receipt)).toBe(true);
    expect(receipts[0].reward).toEqual({ points: 20, received: true });
    await Promise.all(Array.from({ length: 4 }, () => service.submit(f.public_id, memberInput(), null, account())));
    const edit = memberInput('member', { answers: { choice: ['b'] }, expectedReceipt: receipts[0].receipt });
    const updated = await service.submit(f.public_id, edit, 'another-device', account());
    expect(updated).toMatchObject({ receipt: receipts[0].receipt, outcome: 'updated', reward: { points: 20 } });
    await service.update('root-owner', f.id, { version: f.version, definition: { ...f.definition, title: '新标题' } });
    expect(await service.submit(f.public_id, firstInput, null, account())).toEqual(receipts[0]);
    const mine = await service.publicForm(f.public_id, null, account());
    expect(mine).toMatchObject({
      account: { id: 'member' },
      requiresLogin: false,
      reward: { received: true },
      mySubmission: { answers: edit.answers },
    });
    expect((await service.publicForm(f.public_id, null, account('another'))).mySubmission).toBeNull();
    const page = await service.responses('root-owner', f.id);
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({
      respondent_user_id: 'member',
      respondent_alias: '参与者',
      reward_points: 20,
    });
    expect((await service.get('root-owner', f.id)).rewardSummary).toEqual({ recipients: 1, totalPoints: 20 });
    expect((await pool.query("SELECT points FROM user_growth WHERE user_id='member'"))[0][0].points).toBe(20);
    expect((await pool.query('SELECT * FROM points_log'))[0]).toHaveLength(1);
    const [notices] = await pool.query('SELECT * FROM notification');
    expect(notices).toHaveLength(1);
    expect(notices[0]).toMatchObject({
      user_id: 'member',
      type: 'collection_form_reward',
      title: '「反馈」奖励已到账',
      content: '你提交的「反馈」已获得 20 积分，奖励已到账。',
      link: '/growth?section=rewards&reward=ledger',
      source_type: 'collection_form_reward',
      source_id: f.id,
      is_read: 0,
    });
    expect(notices[0].meta).toEqual({ formTitle: '反馈', points: 20 });
    expect(notices[0].browser_push_created_at).not.toBeNull();
    await pool.query('UPDATE notification SET is_read=1,del_flag=1');
    await service.mark('root-owner', f.id, { action: 'spam', ids: [receipts[0].receipt] });
    await pool.query('DELETE FROM collection_submissions WHERE id=?', [receipts[0].receipt]);
    await service.submit(f.public_id, memberInput(), null, account());
    expect((await pool.query('SELECT * FROM points_log'))[0]).toHaveLength(1);
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(1);
    expect((await pool.query('SELECT del_flag FROM notification'))[0][0].del_flag).toBe(1);
  });
  it('仅登录限制可以不发奖，且不依赖匿名 Cookie 或匿名密钥', async () => {
    const f = await memberForm(null);
    vi.stubEnv('COLLECTION_FORMS_IDENTITY_SECRET', '');
    try {
      expect((await service.publicForm(f.public_id, null, account())).requiresLogin).toBe(false);
      expect(await service.submit(f.public_id, memberInput(), null, account())).not.toHaveProperty('reward');
      expect((await pool.query('SELECT * FROM points_log'))[0]).toHaveLength(0);
      expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(0);
    } finally {
      vi.stubEnv('COLLECTION_FORMS_IDENTITY_SECRET', 'test-only-collection-identity-secret-000000');
    }
  });
  it('并发竞争最后名额不会超发，自动暂停后重试仍成功，删除表单保留账本', async () => {
    const f = await memberForm({ points: 20, maxRecipients: 2 });
    const ids = ['member', 'another', 'third'];
    const inputs = ids.map((id) => memberInput(id));
    const results = await Promise.allSettled(
      ids.map((id, i) => service.submit(f.public_id, inputs[i], null, account(id))),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(2);
    const paused = await service.get('root-owner', f.id);
    expect(paused).toMatchObject({ status: 'paused', rewardSummary: { recipients: 2, totalPoints: 40 } });
    for (let i = 0; i < results.length; i++)
      if (results[i].status === 'fulfilled')
        expect(await service.submit(f.public_id, inputs[i], null, account(ids[i]))).toEqual(results[i].value);
    await expect(service.action('root-owner', f.id, { action: 'resume', version: paused.version })).rejects.toThrow(
      '名额已用尽',
    );
    await service.action('root-owner', f.id, { action: 'delete', version: paused.version });
    expect((await pool.query('SELECT * FROM points_grant_operations'))[0]).toHaveLength(2);
    expect((await pool.query('SELECT * FROM points_log'))[0]).toHaveLength(2);
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(2);
  });
  it('积分写入失败整体回滚，使用原请求重试可正常保存并到账', async () => {
    const f = await memberForm({ points: 20, maxRecipients: 1 });
    const input = memberInput();
    await pool.query(
      "CREATE TRIGGER collection_reward_fail BEFORE INSERT ON points_log FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='reward failure'",
    );
    try {
      await expect(service.submit(f.public_id, input, null, account())).rejects.toThrow('reward failure');
    } finally {
      await pool.query('DROP TRIGGER collection_reward_fail');
    }
    expect((await service.responses('root-owner', f.id)).total).toBe(0);
    expect((await pool.query('SELECT * FROM points_grant_operations'))[0]).toHaveLength(0);
    expect((await pool.query('SELECT * FROM user_growth'))[0]).toHaveLength(0);
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(0);
    expect((await service.get('root-owner', f.id)).status).toBe('collecting');
    expect((await service.submit(f.public_id, input, null, account())).reward).toEqual({ points: 20, received: true });
  });
  it('到账通知写入失败时整体回滚，同一请求重试后积分和通知各一次', async () => {
    const f = await memberForm({ points: 20, maxRecipients: 1 });
    const input = memberInput();
    await pool.query(
      "CREATE TRIGGER collection_notice_fail BEFORE INSERT ON notification FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='notice failure'",
    );
    try {
      await expect(service.submit(f.public_id, input, null, account())).rejects.toThrow('notice failure');
    } finally {
      await pool.query('DROP TRIGGER collection_notice_fail');
    }
    for (const table of [
      'collection_submissions',
      'collection_submission_requests',
      'points_log',
      'points_grant_operations',
      'user_growth',
      'notification',
    ])
      expect((await pool.query(`SELECT * FROM ${table}`))[0]).toHaveLength(0);
    expect((await service.get('root-owner', f.id)).status).toBe('collecting');
    const result = await service.submit(f.public_id, input, null, account());
    expect(await service.submit(f.public_id, input, null, account())).toEqual(result);
    expect((await pool.query('SELECT points FROM user_growth'))[0][0].points).toBe(20);
    expect((await pool.query('SELECT * FROM points_log'))[0]).toHaveLength(1);
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(1);
  });
  it('同一账号参与不同表单分别奖励并通知', async () => {
    const first = await memberForm();
    const second = await memberForm({ points: 30, maxRecipients: 2 });
    for (const f of [first, second]) await service.submit(f.public_id, memberInput(), null, account());
    expect((await pool.query('SELECT points FROM user_growth'))[0][0].points).toBe(50);
    expect((await pool.query('SELECT * FROM notification'))[0]).toHaveLength(2);
  });
  it('公开填写允许新请求再次提交；统计按人次去重选项并排除垃圾', async () => {
    const f = await published();
    const first = await service.submit(f.public_id, {
      requestKey: randomUUID(),
      answers: { choice: ['a', 'b', 'a'], rating: 5 },
    });
    await service.submit(f.public_id, { requestKey: randomUUID(), answers: { choice: ['a'], rating: 1 } });
    let stats = await service.statistics('u', f.id);
    expect(Number(stats.summary.valid)).toBe(2);
    expect(stats.questions[0].choices.find((c) => c.option_id === 'a').count).toBe(2);
    expect(stats.questions[1].average).toBe(3);
    await service.mark('u', f.id, { action: 'spam', ids: [first.receipt] });
    stats = await service.statistics('u', f.id);
    expect(Number(stats.summary.valid)).toBe(1);
    expect(stats.questions[1].average).toBe(1);
  });
  it('冻结题目、乐观版本、所有权和复制隔离', async () => {
    const f = await published();
    await service.update('u', f.id, {
      version: f.version,
      definition: { ...definition, title: '新标题' },
      tagIds: ['t'],
    });
    await expect(service.update('u', f.id, { version: f.version, definition, tagIds: [] })).rejects.toMatchObject({
      status: 409,
    });
    await expect(service.get('other', f.id)).rejects.toMatchObject({ status: 404 });
    await expect(
      service.update('u', f.id, { version: f.version + 1, definition: { ...definition, questions: [] }, tagIds: [] }),
    ).rejects.toThrow('锁定');
    const copy = await service.action('u', f.id, { action: 'copy' });
    const cloned = await service.get('u', copy.id);
    expect(cloned.status).toBe('draft');
    expect(cloned.public_id).not.toBe(f.public_id);
    expect((await service.responses('u', copy.id)).total).toBe(0);
  });
  it('暂停与提交串行化、恢复后可以填写、删除级联无残留', async () => {
    const f = await published();
    const result = await Promise.allSettled([
      service.action('u', f.id, { action: 'pause', version: f.version }),
      service.submit(f.public_id, { requestKey: randomUUID(), answers: { choice: ['a'] } }),
    ]);
    expect(result[0].status).toBe('fulfilled');
    await expect(service.submit(f.public_id, { requestKey: randomUUID(), answers: { choice: ['a'] } })).rejects.toThrow(
      '开放',
    );
    const paused = await service.get('u', f.id);
    await service.action('u', f.id, { action: 'delete', version: paused.version });
    for (const table of [
      'collection_submission_requests',
      'collection_submissions',
      'collection_answers',
      'collection_choices',
      'collection_form_tags',
    ]) {
      const [[r]] = await pool.query(`SELECT COUNT(*) total FROM ${table}`);
      expect(r.total).toBe(0);
    }
  });
  it('停用开关和账号安全限制阻断公开收集', async () => {
    const f = await published();
    process.env.COLLECTION_FORMS_ENABLED = 'false';
    try {
      expect((await service.publicForm(f.public_id)).status).toBe('paused');
      await expect(
        service.submit(f.public_id, { requestKey: randomUUID(), answers: { choice: ['a'] } }),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      delete process.env.COLLECTION_FORMS_ENABLED;
    }
    await pool.query("INSERT INTO security_account_restrictions VALUES ('u','full_lock','active',NULL)");
    await expect(service.publicForm(f.public_id)).rejects.toMatchObject({ status: 404 });
  });
  it('匿名重复更新、并发、旧请求重放及统计保持一份', async () => {
    const f = await published('replace');
    const identity = 'a'.repeat(48);
    const firstInput = { requestKey: randomUUID(), answers: { choice: ['a'], rating: 1 } };
    const first = await service.submit(f.public_id, firstInput, identity);
    const created = (await service.responses('u', f.id)).items[0].created_at;
    await service.mark('u', f.id, { action: 'processed', ids: [first.receipt] });
    await service.mark('u', f.id, { action: 'note', ids: [first.receipt], note: '保留备注' });
    const next = { requestKey: randomUUID(), answers: { choice: ['b'], rating: 5 } };
    const receipts = await Promise.all(Array.from({ length: 8 }, () => service.submit(f.public_id, next, identity)));
    expect(receipts.every((r) => r.receipt === first.receipt && r.outcome === 'updated')).toBe(true);
    expect(await service.submit(f.public_id, firstInput, identity)).toEqual(first);
    const result = await service.responses('u', f.id);
    expect(result.total).toBe(1);
    expect(result.items[0]).toMatchObject({
      answers: { choice: ['b'], rating: 5 },
      processed: 0,
      is_read: 0,
      private_note: '保留备注',
      created_at: created,
    });
    expect(result.items[0]).not.toHaveProperty('respondent_hash');
    const stats = await service.statistics('u', f.id);
    expect(Number(stats.summary.valid)).toBe(1);
    expect(stats.questions[0].choices.find((c) => c.option_id === 'a')?.count ?? 0).toBe(0);
    expect(stats.questions[0].choices.find((c) => c.option_id === 'b').count).toBe(1);
    expect(stats.questions[1].average).toBe(5);
    expect((await service.publicForm(f.public_id, identity)).mySubmission.answers).toEqual(next.answers);
    expect((await service.publicForm(f.public_id, 'b'.repeat(48))).mySubmission).toBeNull();
    const exported = [];
    for await (const row of service.exportRows('u', f.id)) exported.push(row);
    expect(exported).toHaveLength(1);
    expect(exported[0].answers).toEqual(next.answers);
    await expect(service.submit(f.public_id, firstInput, 'b'.repeat(48))).rejects.toMatchObject({ status: 409 });
    await expect(service.submit(f.public_id, next)).rejects.toThrow('Cookie');
    const newBrowser = await Promise.all(
      Array.from({ length: 8 }, () =>
        service.submit(f.public_id, { ...next, requestKey: randomUUID() }, 'b'.repeat(48)),
      ),
    );
    expect(new Set(newBrowser.map((r) => r.receipt)).size).toBe(1);
    expect((await service.responses('u', f.id)).total).toBe(2);
  });
  it('相同内容不重置处理状态，修改保留垃圾标记，已读水位覆盖更新时间', async () => {
    const f = await published('replace'),
      identity = 'a'.repeat(48);
    const input = { requestKey: randomUUID(), answers: { choice: ['a'] } };
    const first = await service.submit(f.public_id, input, identity);
    await service.mark('u', f.id, { action: 'processed', ids: [first.receipt] });
    expect((await service.submit(f.public_id, { ...input, requestKey: randomUUID() }, identity)).outcome).toBe(
      'unchanged',
    );
    expect((await service.responses('u', f.id)).items[0].processed).toBe(1);
    await service.mark('u', f.id, { action: 'spam', ids: [first.receipt] });
    await service.submit(f.public_id, { requestKey: randomUUID(), answers: { choice: ['b'] } }, identity);
    const rows = await service.responses('u', f.id, { state: 'all' });
    expect(rows.items[0].spam).toBe(1);
    await pool.query('UPDATE collection_submissions SET created_at=?,updated_at=? WHERE id=?', [
      '2026-01-01',
      '2026-01-03',
      first.receipt,
    ]);
    await service.mark('u', f.id, { action: 'readAll', before: '2026-01-02T00:00:00Z' });
    expect((await service.responses('u', f.id, { state: 'all' })).items[0].is_read).toBe(0);
    await expect(
      service.update('u', f.id, {
        version: f.version,
        definition: { ...f.definition, submissionPolicy: 'multiple' },
        tagIds: [],
      }),
    ).rejects.toThrow('规则已锁定');
    await service.action('u', f.id, { action: 'pause', version: f.version });
    await expect(service.submit(f.public_id, { ...input, requestKey: randomUUID() }, identity)).rejects.toMatchObject({
      status: 409,
    });
  });
  it('更新明细失败时回滚原答案和回执，迁移重跑保留旧提交幂等', async () => {
    const f = await published('replace'),
      identity = 'a'.repeat(48);
    const input = { requestKey: randomUUID(), answers: { choice: ['a'], rating: 1 } };
    const original = await service.submit(f.public_id, input, identity);
    await pool.query(
      "CREATE TRIGGER collection_test_fail BEFORE INSERT ON collection_answers FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='test failure'",
    );
    const edit = { requestKey: randomUUID(), answers: { choice: ['b'], rating: 5 } };
    try {
      await expect(service.submit(f.public_id, edit, identity)).rejects.toThrow('test failure');
    } finally {
      await pool.query('DROP TRIGGER collection_test_fail');
    }
    expect((await service.publicForm(f.public_id, identity)).mySubmission.answers).toEqual(input.answers);
    const [[r]] = await pool.query('SELECT COUNT(*) total FROM collection_submission_requests WHERE request_key=?', [
      edit.requestKey,
    ]);
    expect(r.total).toBe(0);
    // Simulate a pre-migration request row: no dedicated receipt exists yet.
    await pool.query('DELETE FROM collection_submission_requests WHERE submission_id=?', [original.receipt]);
    const migration = await readFile(
      new URL('../../migrations/20260924_collection_submission_identity.sql', import.meta.url),
      'utf8',
    );
    for (let n = 0; n < 2; n++)
      for (const sql of migration
        .replace(/^--.*$/gm, '')
        .split(';')
        .filter((s) => s.trim()))
        await pool.query(sql);
    expect(await service.submit(f.public_id, input, identity)).toEqual(original);
    expect((await service.responses('u', f.id)).total).toBe(1);
  });
  it('万份提交的全量聚合与分页导出不依赖当前页', async () => {
    const f = await published();
    for (let offset = 0; offset < 10000; offset += 500) {
      const submissions = [],
        answers = [],
        choices = [];
      for (let i = offset; i < offset + 500; i++) {
        const sid = randomUUID(),
          aid = randomUUID();
        submissions.push([
          sid,
          f.id,
          randomUUID(),
          '0'.repeat(64),
          JSON.stringify({ choice: ['a'], rating: (i % 5) + 1 }),
          '2026-09-22 16:00:00.000',
        ]);
        answers.push([aid, sid, f.id, 'choice', null], [randomUUID(), sid, f.id, 'rating', (i % 5) + 1]);
        choices.push([randomUUID(), aid, 'a']);
      }
      await pool.query(
        'INSERT INTO collection_submissions(id,form_id,request_key,payload_hash,answers,created_at) VALUES ?',
        [submissions],
      );
      await pool.query('INSERT INTO collection_answers(id,submission_id,form_id,question_id,number_value) VALUES ?', [
        answers,
      ]);
      await pool.query('INSERT INTO collection_choices(id,answer_id,option_id) VALUES ?', [choices]);
    }
    const start = performance.now();
    const stats = await service.statistics('u', f.id, { from: '2026-09-23', to: '2026-09-23' });
    const elapsed = performance.now() - start;
    expect(Number(stats.summary.valid)).toBe(10000);
    expect(stats.trend[0].day).toBe('2026-09-23');
    expect(stats.questions[1].average).toBe(3);
    expect((await service.responses('u', f.id, { page: 2 })).items).toHaveLength(30);
    let count = 0;
    for await (const row of service.exportRows('u', f.id, {})) {
      expect(row.answers.choice).toEqual(['a']);
      count++;
    }
    expect(count).toBe(10000);
    console.log('[collection performance] 10000 submissions aggregate ms=%s', Math.round(elapsed));
  }, 15000);
  it('新建、复制和旧草稿首次发布均强制保留最新一份，历史发布规则不变', async () => {
    const { id } = await service.create('u', { definition: { ...definition, submissionPolicy: 'multiple' } });
    expect((await service.get('u', id)).definition.submissionPolicy).toBe('replace');
    await service.update('u', id, { version: 1, definition: { ...definition, submissionPolicy: 'multiple' } });
    expect((await service.get('u', id)).definition.submissionPolicy).toBe('replace');
    await pool.query(
      "UPDATE collection_forms SET definition=JSON_SET(definition, '$.submissionPolicy', 'multiple') WHERE id=?",
      [id],
    );
    await service.action('u', id, { action: 'publish', version: 2 });
    expect((await service.get('u', id)).definition.submissionPolicy).toBe('replace');
    const legacy = await published('multiple');
    const copy = await service.action('u', legacy.id, { action: 'copy' });
    expect((await service.get('u', copy.id)).definition.submissionPolicy).toBe('replace');
    expect((await service.get('u', legacy.id)).definition.submissionPolicy).toBe('multiple');
  });
  it('修改指定原记录时，身份变化不能退化为新增', async () => {
    const f = await published('replace');
    const original = await service.submit(
      f.public_id,
      { requestKey: randomUUID(), answers: { choice: ['a'] } },
      'browser-a',
    );
    await expect(
      service.submit(
        f.public_id,
        { requestKey: randomUUID(), expectedReceipt: original.receipt, answers: { choice: ['b'] } },
        'browser-b',
      ),
    ).rejects.toThrow('未能识别之前的提交');
    const updated = await service.submit(
      f.public_id,
      { requestKey: randomUUID(), expectedReceipt: original.receipt, answers: { choice: ['b'] } },
      'browser-a',
    );
    expect(updated).toEqual({ receipt: original.receipt, outcome: 'updated' });
    expect(Number((await service.statistics('u', f.id)).summary.valid)).toBe(1);
  });
  it('题目、选项和幂等键区分大小写，并使用标签存量字符集', async () => {
    const d = {
      ...definition,
      questions: [
        {
          id: 'Q',
          type: 'multiple',
          title: '选择',
          required: true,
          options: [
            { id: 'a', label: '一' },
            { id: 'A', label: '二' },
          ],
        },
      ],
    };
    const { id } = await service.create('u', { definition: d, tagIds: ['t'] });
    await service.action('u', id, { action: 'publish', version: 1 });
    const f = await service.get('u', id);
    await pool.query(
      "UPDATE collection_forms SET definition=JSON_SET(definition, '$.submissionPolicy', 'multiple') WHERE id=?",
      [id],
    );
    for (const key of ['abcdefghijklmnop', 'ABCDEFGHIJKLMNOP'])
      await service.submit(f.public_id, { requestKey: key, answers: { Q: ['a', 'A'] } });
    expect(await service.list('u', { tagId: 't' })).toHaveLength(1);
    const stats = await service.statistics('u', id);
    expect(stats.questions[0].choices).toHaveLength(2);
    expect(stats.questions[0].choices.every((c) => c.count === 2)).toBe(true);
  });
});
