import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
vi.mock('./sourceVersions.js', () => ({
  resolveExtractionSourceVersions: async ({ resourceRefs }) => resourceRefs.map((ref) => ({ ...ref, version: 'v1' })),
}));
import { assertExtractionSchema, ensureExtractionSchema, extractionSchemaReady, requireExtractionSchema } from './schema.js';
import {
  createExtraction,
  readExtraction,
  actOnExtraction,
  reviewExtractionRecord,
  recordSnapshot,
  deleteExtraction,
  nextPendingCell,
  readRecords,
} from './service.js';
import { claimExtraction, commitExtractionResult, runSingleExtractionJob } from './worker.js';
import { normalizePlan } from './domain.js';
import { validateRecords } from './contract.js';
import { buildExtractionExport } from './export.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET,
  schema = 'extraction_' + randomUUID().replaceAll('-', '');
let admin, db;
const plan = normalizePlan({
  recordDefinition: '每个产品',
  fields: [{ key: 'name', label: '名称', type: 'text', rule: '原名' }],
});
const input = () => ({
  requestId: randomUUID(),
  title: '相机表',
  goal: '提取产品',
  resourceRefs: [{ type: 'note', id: 'n', version: 'v1' }],
});
const call = (fn, opts) => fn({ database: db, userId: 'u', ...opts });
async function ready() {
  const t = await call(createExtraction, { input: input() });
  await db.query("UPDATE toolbox_extractions SET status='preview',phase='sample',plan_json=? WHERE id=?", [
    JSON.stringify(plan),
    t.id,
  ]);
  await db.query(
    "UPDATE toolbox_extraction_sources SET status='ready',source_json=?,window_count=1,coverage_json=? WHERE extraction_id=?",
    [JSON.stringify({ segments: [] }), JSON.stringify({ complete: true }), t.id],
  );
  return t;
}
async function addRow(id) {
  const [[source]] = await db.query('SELECT id FROM toolbox_extraction_sources WHERE extraction_id=?', [id]);
  const payload = {
    id: 'r',
    sourceId: source.id,
    cells: [{ fieldId: 'f1', originalValue: '相机', status: 'found', evidence: [], evidenceIssues: [] }],
  };
  await db.query(
    "INSERT INTO toolbox_extraction_records (id,extraction_id,user_id,source_id,payload_json,reviews_json,published,pending_cells) VALUES ('r',?,'u',?,?, '{}',1,1)",
    [id, source.id, JSON.stringify(payload)],
  );
  return payload;
}
describe.skipIf(!socketPath)('V3 提取表 MySQL 幂等、核对和 Worker 围栏', () => {
  it('未安装只影响提取功能，显式安装后无需上线即可重新通过检查', async () => {
    const emptySchema = 'extraction_' + randomUUID().replaceAll('-', '');
    await admin.query(`CREATE DATABASE ${emptySchema}`);
    const isolated = mysql.createPool({ socketPath, user: 'root', database: emptySchema });
    let clock;
    try {
      await expect(extractionSchemaReady(isolated)).resolves.toBe(false);
      await expect(requireExtractionSchema(isolated)).rejects.toMatchObject({ code: 'EXTRACTION_SCHEMA_NOT_READY' });
      await ensureExtractionSchema(isolated);
      clock = vi.spyOn(Date, 'now').mockReturnValue(Date.now() + 31000);
      await expect(requireExtractionSchema(isolated)).resolves.toBeUndefined();
    } finally {
      clock?.mockRestore();
      await isolated.end();
      await admin.query(`DROP DATABASE ${emptySchema}`);
    }
  });
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Isolated socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[r]] = await admin.query('SELECT VERSION() version,@@global.skip_networking isolated');
    if (!/^(5\.7\.|8\.)/.test(r.version) || Number(r.isolated) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    // Match the application pool: positional object parameters must also work with named placeholders enabled.
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8, namedPlaceholders: true });
    await db.query(
      'CREATE TABLE ai_executions(id CHAR(36),request_id CHAR(36),actor_user_id VARCHAR(64),charged_tokens INT,status VARCHAR(32),quota_settlement_status VARCHAR(32))',
    );
    await db.query(
      'CREATE TABLE note(id VARCHAR(64), title TEXT,type VARCHAR(24),content LONGTEXT,create_by VARCHAR(64),del_flag INT)',
    );
    await db.query('CREATE TABLE bookmark(id VARCHAR(64),name TEXT,url TEXT,user_id VARCHAR(64),del_flag INT)');
    await db.query(
      'CREATE TABLE bookmark_snapshot(bookmark_id VARCHAR(64),user_id VARCHAR(64),url TEXT,content LONGTEXT)',
    );
    await db.query(
      'CREATE TABLE files(id VARCHAR(64),file_name TEXT,file_type VARCHAR(24),file_size INT,obs_key TEXT,create_time DATETIME,create_by VARCHAR(64),del_flag INT)',
    );
    await db.query('CREATE TABLE user(id VARCHAR(64) PRIMARY KEY,role VARCHAR(32),del_flag INT)');
    await db.query("INSERT INTO user VALUES ('u','user',0),('other','user',0)");
    const migration = await readFile(
      new URL('../../migrations/20261012_extraction_workbench.sql', import.meta.url),
      'utf8',
    );
    for (const sql of migration
      .replace(/^--.*$/gm, '')
      .split(';')
      .filter((s) => s.trim()))
      await db.query(sql);
    await ensureExtractionSchema(db);
    await assertExtractionSchema(db);
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'test');
    vi.stubEnv('TOOLBOX_EXTRACTION_ENABLED', 'true');
  });
  beforeEach(async () => {
    for (const table of [
      'toolbox_extraction_records',
      'toolbox_extraction_sources',
      'toolbox_extraction_receipts',
      'toolbox_extractions',
    ])
      await db.query(`DELETE FROM ${table}`);
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  it('帮助迁移可重复执行，并声明展示栏目', async () => {
    await db.query(
      'CREATE TABLE knowledge_base(id CHAR(36) PRIMARY KEY,title VARCHAR(255),content LONGTEXT,category VARCHAR(50),help_section VARCHAR(50),status VARCHAR(24),type VARCHAR(24),sort INT,created_by VARCHAR(64),updated_by VARCHAR(64))',
    );
    const sql = await readFile(new URL('../../migrations/20261012_extraction_help.sql', import.meta.url), 'utf8');
    const connection = await db.getConnection();
    try {
      for (let i = 0; i < 2; i++)
        for (const statement of sql
          .replace(/^--.*$/gm, '')
          .split(';')
          .filter((s) => s.trim()))
          await connection.query(statement);
      const [rows] = await connection.query('SELECT * FROM knowledge_base');
      expect(rows).toHaveLength(1);
      expect(rows[0].help_section).toBe('AI 与权益');
      expect(rows[0].content).toContain('不必自己预填字段');
    } finally {
      connection.release();
    }
  });
  it('资料内容身份识别同秒修改、归属、旧 URL 正文和原文件变化', async () => {
    const { resolveExtractionSourceVersions } = await vi.importActual('./sourceVersions.js');
    await db.query(
      "INSERT INTO note VALUES('n','标题','markdown','旧正文','u',0),('private','私密','markdown','内容','other',0)",
    );
    await db.query("INSERT INTO bookmark VALUES('b','书签','https://example.test/A','u',0)");
    await db.query(
      "INSERT INTO bookmark_snapshot VALUES('b','u','https://example.test/A','正文'),('b','other','https://example.test/A','他人正文')",
    );
    await db.query("INSERT INTO files VALUES('f','文件.txt','text/plain',10,'old',NOW(),'u',0)");
    const check = () =>
      resolveExtractionSourceVersions({
        userId: 'u',
        database: db,
        resourceRefs: [
          { type: 'note', id: 'n' },
          { type: 'note', id: 'private' },
          { type: 'bookmark', id: 'b' },
          { type: 'file', id: 'f' },
        ],
      });
    const first = await check();
    expect(first).toHaveLength(3);
    await db.query("UPDATE note SET content='同秒新正文' WHERE id='n'");
    await db.query("UPDATE bookmark SET url='https://example.test/a' WHERE id='b'");
    await db.query("UPDATE files SET obs_key='new' WHERE id='f'");
    const second = await check();
    expect(second.every((v, i) => v.version !== first[i].version)).toBe(true);
    await db.query("UPDATE bookmark_snapshot SET content='无关旧正文' WHERE bookmark_id='b'");
    expect((await check())[1].version).toBe(second[1].version);
    await db.query("UPDATE note SET del_flag=1 WHERE id='n'");
    expect(await check()).toHaveLength(2);
  });
  it('并发创建只生成一个表，身份和相同请求的内容重新校验', async () => {
    const request = input(),
      tables = await Promise.all(Array.from({ length: 6 }, () => call(createExtraction, { input: request })));
    expect(new Set(tables.map((t) => t.id)).size).toBe(1);
    const saved = await call(readExtraction, { id: tables[0].id });
    expect(saved).toMatchObject({ title: request.title, goal: request.goal, status: 'preparing' });
    expect(saved.sources).toHaveLength(1);
    expect(saved.sources[0]).toMatchObject({ type: 'note', resourceId: 'n', version: 'v1', status: 'preparing' });
    await expect(call(createExtraction, { input: { ...request, title: '另一个' } })).rejects.toMatchObject({
      status: 409,
    });
    await expect(call(readExtraction, { id: tables[0].id, userId: 'other' })).rejects.toMatchObject({ status: 404 });
  });
  it('人工空值、并发版本冲突和重试回执不会重复写入', async () => {
    const t = await ready();
    await addRow(t.id);
    await db.query("UPDATE toolbox_extractions SET phase='extract',status='completed' WHERE id=?", [t.id]);
    const edit = { requestId: randomUUID(), version: 1, action: 'review', fieldId: 'f1', value: '', checked: true };
    const result = await Promise.allSettled([
      call(reviewExtractionRecord, { id: t.id, recordId: 'r', input: edit }),
      call(reviewExtractionRecord, {
        id: t.id,
        recordId: 'r',
        input: { ...edit, requestId: randomUUID(), value: '冲突' },
      }),
    ]);
    expect(result.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(result.find((r) => r.status === 'rejected').reason.status).toBe(409);
    const saved = result.find((r) => r.status === 'fulfilled').value;
    const winning = saved.reviews.f1.value === '' ? edit : { ...edit, value: '冲突' };
    if (winning === edit)
      expect((await call(reviewExtractionRecord, { id: t.id, recordId: 'r', input: edit })).version).toBe(2);
    const snap = await call(recordSnapshot, { id: t.id });
    expect(snap.records[0].cells[0].originalValue).toBe('相机');
    expect(snap.table.dataVersion).toBe(2);
  });
  it('确认复用样例；修改提取规则才清空样例；显示名不会触发重提', async () => {
    const t = await ready();
    await addRow(t.id);
    await db.query(
      "UPDATE toolbox_extraction_sources SET processed_windows=1,status='completed' WHERE extraction_id=?",
      [t.id],
    );
    await call(actOnExtraction, {
      id: t.id,
      input: {
        requestId: randomUUID(),
        version: 1,
        action: 'extract',
        plan: { ...plan, fields: plan.fields.map((f) => ({ ...f, label: '产品' })) },
      },
    });
    expect((await call(recordSnapshot, { id: t.id })).records).toHaveLength(1);
    expect((await call(readExtraction, { id: t.id })).sources[0].processed).toBe(1);
    await expect(
      call(actOnExtraction, { id: t.id, input: { requestId: randomUUID(), version: 2, action: 'plan', plan } }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it('过期且已经外发的租约暂停；旧 Worker 不能提交；明确重试保留记录', async () => {
    const t = await ready();
    await db.query("UPDATE toolbox_extractions SET status='queued',phase='extract' WHERE id=?", [t.id]);
    const job = await claimExtraction(db);
    await db.query(
      'UPDATE toolbox_extractions SET dispatched=1,lease_until=DATE_SUB(NOW(),INTERVAL 1 SECOND) WHERE id=?',
      [t.id],
    );
    expect(await claimExtraction(db)).toBe(null);
    const state = await call(readExtraction, { id: t.id });
    expect(state.errorCode).toBe('EXTRACTION_OUTCOME_UNKNOWN');
    await expect(commitExtractionResult(job, {}, {}, { result: { records: [] } }, db)).rejects.toMatchObject({
      code: 'EXTRACTION_LEASE_LOST',
    });
    await expect(
      call(actOnExtraction, { id: t.id, input: { requestId: randomUUID(), version: state.version, action: 'resume' } }),
    ).rejects.toMatchObject({ code: 'EXTRACTION_UNCERTAIN_CONFIRMATION' });
  });
  it('删除清理表内数据，功能关闭仍允许核对和导出', async () => {
    const t = await ready();
    await addRow(t.id);
    await db.query("UPDATE toolbox_extractions SET phase='extract',status='completed' WHERE id=?", [t.id]);
    vi.stubEnv('TOOLBOX_EXTRACTION_ENABLED', 'false');
    await call(reviewExtractionRecord, {
      id: t.id,
      recordId: 'r',
      input: { requestId: randomUUID(), version: 1, action: 'review', fieldId: 'f1', value: 'A', checked: true },
    });
    expect((await call(recordSnapshot, { id: t.id })).records).toHaveLength(1);
    await call(deleteExtraction, { id: t.id, version: 1 });
    const [[count]] = await db.query('SELECT COUNT(*) total FROM toolbox_extraction_sources');
    expect(Number(count.total)).toBe(0);
    vi.stubEnv('LIGHTNOTE_RUNTIME_ENV', 'test');
    vi.stubEnv('TOOLBOX_EXTRACTION_ENABLED', 'true');
  });
  it('加法迁移与运行时结构在 MySQL 5.7 通过全部新增 Schema 断言', async () => {
    const content = await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const assertions = content
      .replace(/^--.*$/gm, '')
      .split(';')
      .filter((sql) => /AS check_name/.test(sql) && /'extraction_(?:column|index|engine)'/.test(sql));
    expect(assertions.length).toBeGreaterThan(60);
    for (const sql of assertions) {
      const [failures] = await db.query(sql);
      expect(failures, sql).toEqual([]);
    }
  });
  it('真实队列：无 AI 准备 → 建议和样例 → 复用检查点 → 暂停保存 → 继续完成，不重复发布或调用', async () => {
    const table = await call(createExtraction, { input: input() });
    const executeSkill = vi.fn(async (request, _context, options) => {
      await options.skillDependencies.beforeRequest();
      await db.query("INSERT INTO ai_executions VALUES (?,?,'u',100,'succeeded','settled')", [
        randomUUID(),
        request.requestId,
      ]);
      const source = request.input.source;
      const result = request.skillId.endsWith('_suggest')
        ? { plan }
        : {
            records: validateRecords(
              {
                records: source.segments.map((segment, segmentIndex) => ({
                  anchor: { segment: segmentIndex, quote: segment.text.slice(0, 8) },
                  cells: [
                    {
                      value: segment.text.slice(0, 8),
                      status: 'found',
                      evidence: [{ segment: segmentIndex, quote: segment.text.slice(0, 8) }],
                    },
                  ],
                })),
              },
              request.input.plan,
              source,
            ),
          };
      const state = await call(readExtraction, { id: table.id });
      if (state.phase === 'extract')
        await call(actOnExtraction, {
          id: table.id,
          input: { requestId: randomUUID(), version: state.version, action: 'pause' },
        });
      await options.commitValidatedResult({ response: { result } });
    });
    const dependencies = {
      readMaterial: async ({ id, ref }) => ({
        id,
        version: ref.version,
        title: '跨段材料',
        complete: true,
        coverage: { complete: true },
        segments: Array.from({ length: 3 }, (_, i) => ({
          id: 's' + i,
          text: `Product${i}` + ' '.repeat(1) + 'x'.repeat(6500),
          kind: 'original',
          locator: 'paragraph ' + i,
        })),
      }),
      resolveVersions: async ({ resourceRefs }) => resourceRefs,
      executeSkill,
    };
    expect(await runSingleExtractionJob('test', db, dependencies)).toBe(true);
    expect(await runSingleExtractionJob('test', db, dependencies)).toBe(true);
    expect(executeSkill).not.toHaveBeenCalled();
    let state = await call(readExtraction, { id: table.id });
    expect(state.status).toBe('ready');
    await call(actOnExtraction, {
      id: table.id,
      input: { requestId: randomUUID(), version: state.version, action: 'analyze' },
    });
    await runSingleExtractionJob('test', db, dependencies); // suggestion
    await runSingleExtractionJob('test', db, dependencies); // sample first window
    state = await call(readExtraction, { id: table.id });
    expect(state.errorCode).toBeNull();
    expect(state.status).toBe('preview');
    expect(state.sources[0].processed).toBe(1);
    expect(state.counts.pending).toBe(2);
    await call(actOnExtraction, {
      id: table.id,
      input: { requestId: randomUUID(), version: state.version, action: 'extract', plan },
    });
    await runSingleExtractionJob('test', db, dependencies); // remaining window, user pauses in flight
    state = await call(readExtraction, { id: table.id });
    expect(state.status).toBe('paused');
    expect(state.inFlight).toBe(false);
    expect(state.counts.total).toBe(3);
    expect(await runSingleExtractionJob('test', db, dependencies)).toBe(false);
    await call(actOnExtraction, {
      id: table.id,
      input: { requestId: randomUUID(), version: state.version, action: 'resume' },
    });
    await runSingleExtractionJob('test', db, dependencies);
    state = await call(readExtraction, { id: table.id });
    expect(state.status).toBe('completed');
    expect(executeSkill).toHaveBeenCalledTimes(3);
    expect(state.usage).toEqual({ calls: 3, chargedTokens: 300, unsettled: 0 });
    const snapshot = await call(recordSnapshot, { id: table.id });
    expect(new Set(snapshot.records.map((r) => r.id)).size).toBe(3);
  });
  it('检查阶段可以暂停和继续；暂停任务必须结束后才能删除', async () => {
    const t = await call(createExtraction, { input: input() });
    let state = await call(actOnExtraction, {
      id: t.id,
      input: { action: 'pause', requestId: randomUUID(), version: t.version },
    });
    await expect(call(deleteExtraction, { id: t.id, version: state.version })).rejects.toMatchObject({
      code: 'EXTRACTION_ACTIVE',
    });
    state = await call(actOnExtraction, {
      id: t.id,
      input: { action: 'resume', requestId: randomUUID(), version: state.version },
    });
    expect(state.status).toBe('preparing');
  });
  it('准备阶段续跑保留解析失败原因，结束后不能借重试复活', async () => {
    const t = await call(createExtraction, { input: input() });
    await db.query(
      "UPDATE toolbox_extraction_sources SET status='failed',error_code='EXTRACTION_NO_TEXT' WHERE extraction_id=?",
      [t.id],
    );
    let state = await call(actOnExtraction, {
      id: t.id,
      input: { action: 'pause', requestId: randomUUID(), version: t.version },
    });
    state = await call(actOnExtraction, {
      id: t.id,
      input: { action: 'resume', requestId: randomUUID(), version: state.version },
    });
    expect((await call(readExtraction, { id: t.id })).sources[0]).toMatchObject({
      status: 'failed',
      errorCode: 'EXTRACTION_NO_TEXT',
    });
    state = await call(actOnExtraction, {
      id: t.id,
      input: { action: 'end', requestId: randomUUID(), version: state.version },
    });
    await expect(
      call(actOnExtraction, {
        id: t.id,
        input: { action: 'retry_prepare', requestId: randomUUID(), version: state.version },
      }),
    ).rejects.toMatchObject({ code: 'EXTRACTION_STATE_CONFLICT' });
  });
  it('一致快照读取中发生核对，也不会混入新值或新数据版本', async () => {
    const t = await ready();
    await addRow(t.id);
    await db.query("UPDATE toolbox_extractions SET phase='extract',status='completed' WHERE id=?", [t.id]);
    let intercepted = false;
    const snapshotDatabase = {
      query: (sql, params) => db.query(sql, params),
      getConnection: async () => {
        const connection = await db.getConnection();
        return {
          beginTransaction: () => connection.beginTransaction(),
          commit: () => connection.commit(),
          rollback: () => connection.rollback(),
          release: () => connection.release(),
          query: async (sql, params) => {
            const result = await connection.query(sql, params);
            if (!intercepted && sql.startsWith('SELECT * FROM toolbox_extractions')) {
              intercepted = true;
              await call(reviewExtractionRecord, {
                id: t.id,
                recordId: 'r',
                input: {
                  requestId: randomUUID(),
                  version: 1,
                  action: 'review',
                  fieldId: 'f1',
                  value: '新值',
                  checked: true,
                },
              });
            }
            return result;
          },
        };
      },
    };
    const old = await call(recordSnapshot, { id: t.id, database: snapshotDatabase });
    expect(old.table.dataVersion).toBe(1);
    expect(old.records[0].reviews).toEqual({});
    const current = await call(recordSnapshot, { id: t.id });
    expect(current.table.dataVersion).toBe(2);
    expect(current.records[0].reviews.f1.value).toBe('新值');
  });
  it('10,000 条边界：完整筛选排序、跨页待核对与全范围 CSV 均保持来源', async () => {
    const t = await ready();
    await db.query("UPDATE toolbox_extractions SET phase='extract',status='completed' WHERE id=?", [t.id]);
    const [[source]] = await db.query('SELECT id FROM toolbox_extraction_sources WHERE extraction_id=?', [t.id]);
    for (let start = 0; start < 10000; start += 500) {
      const values = Array.from({ length: 500 }, (_, offset) => {
        const i = start + offset,
          id = String(i).padStart(24, '0'),
          payload = {
            id,
            sourceId: source.id,
            cells: [{ fieldId: 'f1', originalValue: '产品 ' + i, status: 'found', evidence: [], evidenceIssues: [] }],
          };
        return [
          id,
          t.id,
          'u',
          source.id,
          JSON.stringify(payload),
          i < 9999 ? JSON.stringify({ f1: { checked: true, overridden: false, value: '' } }) : '{}',
          1,
          i < 9999 ? 0 : 1,
        ];
      });
      await db.query(
        'INSERT INTO toolbox_extraction_records(id,extraction_id,user_id,source_id,payload_json,reviews_json,published,pending_cells) VALUES ?',
        [values],
      );
    }
    const start = performance.now();
    const rows = await call(readRecords, { id: t.id, page: 2, filter: { sortField: 'f1', sortOrder: 'desc' } });
    expect(rows.total).toBe(10000);
    expect(rows.records).toHaveLength(50);
    expect(rows.records[0].cells[0].originalValue).toBe('产品 9949');
    const next = await call(nextPendingCell, { id: t.id, recordId: '0'.repeat(24), fieldId: 'f1', direction: 1 });
    expect(next.record.cells[0].originalValue).toBe('产品 9999');
    const snapshot = await call(recordSnapshot, { id: t.id });
    const csv = await buildExtractionExport(snapshot, 'csv');
    expect(csv.data.split('\r\n')).toHaveLength(10001);
    expect(snapshot.records.every((r) => r.sourceId === source.id)).toBe(true);
    expect(performance.now() - start).toBeLessThan(10000);
  }, 20000);
});
