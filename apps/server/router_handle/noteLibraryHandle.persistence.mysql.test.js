import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Only an explicit local Unix socket is accepted; project .env is never loaded.
// Main note, inbox, tree, reference and version queries use real MySQL transactions.
// Avoid common.js importing the entire HTTP router graph; preserve key conversion.
vi.mock('../util/common.js', async () => ({
  ...(await import('../util/agent/data.js')),
  L: (_req, zh) => zh,
  mergeExistingProperties: (value) => value,
}));
const state = vi.hoisted(() => ({ pool: null }));
vi.mock('../db/index.js', () => ({ default: {
  query: (...args) => state.pool.query(...args),
  getConnection: (...args) => state.pool.getConnection(...args),
} }));
vi.mock('../util/services/resourceCreateEffects.js', () => ({ triggerResourceCreateEffects: vi.fn() }));
// These scenarios contain plain text, no uploaded images or persistent search cache.
vi.mock('../util/imagePreview/references.js', () => ({
  registerAsset: vi.fn(), syncNoteImageReferences: vi.fn(), syncContentReferences: vi.fn(), removeImageReferences: vi.fn(),
}));
vi.mock('../util/personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
const { addNote, getNoteDetail, updateNote } = await import('./noteLibraryHandle.js');
const socketPath = process.env.P01_TEST_MYSQL_SOCKET;
const schema = `p01_test_${randomUUID().replaceAll('-', '')}`;
let admin;
let created = false;
async function call(handler, body, owner = 'first-user') {
  const res = { send: vi.fn() };
  await handler({ body, user: { id: owner, role: 'user' }, suppressUserRewards: true }, res);
  expect(res.send).toHaveBeenCalledTimes(1);
  return res.send.mock.calls[0][0];
}

describe.skipIf(!socketPath)('首次笔记保存与再次编辑（隔离 MySQL）', () => {
  beforeAll(async () => {
    if (!socketPath.startsWith('/')) throw new Error('Absolute local socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    state.pool = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 3 });
    await state.pool.query(`CREATE TABLE note (
      id VARCHAR(64) PRIMARY KEY, title VARCHAR(255), content LONGTEXT, type VARCHAR(20),
      create_by VARCHAR(64), update_by VARCHAR(64), parent_id VARCHAR(64), sort INT DEFAULT 0,
      is_top INT DEFAULT 0, del_flag INT DEFAULT 0, revision INT DEFAULT 1, tree_delete_batch_id VARCHAR(64),
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
      update_time DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await state.pool.query(`CREATE TABLE resource_inbox (
      id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), resource_type VARCHAR(20), resource_id VARCHAR(64),
      status VARCHAR(20), source VARCHAR(30), UNIQUE KEY owner_resource(user_id,resource_type,resource_id)
    ) ENGINE=InnoDB`);
    await state.pool.query(`CREATE TABLE note_versions (
      id BIGINT PRIMARY KEY AUTO_INCREMENT, note_id VARCHAR(64), title VARCHAR(255), content LONGTEXT,
      type VARCHAR(20), source_revision INT, reason VARCHAR(32), create_by VARCHAR(64),
      create_time DATETIME DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB`);
    await state.pool.query(`CREATE TABLE note_resource_refs (
      source_note_id VARCHAR(64), source_user_id VARCHAR(64), target_type VARCHAR(20),
      target_id VARCHAR(64), target_name_snapshot VARCHAR(255)
    ) ENGINE=InnoDB`);
  });
  afterAll(async () => {
    await state.pool?.end();
    try { if (created) await admin.query(`DROP DATABASE ${schema}`); }
    finally { await admin?.end(); }
  });

  it('首次创建、独立连接读回、详情读取、编辑和历史版本均持久化', async () => {
    const saved = await call(addNote, { title: '自有测试资料', content: '# 初次保存\n下次继续', type: 'markdown', addToInbox: true });
    expect(saved.status).toBe(200);
    const id = saved.data.id;
    // A new connection rules out an uncommitted transaction or front-end cache.
    const reader = await mysql.createConnection({ socketPath, user: 'root', database: schema });
    try {
      const [rows] = await reader.query('SELECT content FROM note WHERE id = ?', [id]);
      expect(rows[0].content).toBe('# 初次保存\n下次继续');
    } finally { await reader.end(); }
    const detail = await call(getNoteDetail, { id });
    expect(detail.status).toBe(200);
    expect(detail.data).toMatchObject({ id, revision: 1, isPending: true, content: '# 初次保存\n下次继续' });
    const changed = await call(updateNote, { id, revision: 1, content: '# 再次编辑\n已补充内容' });
    expect(changed).toMatchObject({ status: 200, data: { id, revision: 2 } });
    expect((await call(getNoteDetail, { id })).data).toMatchObject({ content: '# 再次编辑\n已补充内容', revision: 2 });
    const freshReader = await mysql.createConnection({ socketPath, user: 'root', database: schema });
    try {
      const [rows] = await freshReader.query('SELECT content, revision FROM note WHERE id = ?', [id]);
      expect(rows[0]).toEqual({ content: '# 再次编辑\n已补充内容', revision: 2 });
    } finally { await freshReader.end(); }
    const [versions] = await state.pool.query('SELECT content, source_revision FROM note_versions WHERE note_id = ?', [id]);
    expect(versions).toEqual([{ content: '# 初次保存\n下次继续', source_revision: 1 }]);
    const [inbox] = await state.pool.query('SELECT COUNT(*) AS n FROM resource_inbox WHERE resource_id = ?', [id]);
    expect(inbox[0].n).toBe(1);
  });

  it('其他账号不能读写，旧版本不能覆盖刚保存的正文', async () => {
    const saved = await call(addNote, { title: '归属检查', content: '原文', type: 'markdown' });
    expect(saved.status).toBe(200);
    const id = saved.data.id;
    expect((await call(getNoteDetail, { id }, 'another-user')).status).toBe(404);
    expect((await call(updateNote, { id, revision: 1, content: '越权覆盖' }, 'another-user')).status).toBe(404);
    expect((await call(updateNote, { id, revision: 1, content: '最新正文' })).status).toBe(200);
    expect((await call(updateNote, { id, revision: 1, content: '旧页面正文' })).status).toBe(409);
    expect((await call(getNoteDetail, { id })).data).toMatchObject({ content: '最新正文', revision: 2 });
  });

  it('数据库拒绝写入时正文与历史版本一起回滚，之后可正常重试', async () => {
    const saved = await call(addNote, { title: '失败重试', content: '保留原文', type: 'markdown' });
    expect(saved.status).toBe(200);
    const id = saved.data.id;
    // Real SQL failure occurs after the version snapshot has been inserted.
    await state.pool.query(`CREATE TRIGGER reject_note_update BEFORE UPDATE ON note
      FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'isolated test rejection'`);
    try {
      expect((await call(updateNote, { id, revision: 1, content: '未保存正文' })).status).toBe(500);
      expect((await call(getNoteDetail, { id })).data).toMatchObject({ content: '保留原文', revision: 1 });
      const [versions] = await state.pool.query('SELECT COUNT(*) AS n FROM note_versions WHERE note_id = ?', [id]);
      expect(versions[0].n).toBe(0);
    } finally { await state.pool.query('DROP TRIGGER reject_note_update'); }
    expect((await call(updateNote, { id, revision: 1, content: '重试成功' })).status).toBe(200);
    expect((await call(getNoteDetail, { id })).data).toMatchObject({ content: '重试成功', revision: 2 });
  });


  it('相同创建标识重复提交只保留一份笔记和待整理关系', async () => {
    const body = { title: '响应丢失重试', content: '已提交正文', type: 'markdown', addToInbox: true, idempotencyKey: `quick-capture:note:${randomUUID()}` };
    const first = await call(addNote, body);
    const retry = await call(addNote, body);
    expect(first.status).toBe(200);
    expect(retry.status).toBe(200);
    expect(retry.data.id).toBe(first.data.id);
    const [notes] = await state.pool.query('SELECT COUNT(*) AS n FROM note WHERE id = ?', [first.data.id]);
    const [inbox] = await state.pool.query('SELECT COUNT(*) AS n FROM resource_inbox WHERE resource_id = ?', [first.data.id]);
    expect(notes[0].n).toBe(1);
    expect(inbox[0].n).toBe(1);
    const next = await call(addNote, { ...body, idempotencyKey: `quick-capture:note:${randomUUID()}` });
    expect(next.status).toBe(200);
    expect(next.data.id).not.toBe(first.data.id);
  });

});
