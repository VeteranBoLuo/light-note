import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { createFormsService } from './service.js';
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
    await pool.query('CREATE TABLE user(id VARCHAR(255) PRIMARY KEY,role VARCHAR(32),del_flag INT)');
    await pool.query(
      'CREATE TABLE tag(id VARCHAR(255) PRIMARY KEY,user_id VARCHAR(255),del_flag INT) CHARACTER SET utf8 COLLATE utf8_general_ci',
    );
    await pool.query(
      'CREATE TABLE security_account_restrictions(user_id VARCHAR(255),restriction_type VARCHAR(32),status VARCHAR(32),expires_at DATETIME)',
    );
    vi.stubEnv('COLLECTION_FORMS_IDENTITY_SECRET', 'test-only-collection-identity-secret-000000');
    for (const migration of ['20260923_collection_forms.sql', '20260924_collection_submission_identity.sql'])
      for (const sql of (await readFile(new URL('../../migrations/' + migration, import.meta.url), 'utf8'))
        .replace(/^--.*$/gm, '')
        .split(';')
        .filter((s) => s.trim()))
        await pool.query(sql);
    await pool.query("INSERT INTO user VALUES ('u','user',0),('other','user',0)");
    await pool.query("INSERT INTO tag VALUES ('t','u',0)");
  });
  beforeEach(async () => {
    await pool.query('DELETE FROM collection_forms');
    await pool.query('DELETE FROM security_account_restrictions');
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
