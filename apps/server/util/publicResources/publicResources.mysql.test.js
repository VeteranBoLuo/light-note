import { combinedSearch, rankedPage } from './combinedSearch.js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, it, expect, vi } from 'vitest';
import { COMMUNITY_CHAT_TABLE_SQL } from '../communityChatSchema.js';
import { migratePublicResourceSchema, publicResourceSchemaReady } from './schema.js';
import { capabilities, receipt, transaction, write } from './core.js';
import { preview, submit, own, withdraw, candidates, resolveOwn } from './publications.js';
import { workspace } from './workspace.js';
import { prepareBatch, authorBatch, moderationBatch } from './batch.js';
import { detail, search, readJoins, visibleSql } from './read.js';
import { decide, report, handleReport, moderationDetail, reportDetail, history } from './moderation.js';
import { withdrawDeletedSources, purgePublicResourceData } from './lifecycle.js';
import { save, savedSource } from './saved.js';
import { createNote } from '../services/noteService.js';
import { createBookmark } from '../services/bookmarkService.js';
import { softDeleteResources } from '../services/resourceDeleteService.js';
import { deleteOwnedNoteSubtrees } from '../services/noteTreeService.js';
import { consumePublicResourceReview } from './reviewWorker.js';
import { consumePublicResourceEvent, publicResourceNotificationVisibleSql } from './notifications.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const env = {
  PUBLIC_RESOURCES_ENABLED: 'true',
  PUBLIC_RESOURCES_SUBMISSIONS_ENABLED: 'true',
  PUBLIC_RESOURCES_AI_ENABLED: 'false',
};
const A = { id: 'a', role: 'user' },
  B = { id: 'b', role: 'user' },
  ROOT = { id: 'root', role: 'root' };
const input = (values) => ({ requestId: randomUUID(), ...values });
let db, admin;
const schema = 'public_resources_' + randomUUID().replaceAll('-', '');
const opts = (user = A, extra = {}) => ({ db, env, user, ...extra });
async function draft(values = {}, user = A) {
  const p = await preview(opts(user, { input: { kind: 'note', sourceId: 'n', ...values } }));
  return submit(
    opts(user, {
      input: input({
        kind: 'note',
        sourceId: 'n',
        fingerprint: p.fingerprint,
        expectedVersion: p.expectedVersion,
        confirmed: true,
        ...values,
      }),
    }),
  );
}
async function publish() {
  const p = await draft();
  await decide(opts(ROOT, { id: p.publicId, input: input({ action: 'approve', expectedVersion: p.version }) }));
  return detail(opts(B, { id: p.publicId }));
}
describe.skipIf(!socketPath)('public resource transactional boundaries', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 8 });
    await db.query(
      "CREATE TABLE user(id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,role varchar(32),del_flag varchar(16) DEFAULT '0',alias varchar(80),preferences json) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4",
    );
    for (const sql of COMMUNITY_CHAT_TABLE_SQL) await db.query(sql);
    await db.query(
      'CREATE TABLE note(id varchar(64) PRIMARY KEY,create_by varchar(36),title varchar(255),content mediumtext,type varchar(20),del_flag tinyint DEFAULT 0,update_time datetime DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci',
    );
    await db.query(
      'CREATE TABLE bookmark(id varchar(255) PRIMARY KEY,user_id varchar(255),name varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,url varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,description varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,del_flag tinyint DEFAULT 0) ENGINE=InnoDB DEFAULT CHARSET=utf8 COLLATE=utf8_general_ci',
    );
    await db.query(
      'ALTER TABLE note ADD create_time datetime(6) DEFAULT CURRENT_TIMESTAMP(6),ADD update_by varchar(36),ADD sort int DEFAULT 0,ADD is_top int DEFAULT 0,ADD revision int DEFAULT 1,ADD parent_id varchar(64),ADD tree_delete_batch_id varchar(36),ADD deleted_at datetime,ADD KEY idx_note_parent(parent_id)',
    );
    await db.query(
      'ALTER TABLE bookmark ADD create_time datetime(6) DEFAULT CURRENT_TIMESTAMP(6),ADD sort int DEFAULT 0,ADD is_top int DEFAULT 0,ADD icon_url text,ADD url_exact_hash binary(32),ADD deleted_at datetime',
    );
    await db.query(
      'CREATE TABLE files(id int PRIMARY KEY,create_by varchar(36),del_flag int DEFAULT 0,file_name varchar(255),file_type varchar(100),file_size bigint DEFAULT 0,folder_id int,create_time datetime(6))',
    );
    await db.query('CREATE TABLE folders(id int PRIMARY KEY,name varchar(255))');
    await db.query(
      'CREATE TABLE tag(id varchar(36) PRIMARY KEY,user_id varchar(36),name varchar(255),description text,del_flag int DEFAULT 0,sort int DEFAULT 0,create_time datetime(6),icon_url text)',
    );
    await db.query(
      'CREATE TABLE resource_tag_relations(tag_id varchar(36),user_id varchar(36),resource_id varchar(64),resource_type varchar(20))',
    );
    await db.query(
      'CREATE TABLE todo_items(id varchar(36) PRIMARY KEY,user_id varchar(36),title varchar(255),description text,status varchar(20),priority int,due_at datetime(6),completed_at datetime,update_time datetime(6),del_flag int DEFAULT 0,instance_state varchar(20))',
    );
    await db.query(
      'CREATE TABLE todo_tag_relations(tag_id varchar(36),user_id varchar(36),target_id varchar(36),target_type varchar(20))',
    );
    await db.query('CREATE TABLE todo_resource_refs(todo_id varchar(36),user_id varchar(36))');
    await db.query('CREATE TABLE collection_form_tags(form_id varchar(36),tag_id varchar(36),user_id varchar(36))');
    await db.query('CREATE TABLE collection_forms(id varchar(36) PRIMARY KEY,user_id varchar(36))');
    await db.query(
      'CREATE TABLE knowledge_base(id char(36) PRIMARY KEY,title varchar(255),content mediumtext,category varchar(50),help_section varchar(50),status varchar(20),type varchar(20),sort int,created_by varchar(36),updated_by varchar(36)) DEFAULT CHARSET=utf8mb4',
    );
    await db.query(
      'CREATE TABLE resource_inbox(user_id varchar(36),resource_type varchar(20),resource_id varchar(64))',
    );
    await db.query(
      'CREATE TABLE notification(id char(36) PRIMARY KEY,user_id varchar(255),type varchar(32),title varchar(255),content text,link varchar(255),meta json,batch_id char(36),source_type varchar(40),source_id varchar(160),is_read tinyint,read_time datetime,del_flag tinyint DEFAULT 0,browser_push_pending tinyint,create_time datetime(6) DEFAULT CURRENT_TIMESTAMP(6),browser_push_created_at datetime(6),UNIQUE KEY uk_source(user_id,source_type,source_id))',
    );
    await db.query(
      'CREATE TABLE ai_executions(id char(36) PRIMARY KEY,request_id char(36),skill_id varchar(80),status varchar(32),provider_tokens int,provider_call_count int)',
    );
    await db.query(
      'CREATE TABLE ai_provider_spans(id char(36) PRIMARY KEY,execution_id char(36),usage_status varchar(16))',
    );
    await db.query(
      'CREATE TABLE security_account_restrictions(id int PRIMARY KEY,user_id varchar(255),restriction_type varchar(32),scope_json json,reason varchar(255),status varchar(20),expires_at datetime,created_at datetime)',
    );
    await migratePublicResourceSchema(db);
    await migratePublicResourceSchema(db);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE IF EXISTS ${schema}`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    const [tables] = await db.query('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()');
    for (const row of tables) await db.query(`DELETE FROM \`${row.TABLE_NAME || row.table_name}\``);
    for (const u of [A, B, ROOT])
      await db.query('INSERT INTO user(id,role,alias,preferences) VALUES(?,?,?,?)', [
        u.id,
        u.role,
        `成员${u.id}`,
        '{}',
      ]);
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type) VALUES('n','a','知识管理','<p>第一段</p><p>第二段</p>','html')",
    );
    await db.query(
      "INSERT INTO bookmark(id,user_id,name,url,description) VALUES('b','a','资料','https://example.org/','说明')",
    );
  });
  it('applies the help migration idempotently without modifying private resources', async () => {
    await db.query(
      "INSERT INTO knowledge_base(id,title,content,status,category,created_by) VALUES('private-article','全站搜索与公开资源','私人条目','private','个人知识','a')",
    );
    const sql = await readFile(new URL('../../migrations/20261021_public_resources_help.sql', import.meta.url), 'utf8');
    const statements = sql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n')
        .split(';')
        .map((s) => s.trim())
        .filter(Boolean),
      c = await db.getConnection();
    try {
      for (let n = 0; n < 2; n++) for (const statement of statements) await c.query(statement);
    } finally {
      await c.rollback();
      c.release();
    }
    expect(
      (await db.query("SELECT id FROM knowledge_base WHERE title='全站搜索与公开资源' AND category='帮助中心'"))[0],
    ).toHaveLength(1);
    expect(
      (await db.query("SELECT content,status,category FROM knowledge_base WHERE id='private-article'"))[0][0],
    ).toEqual({ content: '私人条目', status: 'private', category: '个人知识' });
    expect((await db.query("SELECT content FROM note WHERE id='n'"))[0][0].content).toBe('<p>第一段</p><p>第二段</p>');
  });
  it('loads at most1000 candidate metadata rows with complete counts and bounded continuation', async () => {
    const rows = Array.from({ length: 1003 }, (_, i) => ['bulk-' + i, 'a', '候选' + i, '正文', 'html']);
    await db.query('INSERT INTO note(id,create_by,title,content,type) VALUES ?', [rows]);
    const first = await workspace(opts(A));
    const next = await workspace(opts(A, { input: { page: 2 } }));
    expect(first).toMatchObject({ total: 1005, pageSize: 1000, hasMore: true });
    expect(first.items).toHaveLength(1000);
    expect(next.items).toHaveLength(5);
    expect(new Set([...first.items, ...next.items].map((i) => i.kind + ':' + i.sourceId)).size).toBe(1005);
  });
  it('submits and approves100 selected items without per-item rate waits, preserving receipts and partial conflicts', async () => {
    const originals = Array.from({ length: 100 }, (_, i) => ({ kind: 'note', sourceId: 'batch-' + i }));
    await db.query('INSERT INTO note(id,create_by,title,content,type) VALUES ?', [
      originals.map((item, i) => [item.sourceId, 'a', '批次' + i, '正文' + i, 'html']),
    ]);
    const prepared = await prepareBatch(opts(A, { input: { items: originals } }));
    const body = input({
      action: 'submit',
      items: prepared.items.map(({ code, title, ...item }) => input({ ...item, confirmed: true })),
    });
    const result = await authorBatch(opts(A, { input: body }));
    expect(result.items).toHaveLength(100);
    expect(result.items.every((item) => item.state === 'success')).toBe(true);
    expect(await authorBatch(opts(A, { input: body }))).toEqual(result);
    expect((await db.query('SELECT COUNT(*) AS n FROM public_resource_revisions'))[0][0].n).toBe(100);
    const saved = await receipt(opts(A, { id: body.items[99].requestId }));
    expect(saved.result.publicId).toBe(result.items[99].result.publicId);
    expect(saved.result).not.toHaveProperty('__publicResourceBatch');
    await expect(authorBatch(opts(A, { input: { ...body, items: body.items.slice(0, 99) } }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_REQUEST_REUSED',
    });
    const approve = input({
      action: 'approve',
      items: result.items.map((item, i) =>
        input({ publicId: item.result.publicId, expectedVersion: i === 50 ? 999 : item.result.version }),
      ),
    });
    const reviewed = await moderationBatch(opts(ROOT, { input: approve }));
    expect(reviewed.items.filter((item) => item.state === 'success')).toHaveLength(99);
    expect(reviewed.items[50]).toMatchObject({ state: 'failed', code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' });
    expect((await db.query("SELECT COUNT(*) AS n FROM public_resource_actions WHERE action='approve'"))[0][0].n).toBe(
      99,
    );
    await expect(moderationBatch(opts(A, { input: approve }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_FORBIDDEN',
    });
  }, 30000);
  it('rejects a reused aggregate request ID before executing any child writes', async () => {
    const material = await preview(opts(A, { input: { kind: 'note', sourceId: 'n' } }));
    const original = input({
      kind: 'note',
      sourceId: 'n',
      fingerprint: material.fingerprint,
      expectedVersion: 0,
      confirmed: true,
    });
    await submit(opts(A, { input: original }));
    const prepared = await prepareBatch(opts(A, { input: { items: [{ kind: 'bookmark', sourceId: 'b' }] } }));
    const { code, title, ...item } = prepared.items[0];
    await expect(
      authorBatch(
        opts(A, {
          input: {
            requestId: original.requestId,
            action: 'submit',
            items: [input({ ...item, confirmed: true })],
          },
        }),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_REQUEST_REUSED' });
    expect(
      (await db.query("SELECT COUNT(*) AS n FROM public_resource_publications WHERE kind='bookmark'"))[0][0].n,
    ).toBe(0);
  });
  it('hides an unfinished aggregate receipt and resumes it through idempotent child receipts', async () => {
    const prepared = await prepareBatch(
      opts(A, {
        input: {
          items: [
            { kind: 'note', sourceId: 'n' },
            { kind: 'bookmark', sourceId: 'b' },
          ],
        },
      }),
    );
    const body = input({
      action: 'submit',
      items: prepared.items.map(({ code, title, ...item }) => input({ ...item, confirmed: true })),
    });
    await write({ ...opts(A), input: body, action: 'batch', batchId: body.requestId }, async () => ({
      __publicResourcePendingBatch: true,
    }));
    await submit(opts(A, { input: body.items[0], batchId: body.requestId }));
    expect(await receipt(opts(A, { id: body.requestId }))).toEqual({ found: false, result: null });
    const [first, second] = await Promise.all([
      authorBatch(opts(A, { input: body })),
      authorBatch(opts(A, { input: body })),
    ]);
    expect(first).toEqual(second);
    expect(first.items.every((item) => item.state === 'success')).toBe(true);
    expect(await receipt(opts(A, { id: body.requestId }))).toEqual({ found: true, result: first });
    expect((await db.query('SELECT COUNT(*) AS n FROM public_resource_revisions'))[0][0].n).toBe(2);
  });
  it('limits complete batch intents rather than the number of item receipts', async () => {
    const material = await preview(opts(A, { input: { kind: 'note', sourceId: 'n' } }));
    const values = {
      kind: 'note',
      sourceId: 'n',
      fingerprint: material.fingerprint,
      expectedVersion: 0,
      confirmed: true,
    };
    for (let i = 0; i < 30; i++)
      await authorBatch(opts(A, { input: input({ action: 'submit', items: [input(values)] }) }));
    await expect(
      authorBatch(opts(A, { input: input({ action: 'submit', items: [input(values)] }) })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_RATE_LIMITED' });
    await expect(submit(opts(A, { input: input(values) }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_RATE_LIMITED',
    });
    expect((await db.query('SELECT COUNT(*) AS n FROM public_resource_revisions'))[0][0].n).toBe(1);
  });
  it('requires owned material, explicit confirmation, valid fingerprints and reasons in batch operations', async () => {
    const prepared = await prepareBatch(
      opts(A, {
        input: {
          items: [
            { kind: 'note', sourceId: 'n' },
            { kind: 'note', sourceId: 'missing' },
          ],
        },
      }),
    );
    expect(prepared.items[1].code).toBe('PUBLIC_RESOURCE_SOURCE_UNAVAILABLE');
    expect((await prepareBatch(opts(B, { input: { items: [{ kind: 'note', sourceId: 'n' }] } }))).items[0].code).toBe(
      'PUBLIC_RESOURCE_SOURCE_UNAVAILABLE',
    );
    const { code, title, ...item } = prepared.items[0];
    await db.query("UPDATE note SET content='changed' WHERE id='n'");
    const changed = await authorBatch(
      opts(A, { input: input({ action: 'submit', items: [input({ ...item, confirmed: true })] }) }),
    );
    expect(changed.items[0]).toMatchObject({ state: 'failed', code: 'PUBLIC_RESOURCE_MATERIAL_CHANGED' });
    const latest = await prepareBatch(opts(A, { input: { items: [{ kind: 'note', sourceId: 'n' }] } }));
    const { code: unused, title: unusedTitle, ...current } = latest.items[0];
    const denied = await authorBatch(
      opts(A, { input: input({ action: 'submit', items: [input({ ...current, confirmed: false })] }) }),
    );
    expect(denied.items[0].code).toBe('PUBLIC_RESOURCE_CONFIRMATION_REQUIRED');
    await expect(
      prepareBatch(opts(A, { input: { items: [{ kind: 'note', sourceId: 'n', owner: 'b' }] } })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_INVALID_INPUT' });
    const submitted = await authorBatch(
      opts(A, { input: input({ action: 'submit', items: [input({ ...current, confirmed: true })] }) }),
    );
    const reject = await moderationBatch(
      opts(ROOT, {
        input: input({
          action: 'reject',
          items: [input({ publicId: submitted.items[0].result.publicId, expectedVersion: 1, reason: '' })],
        }),
      }),
    );
    expect(reject.items[0].state).toBe('failed');
    expect(
      (await db.query('SELECT pending_revision_id FROM public_resource_publications'))[0][0].pending_revision_id,
    ).not.toBeNull();
  });
  it('defaults closed, is independent of old community flags, and never grants visitors access', async () => {
    expect((await capabilities(opts(A, { env: {} }))).enabled).toBe(false);
    expect((await capabilities(opts())).enabled).toBe(true);
    await expect(search(opts({ id: 'guest', role: 'visitor' }, { input: {} }))).rejects.toMatchObject({ status: 403 });
    await expect(draft({ sourceId: 'n' }, B)).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_SOURCE_UNAVAILABLE' });
  });
  it('counts and pages lightweight candidate metadata without reading private bodies', async () => {
    for (let i = 0; i < 25; i++)
      await db.query("INSERT INTO note(id,create_by,title,content,type) VALUES(?,'a',?,'private body','html')", [
        'work-' + i,
        '工作台笔记' + i,
      ]);
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type) VALUES('foreign','b','他人私密','secret','html')",
    );
    const published = await publish();
    const queries = [];
    const monitored = {
      query: (sql, params) => {
        queries.push(sql);
        return db.query(sql, params);
      },
    };
    const a = await workspace(opts(A, { db: monitored, input: { page: 1, pageSize: 20 } }));
    const b = await workspace(opts(A, { input: { page: 2, pageSize: 20 } }));
    expect(a.total).toBe(27);
    expect(a.totals).toMatchObject({ all: 27, unpublished: 26, published: 1 });
    expect(a.items).toHaveLength(20);
    expect(b.items).toHaveLength(7);
    const all = [...a.items, ...b.items];
    expect(new Set(all.map((i) => i.kind + ':' + i.sourceId)).size).toBe(27);
    expect(all.find((i) => i.sourceId === 'n').publication.publicId).toBe(published.publicId);
    expect(all.find((i) => i.sourceId === 'n').publication.hasUnpublishedChanges).toBeNull();
    expect(all.some((i) => i.sourceId === 'foreign')).toBe(false);
    expect(queries.some((sql) => /SELECT id,title,content,type FROM note/.test(sql))).toBe(false);
    expect(JSON.stringify(a)).not.toMatch(/private body|secret|owner_id|fingerprint/);
  });
  it('uses bookmark creation time and falls back to note creation time for metadata ordering', async () => {
    const noteTime = new Date('2026-10-20T09:30:00.000Z');
    const bookmarkTime = new Date('2026-10-21T09:30:00.000Z');
    await db.query("UPDATE note SET update_time=NULL,create_time=? WHERE id='n'", [noteTime]);
    await db.query("UPDATE bookmark SET create_time=? WHERE id='b'", [bookmarkTime]);
    const result = await workspace(opts(A));
    expect(result.items.map((i) => i.sourceId)).toEqual(['b', 'n']);
    expect(result.items.map((i) => i.updatedAt)).toEqual([bookmarkTime.toISOString(), noteTime.toISOString()]);
    expect((await candidates(opts(A, { input: { kind: 'all' } }))).items.map((i) => i.sourceId)).toEqual(['b', 'n']);
  });
  it('hides deleted and unsupported originals and restores only supported rows without losing publication history', async () => {
    const p = await publish();
    await transaction(db, async (c) => {
      await withdrawDeletedSources(c, { userId: 'a', kind: 'note', ids: ['n'] });
      await c.query("UPDATE note SET del_flag=1 WHERE id='n'");
    });
    let page = await workspace(opts(A, { input: { status: 'withdrawn' }, env: {} }));
    expect(page.total).toBe(0);
    expect(page.items).toHaveLength(0);
    expect((await resolveOwn(opts(A, { input: { ids: [p.publicId] }, env: {} }))).items[0]).toMatchObject({
      publicId: p.publicId,
      status: 'withdrawn',
    });
    await db.query("UPDATE note SET del_flag=0 WHERE id='n'");
    page = await workspace(opts(A, { input: {} }));
    expect(page.items.filter((i) => i.sourceId === 'n')).toHaveLength(1);
    expect(page.items.find((i) => i.sourceId === 'n')).toMatchObject({
      sourceUnavailable: false,
      publication: { status: 'withdrawn' },
    });
    await db.query("UPDATE note SET type='drawing' WHERE id='n'");
    expect((await workspace(opts())).items.some((i) => i.sourceId === 'n')).toBe(false);
  });
  it('uses current original and submitted titles, with coherent type/status counts and literal keywords', async () => {
    await publish();
    await db.query("UPDATE note SET title='原稿新标题' WHERE id='n'");
    const current = await workspace(opts(A, { input: { kind: 'note', q: '新标题', status: 'published' } }));
    expect(current.total).toBe(1);
    expect(current.items[0].title).toBe('原稿新标题');
    // The source title may differ from the submitted title; neither changes a public snapshot.
    const publicTitle = (await detail(opts(B, { id: current.items[0].publication.publicId }))).title;
    expect((await workspace(opts(A, { input: { q: publicTitle } }))).total).toBe(1);
    expect((await workspace(opts(A, { input: { kind: 'bookmark', status: 'unpublished' } }))).totals).toMatchObject({
      all: 1,
      unpublished: 1,
      published: 0,
    });
    expect((await workspace(opts(A, { input: { q: '%' } }))).total).toBe(0);
    expect((await workspace(opts(B))).items).toHaveLength(0);
  });
  it('does not offer arbitrary note types and validates bounded workspace filters', async () => {
    await db.query("INSERT INTO note(id,create_by,title,type,content) VALUES('drawing','a','画板','drawing','{}')");
    expect((await workspace(opts())).items.some((i) => i.sourceId === 'drawing')).toBe(false);
    for (const values of [{ kind: 'file' }, { status: 'fake' }, { q: 'x'.repeat(201) }, { q: { bad: true } }])
      await expect(workspace(opts(A, { input: values }))).rejects.toMatchObject({
        code: 'PUBLIC_RESOURCE_INVALID_INPUT',
      });
    await expect(workspace(opts({ id: 'a', role: 'visitor' }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_LOGIN_REQUIRED',
    });
  });
  it('paginates mixed supported candidates without returning bodies or leaking other owners', async () => {
    for (let i = 0; i < 25; i++)
      await db.query("INSERT INTO note(id,create_by,title,content,type) VALUES(?, 'a', ?, '<p>正文</p>', 'html')", [
        'candidate-' + i,
        '批量笔记' + i,
      ]);
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type) VALUES('foreign','b','私人候选','secret','html'),('drawing','a','画板','{}','drawing')",
    );
    const firstPage = await candidates(opts(A, { input: { kind: 'all', page: 1 } }));
    const secondPage = await candidates(opts(A, { input: { kind: 'all', page: 2 } }));
    expect(firstPage.total).toBe(27);
    expect(firstPage.items).toHaveLength(20);
    expect(secondPage.items).toHaveLength(7);
    const items = [...firstPage.items, ...secondPage.items];
    expect(new Set(items.map((i) => i.kind + ':' + i.sourceId)).size).toBe(27);
    expect(items.some((i) => i.kind === 'bookmark')).toBe(true);
    expect(items.some((i) => i.sourceId === 'foreign' || i.sourceId === 'drawing')).toBe(false);
    expect(Object.keys(items[0]).sort()).toEqual(['kind', 'sourceId', 'title']);
    expect((await candidates(opts(A, { input: { kind: 'all', q: '批量笔记' } }))).total).toBe(25);
  });
  it('lists metadata candidates and rejects unsupported content during selected material preparation', async () => {
    const unsupported = [
      ['html-image', 'html', '<p>文字</p><img src="x">'],
      ['html-media', 'html', '<p>文字</p><video></video>'],
      ['md-image', 'markdown', '文字 ![图](https://example.org/a.png)'],
      ['legacy-image', 'md', '![图](https://example.org/a.png)'],
      ['empty', 'html', '<p><br></p>'],
      ['long', 'markdown', '字'.repeat(30001)],
      ['huge', 'html', 'x'.repeat(200001)],
    ];
    for (const [id, type, content] of unsupported)
      await db.query("INSERT INTO note(id,create_by,title,type,content) VALUES(?,'a',?,?,?)", [id, id, type, content]);
    await db.query(
      "INSERT INTO bookmark(id,user_id,name,url,description) VALUES('bad-url','a','私密链接','https://example.org/?shareToken=secret','')",
    );
    const result = await workspace(opts(A));
    expect(result.total).toBe(10);
    expect(result.totals).toMatchObject({ all: 10, unpublished: 10 });
    const prepared = await prepareBatch(
      opts(A, { input: { items: result.items.map(({ kind, sourceId }) => ({ kind, sourceId })) } }),
    );
    expect(
      prepared.items
        .filter((item) => !item.code)
        .map((item) => item.sourceId)
        .sort(),
    ).toEqual(['b', 'n']);
    expect(prepared.items.find((item) => item.sourceId === 'huge').code).toBe('PUBLIC_RESOURCE_TOO_LARGE');
    expect(JSON.stringify(prepared)).not.toContain('第一段');
    expect((await candidates(opts(A, { input: { kind: 'all' } }))).total).toBe(2);
  });
  it('keeps candidate counts consistent across metadata pages even when bodies later fail validation', async () => {
    for (let i = 0; i < 105; i++)
      await db.query(
        "INSERT INTO note(id,create_by,title,type,content,update_time) VALUES(?,'a',?,'html','<img src=x>','2026-10-22 12:00:00')",
        ['blocked-' + i, '不支持' + i],
      );
    for (let i = 0; i < 25; i++)
      await db.query(
        "INSERT INTO note(id,create_by,title,type,content,update_time) VALUES(?,'a',?,'html','<p>正文</p>','2026-10-21 12:00:00')",
        ['valid-' + i, '可公开' + i],
      );
    const first = await workspace(opts(A, { input: { pageSize: 100 } }));
    const second = await workspace(opts(A, { input: { page: 2, pageSize: 100 } }));
    expect(first).toMatchObject({ total: 132, hasMore: true });
    expect(first.items).toHaveLength(100);
    expect(second).toMatchObject({ total: 132, hasMore: false });
    expect(second.items).toHaveLength(32);
    expect(new Set([...first.items, ...second.items].map((i) => i.kind + ':' + i.sourceId)).size).toBe(132);
    expect((await candidates(opts(A, { input: { kind: 'all', page: 2 } }))).items).toHaveLength(7);
  });
  it('retains publication metadata when an original body becomes unsupported, without republishing changes', async () => {
    const published = await publish();
    await db.query("UPDATE note SET content='<img src=x>' WHERE id='n'");
    const result = await workspace(opts(A));
    expect(result.items.some((i) => i.sourceId === 'n')).toBe(true);
    expect(result.totals).toMatchObject({ all: 2, published: 1, unpublished: 1 });
    await expect(preview(opts(A, { input: { kind: 'note', sourceId: 'n' } }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_TEXT_ONLY',
    });
    expect((await detail(opts(B, { id: published.publicId }))).body).toContain('第一段');
    expect((await resolveOwn(opts(A, { input: { ids: [published.publicId] } }))).items[0].publicId).toBe(
      published.publicId,
    );
    expect((await candidates(opts(A, { input: { kind: 'all' } }))).items.map((i) => i.sourceId)).toEqual(['b']);
  });
  it('resolves only an explicit owned selection and reports current public and pending versions', async () => {
    const published = await publish();
    await db.query("UPDATE note SET content='<p>新版本</p>' WHERE id='n'");
    const update = await draft();
    const mine = await resolveOwn(opts(A, { input: { ids: [published.publicId] } }));
    expect(mine.items[0]).toMatchObject({
      publicId: published.publicId,
      version: update.version,
      publishedRevision: 1,
      pendingRevision: 2,
      oldVersionPublic: true,
    });
    expect(mine.unavailableIds).toEqual([]);
    expect(JSON.stringify(mine)).not.toMatch(/"body"|"url"|"owner_id"|"fingerprint"/);
    expect(await resolveOwn(opts(B, { input: { ids: [published.publicId] } }))).toEqual({
      items: [],
      unavailableIds: [published.publicId],
    });
    await withdraw(opts(A, { id: published.publicId, input: input({ expectedVersion: update.version }) }));
    const after = await resolveOwn(opts(A, { input: { ids: [published.publicId] }, env: {} }));
    expect(after.items[0]).toMatchObject({
      status: 'withdrawn',
      publishedRevision: null,
      pendingRevision: null,
      oldVersionPublic: false,
    });
  });
  it('bounds selection resolution and gives no distinction between missing and foreign publications', async () => {
    await expect(resolveOwn(opts(A, { input: { ids: [] } }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_INVALID_INPUT',
    });
    await expect(
      resolveOwn(opts(A, { input: { ids: Array.from({ length: 101 }, () => randomUUID()) } })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_INVALID_INPUT' });
    await expect(resolveOwn(opts(A, { input: { ids: ['invalid'] } }))).rejects.toMatchObject({
      code: 'PUBLIC_RESOURCE_INVALID_INPUT',
    });
    const missing = randomUUID();
    expect(await resolveOwn(opts(A, { input: { ids: [missing] } }))).toEqual({ items: [], unavailableIds: [missing] });
  });
  it('does not repeat withdrawal effects and does not let authors alter removed publications', async () => {
    const p = await publish();
    const withdrawn = await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: p.version }) }));
    const repeated = await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: withdrawn.version }) }));
    expect(repeated).toMatchObject({ version: withdrawn.version, reused: true });
    expect((await db.query("SELECT id FROM public_resource_actions WHERE action='withdraw'"))[0]).toHaveLength(1);
    const fresh = await draft();
    const removed = await decide(
      opts(ROOT, {
        id: fresh.publicId,
        input: input({ action: 'remove', expectedVersion: fresh.version, reason: '管理员下架' }),
      }),
    );
    await expect(
      withdraw(opts(A, { id: fresh.publicId, input: input({ expectedVersion: removed.version }) })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_REMOVED' });
    expect((await resolveOwn(opts(A, { input: { ids: [fresh.publicId] } }))).items[0].status).toBe('removed');
  });
  it('rechecks confirmed material; rejects client owner/body and stale previews', async () => {
    const p = await preview(opts(A, { input: { kind: 'note', sourceId: 'n' } }));
    await db.query("UPDATE note SET content='<p>变化</p>' WHERE id='n'");
    await expect(
      submit(
        opts(A, {
          input: input({
            kind: 'note',
            sourceId: 'n',
            fingerprint: p.fingerprint,
            confirmed: true,
            expectedVersion: 0,
          }),
        }),
      ),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_MATERIAL_CHANGED' });
    await expect(
      submit(opts(A, { input: input({ kind: 'note', sourceId: 'n', owner: 'b', body: '伪造' }) })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_INVALID_INPUT' });
  });
  it('creates one revision for duplicate material and one receipt for duplicate requests', async () => {
    const p = await preview(opts(A, { input: { kind: 'note', sourceId: 'n' } }));
    const request = input({
      kind: 'note',
      sourceId: 'n',
      fingerprint: p.fingerprint,
      confirmed: true,
      expectedVersion: 0,
    });
    const first = await submit(opts(A, { input: request }));
    expect(await submit(opts(A, { input: request }))).toEqual(first);
    expect((await draft()).reused).toBe(true);
    expect(Number((await db.query('SELECT COUNT(*) AS n FROM public_resource_revisions'))[0][0].n)).toBe(1);
    expect((await receipt(opts(A, { id: request.requestId }))).found).toBe(true);
    await expect(submit(opts(A, { input: { ...request, confirmed: false } }))).rejects.toBeDefined();
  });
  it('publishes only through Root final review, including a Root-authored submission', async () => {
    const p = await draft();
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
    await expect(
      decide(opts(A, { id: p.publicId, input: input({ expectedVersion: p.version, action: 'approve' }) })),
    ).rejects.toMatchObject({ status: 403 });
    await db.query("UPDATE note SET create_by='root' WHERE id='n'");
    const r = await draft({}, ROOT);
    await expect(detail(opts(B, { id: r.publicId }))).rejects.toMatchObject({ status: 404 });
  });
  it('keeps old public material while an update is pending or rejected', async () => {
    const p = await publish();
    await db.query("UPDATE note SET content='<p>新材料</p>' WHERE id='n'");
    const update = await draft();
    expect((await detail(opts(B, { id: p.publicId }))).body).toBe('第一段\n\n第二段');
    expect((await own(opts())).items[0]).toMatchObject({
      status: 'pending_review',
      oldVersionPublic: true,
      hasUnpublishedChanges: true,
    });
    await expect(
      decide(opts(ROOT, { id: p.publicId, input: input({ expectedVersion: update.version, action: 'reject' }) })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_INVALID_INPUT' });
    await decide(
      opts(ROOT, {
        id: p.publicId,
        input: input({ expectedVersion: update.version, action: 'reject', reason: '请修改引导内容' }),
      }),
    );
    expect((await own(opts())).items[0]).toMatchObject({ status: 'rejected', oldVersionPublic: true });
    expect((await detail(opts(B, { id: p.publicId }))).revision).toBe(1);
    expect((await search(opts(B, { input: { q: '新材料' } }))).total).toBe(0);
  });
  it('supersedes one pending revision and rejects stale moderator decisions', async () => {
    const first = await draft();
    await db.query("UPDATE note SET content='<p>修订</p>' WHERE id='n'");
    const next = await draft();
    await expect(
      decide(opts(ROOT, { id: first.publicId, input: input({ expectedVersion: first.version, action: 'approve' }) })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_VERSION_CONFLICT' });
    const [rows] = await db.query('SELECT status FROM public_resource_revisions ORDER BY id');
    expect(rows.map((r) => r.status)).toEqual(['obsolete', 'pending_review']);
    await decide(opts(ROOT, { id: next.publicId, input: input({ expectedVersion: next.version, action: 'approve' }) }));
    expect((await detail(opts(B, { id: next.publicId }))).body).toBe('修订');
  });
  it('withdraw and source deletion cancel jobs; restoring sources never republishes', async () => {
    const p = await publish();
    await transaction(db, async (c) => {
      await c.query("UPDATE note SET del_flag=1 WHERE id='n'");
      await withdrawDeletedSources(c, { userId: 'a', kind: 'note', ids: ['n'] });
    });
    await db.query("UPDATE note SET del_flag=0 WHERE id='n'");
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
    const resubmitted = await draft();
    expect(resubmitted.reused).toBe(false);
    await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: resubmitted.version }) }));
    expect((await own(opts())).items[0].status).toBe('withdrawn');
  });
  it('sticky removal blocks resubmission; unlock only restores submission eligibility', async () => {
    const p = await publish();
    await decide(
      opts(ROOT, {
        id: p.publicId,
        input: input({ expectedVersion: p.version, action: 'remove', reason: '不适合公开' }),
      }),
    );
    await expect(draft()).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_REMOVED' });
    await decide(opts(ROOT, { id: p.publicId, input: input({ expectedVersion: p.version + 1, action: 'unlock' }) }));
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
    expect((await draft()).reused).toBe(false);
  });
  it('resource deletion and note subtree deletion withdraw publications inside the caller transaction', async () => {
    const p = await publish(),
      book = await draft({ kind: 'bookmark', sourceId: 'b' });
    await decide(opts(ROOT, { id: book.publicId, input: input({ expectedVersion: book.version, action: 'approve' }) }));
    await transaction(db, (c) => softDeleteResources(c, { userId: 'a', items: [{ type: 'bookmark', id: 'b' }] }));
    await expect(detail(opts(B, { id: book.publicId }))).rejects.toMatchObject({ status: 404 });
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type,parent_id) VALUES('child','a','子页','<p>子页文字</p>','html','n')",
    );
    const child = await draft({ sourceId: 'child' });
    await decide(
      opts(ROOT, { id: child.publicId, input: input({ expectedVersion: child.version, action: 'approve' }) }),
    );
    await transaction(db, (c) =>
      deleteOwnedNoteSubtrees(c, { userId: 'a', items: [{ id: 'n', expectedDescendantCount: 1 }] }),
    );
    for (const published of [p, child])
      await expect(detail(opts(B, { id: published.publicId }))).rejects.toMatchObject({ status: 404 });
    expect(
      (
        await db.query('SELECT withdrawn,pending_revision_id,published_revision_id FROM public_resource_publications')
      )[0].every((p) => Number(p.withdrawn) === 1 && !p.pending_revision_id && !p.published_revision_id),
    ).toBe(true);
  });
  it.each([
    ['b', 'a'],
    ['a', 'b'],
  ])('enforces bilateral blocks: %s → %s', async (actor, target) => {
    const p = await publish();
    await db.query('INSERT INTO community_chat_blocks(id,user_id,blocked_user_id) VALUES(?,?,?)', [
      randomUUID(),
      actor,
      target,
    ]);
    expect((await search(opts(B, { input: {} }))).total).toBe(0);
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
    await expect(save(opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }) }))).rejects.toMatchObject(
      { status: 404 },
    );
  });
  it('hides disabled authors immediately; public DTO excludes all private source/owner metadata', async () => {
    const p = await publish();
    const serialized = JSON.stringify(p);
    for (const field of ['owner_id', 'source_id', 'sourceId', 'fingerprint', 'tags', 'create_by'])
      expect(serialized).not.toContain(field);
    expect((await search(opts(A, { input: {} }))).total).toBe(0);
    await db.query("UPDATE user SET del_flag='1' WHERE id='a'");
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
  });
  it('ranks the complete visible set and paginates stably without type sampling', async () => {
    for (let i = 0; i < 7; i++) {
      await db.query('INSERT INTO note(id,create_by,title,content,type) VALUES(?,?,?,?,?)', [
        `n${i}`,
        'a',
        i === 6 ? '精确' : '其他' + i,
        '<p>精确内容</p>',
        'html',
      ]);
      const p = await draft({ sourceId: `n${i}` });
      await decide(opts(ROOT, { id: p.publicId, input: input({ expectedVersion: p.version, action: 'approve' }) }));
    }
    const one = await search(opts(B, { input: { q: '精确', pageSize: 3 } })),
      two = await search(opts(B, { input: { q: '精确', pageSize: 3, page: 2 } }));
    expect(one.total).toBe(7);
    expect(one.items[0].title).toBe('精确');
    expect(new Set([...one.items, ...two.items].map((i) => i.publicId)).size).toBe(6);
    expect((await search(opts(B, { input: { type: 'file' } }))).items).toEqual([]);
  });
  it('uses legacy key indexes for public visibility without weakening source, account or block checks', async () => {
    const submitted = await draft({ kind: 'bookmark', sourceId: 'b' });
    await decide(
      opts(ROOT, { id: submitted.publicId, input: input({ expectedVersion: submitted.version, action: 'approve' }) }),
    );
    const users = Array.from({ length: 128 }, (_, i) => [`unrelated-${i}`, 'user', '{}']);
    await db.query('INSERT INTO user(id,role,preferences) VALUES ?', [users]);
    await db.query('INSERT INTO community_chat_user_identities(user_id,public_id,community_id) VALUES ?', [
      users.map(([id], i) => [id, randomUUID(), `L${String(i).padStart(10, '0')}`]),
    ]);
    await db.query('INSERT INTO bookmark(id,user_id,name,url) VALUES ?', [
      users.map(([id], i) => [`unrelated-bookmark-${i}`, id, '其他资料', `https://example.org/${i}`]),
    ]);
    const [plan] = await db.query(`EXPLAIN SELECT p.public_id ${readJoins} WHERE ${visibleSql()} AND p.owner_id<>?`, [
      B.id,
      B.id,
      B.id,
    ]);
    for (const alias of ['a', 'i', 'au', 'bs']) {
      const steps = plan.filter((step) => step.table === alias);
      expect(steps, alias).not.toHaveLength(0);
      for (const step of steps) expect(step.key, alias).toBe('PRIMARY');
    }
    expect((await search(opts(B, { input: {} }))).items.map((item) => item.publicId)).toEqual([submitted.publicId]);
    await db.query('INSERT INTO community_chat_blocks(id,user_id,blocked_user_id) VALUES(?,?,?)', [
      randomUUID(),
      A.id,
      B.id,
    ]);
    expect((await search(opts(B, { input: {} }))).total).toBe(0);
    await db.query('DELETE FROM community_chat_blocks');
    await db.query("UPDATE bookmark SET del_flag=1 WHERE id='b'");
    await expect(detail(opts(B, { id: submitted.publicId }))).rejects.toMatchObject({ status: 404 });
    await db.query("UPDATE bookmark SET del_flag=0 WHERE id='b'");
    await db.query("UPDATE user SET del_flag='1' WHERE id='a'");
    expect((await search(opts(B, { input: {} }))).total).toBe(0);
  });
  it('saves a revision atomically with its receipt and never repeats creation', async () => {
    const p = await publish(),
      create = vi.fn(async (o) => {
        expect(o.transactionConnection).toBeDefined();
        await o.beforeCreate(o.transactionConnection);
        const id = 'copy';
        await o.transactionConnection.query(
          "INSERT INTO note(id,create_by,title,content,type) VALUES(?,?,?,?,'html')",
          [id, o.userId, o.note.title, o.note.content],
        );
        return { id };
      });
    const request = input({ expectedVersion: p.version });
    const a = await save(opts(B, { id: p.publicId, input: request, createNoteService: create }));
    expect(await save(opts(B, { id: p.publicId, input: request, createNoteService: create }))).toEqual(a);
    expect(create).toHaveBeenCalledTimes(1);
    await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: p.version }) }));
    expect((await db.query("SELECT content FROM note WHERE id='copy'"))[0][0].content).toContain('第一段');
  });
  it('returns existing bookmark/trash copies without overwriting their text', async () => {
    const p = await draft({ kind: 'bookmark', sourceId: 'b' });
    await decide(opts(ROOT, { id: p.publicId, input: input({ expectedVersion: p.version, action: 'approve' }) }));
    const snapshot = await detail(opts(B, { id: p.publicId }));
    await db.query(
      "INSERT INTO bookmark(id,user_id,name,url,description,del_flag) VALUES('existing','b','我的标题',?,'私人说明',1)",
      [snapshot.url],
    );
    const result = await save(opts(B, { id: p.publicId, input: input({ expectedVersion: p.version + 1 }) }));
    expect(result).toMatchObject({ id: 'existing', existing: true, inTrash: true });
    expect((await db.query("SELECT description FROM bookmark WHERE id='existing'"))[0][0].description).toBe('私人说明');
    expect((await savedSource(opts(B, { input: { kind: 'bookmark', resourceId: 'existing' } }))).source).toBeNull();
  });
  const canonicalCopies = {
    createNoteService: (options) => createNote({ ...options, afterCommit: () => {} }),
    createBookmarkService: (options) => createBookmark({ ...options, afterCommit: () => {} }),
  };
  it('only reuses byte-identical bookmark URLs, preserving case-sensitive paths and queries', async () => {
    await db.query("UPDATE bookmark SET url='https://example.org/Article?key=Value' WHERE id='b'");
    const p = await draft({ kind: 'bookmark', sourceId: 'b' });
    await decide(opts(ROOT, { id: p.publicId, input: input({ expectedVersion: p.version, action: 'approve' }) }));
    await db.query(
      "INSERT INTO bookmark(id,user_id,name,url,description,del_flag) VALUES('case-variant','b','私人标题','https://example.org/article?key=value','私人说明',0)",
    );
    const copy = await save(
      opts(B, { id: p.publicId, input: input({ expectedVersion: p.version + 1 }), ...canonicalCopies }),
    );
    expect(copy).toMatchObject({ existing: false, inTrash: false });
    expect(copy.id).not.toBe('case-variant');
    expect((await db.query('SELECT url FROM bookmark WHERE id=?', [copy.id]))[0][0].url).toBe(
      'https://example.org/Article?key=Value',
    );
    expect(
      await save(opts(B, { id: p.publicId, input: input({ expectedVersion: p.version + 1 }), ...canonicalCopies })),
    ).toMatchObject({ id: copy.id, existing: true });
    expect((await db.query("SELECT description FROM bookmark WHERE id='case-variant'"))[0][0].description).toBe(
      '私人说明',
    );
  });
  it('creates real canonical copies, reuses a revision across requests, and detects trashed copies', async () => {
    const p = await publish();
    const first = await save(
      opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }), ...canonicalCopies }),
    );
    expect(first).toMatchObject({ existing: false, inTrash: false });
    const row = (await db.query('SELECT * FROM note WHERE id=?', [first.id]))[0][0];
    expect(row).toMatchObject({ create_by: 'b', title: '知识管理', type: 'html' });
    expect(row.content).toContain('<p>第一段</p><p>第二段</p>');
    expect(row.content).toContain('原作者：成员a');
    expect(row.content).toContain(`href="https://boluo66.top/public-resources/${p.publicId}"`);
    expect(
      await save(opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }), ...canonicalCopies })),
    ).toMatchObject({ id: first.id, existing: true });
    await db.query('UPDATE note SET del_flag=1 WHERE id=?', [first.id]);
    expect(
      await save(opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }), ...canonicalCopies })),
    ).toMatchObject({ id: first.id, inTrash: true });
    const book = await draft({ kind: 'bookmark', sourceId: 'b' });
    await decide(opts(ROOT, { id: book.publicId, input: input({ expectedVersion: book.version, action: 'approve' }) }));
    const result = await save(
      opts(B, { id: book.publicId, input: input({ expectedVersion: book.version + 1 }), ...canonicalCopies }),
    );
    expect(
      (await db.query('SELECT name,description,user_id FROM bookmark WHERE id=?', [result.id]))[0][0],
    ).toMatchObject({ name: '资料', description: '说明', user_id: 'b' });
    expect((await savedSource(opts(B, { input: { kind: 'bookmark', resourceId: result.id } }))).source).toMatchObject({
      authorName: '成员a',
      url: `https://boluo66.top/public-resources/${book.publicId}`,
      revision: 1,
    });
    expect((await savedSource(opts(A, { input: { kind: 'bookmark', resourceId: result.id } }))).source).toBeNull();
  });
  it('recreates a permanently deleted copy without failing on its retained source record', async () => {
    const note = await publish();
    const book = await draft({ kind: 'bookmark', sourceId: 'b' });
    await decide(opts(ROOT, { id: book.publicId, input: input({ expectedVersion: book.version, action: 'approve' }) }));
    for (const p of [note, { ...book, version: book.version + 1 }]) {
      const first = await save(
        opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }), ...canonicalCopies }),
      );
      await db.query(`DELETE FROM ${first.kind === 'note' ? 'note' : 'bookmark'} WHERE id=?`, [first.id]);
      expect((await savedSource(opts(B, { input: { kind: first.kind, resourceId: first.id } }))).source).toBeNull();
      const recreated = await save(
        opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }), ...canonicalCopies }),
      );
      expect(recreated).toMatchObject({ id: first.id, existing: false, inTrash: false });
      expect((await savedSource(opts(B, { input: { kind: first.kind, resourceId: first.id } }))).source).toMatchObject({
        authorName: '成员a',
        revision: 1,
        url: `https://boluo66.top/public-resources/${p.publicId}`,
      });
    }
    expect(
      Number((await db.query("SELECT COUNT(*) n FROM public_resource_saved_sources WHERE recipient_id='b'"))[0][0].n),
    ).toBe(2);
  });
  it('captures safe public attribution with the approved revision; later updates, withdrawals and author purge never alter the copy', async () => {
    await db.query("UPDATE user SET alias=? WHERE id='a'", ['署名 <script>secret</script>']);
    const p = await publish();
    await db.query("UPDATE note SET content='<p>未批准的私人修改</p>' WHERE id='n'");
    const pending = await draft();
    const copy = await save(
      opts(B, {
        id: p.publicId,
        input: input({ expectedVersion: pending.version }),
        env: { ...env, SITE_URL: 'https://example.org/base' },
        ...canonicalCopies,
      }),
    );
    const body = (await db.query('SELECT content FROM note WHERE id=?', [copy.id]))[0][0].content;
    expect(body).toContain('第一段');
    expect(body).not.toContain('未批准的私人修改');
    expect(body).toContain('署名 &lt;script&gt;secret&lt;/script&gt;');
    expect(body).not.toContain('<script>');
    const source = (await savedSource(opts(B, { input: { kind: 'note', resourceId: copy.id } }))).source;
    expect(source).toMatchObject({ url: `https://example.org/public-resources/${p.publicId}`, revision: 1 });
    expect(Object.keys(source).sort()).toEqual(['authorName', 'authorPublicId', 'revision', 'url']);
    await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: pending.version }) }));
    const [rows] = await db.query('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()');
    const tables = new Set(rows.map((r) => r.TABLE_NAME || r.table_name));
    await transaction(db, (c) => purgePublicResourceData(c, tables, A.id));
    expect((await db.query('SELECT content FROM note WHERE id=?', [copy.id]))[0][0].content).toBe(body);
    expect((await savedSource(opts(B, { env: {}, input: { kind: 'note', resourceId: copy.id } }))).source).toEqual(
      source,
    );
    await transaction(db, (c) => purgePublicResourceData(c, tables, B.id));
    expect((await savedSource(opts(B, { input: { kind: 'note', resourceId: copy.id } }))).source).toBeNull();
  });
  it('rolls back canonical creation and its receipt together when the surrounding write fails', async () => {
    const p = await publish(),
      request = input({ expectedVersion: p.version });
    await expect(
      save(
        opts(B, {
          id: p.publicId,
          input: request,
          createNoteService: async (options) => {
            await canonicalCopies.createNoteService(options);
            throw new Error('test rollback');
          },
        }),
      ),
    ).rejects.toThrow('test rollback');
    expect((await receipt(opts(B, { id: request.requestId }))).found).toBe(false);
    expect(Number((await db.query("SELECT COUNT(*) n FROM note WHERE create_by='b'"))[0][0].n)).toBe(0);
  });
  it('serializes saving against withdrawal and preserves the already committed recipient copy', async () => {
    const p = await publish();
    let release, entered;
    const held = new Promise((resolve) => {
        release = resolve;
      }),
      started = new Promise((resolve) => {
        entered = resolve;
      });
    const saving = save(
      opts(B, {
        id: p.publicId,
        input: input({ expectedVersion: p.version }),
        createNoteService: async (options) => {
          const result = await canonicalCopies.createNoteService(options);
          entered();
          await held;
          return result;
        },
      }),
    );
    await started;
    const withdrawing = withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: p.version }) }));
    release();
    const [copy] = await Promise.all([saving, withdrawing]);
    expect((await db.query('SELECT id FROM note WHERE id=?', [copy.id]))[0]).toHaveLength(1);
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
    await expect(
      save(opts(B, { id: p.publicId, input: input({ expectedVersion: p.version }), ...canonicalCopies })),
    ).rejects.toMatchObject({ status: 404 });
  });
  it('stores revision-specific report evidence and requires a versioned moderation decision', async () => {
    const p = await publish();
    const g = await report(opts(B, { id: p.publicId, input: input({ revision: p.revision, reason: '请检查' }) }));
    expect((await moderationDetail(opts(ROOT, { id: p.publicId }))).reports[0].evidence.body).toBe('第一段\n\n第二段');
    await handleReport(
      opts(ROOT, {
        id: g.reportId,
        input: input({ expectedVersion: 0, publicationVersion: p.version, action: 'remove', reason: '确认不适合公开' }),
      }),
    );
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
  });
  it('keeps reported evidence and its AI advice on the reported revision; records dismissals', async () => {
    const p = await publish(),
      g = await report(opts(B, { id: p.publicId, input: input({ revision: p.revision, reason: '核对第一版' }) }));
    await db.query('UPDATE public_resource_review_jobs SET result_json=?', [
      JSON.stringify({ decision: 'hold', categories: ['uncertain'], reason: '第一版疑点', evidence: [] }),
    ]);
    await db.query("UPDATE note SET content='<p>第二版</p>' WHERE id='n'");
    const next = await draft();
    await db.query(
      'UPDATE public_resource_review_jobs SET result_json=? WHERE revision_id=(SELECT pending_revision_id FROM public_resource_publications WHERE public_id=?)',
      [JSON.stringify({ decision: 'pass', categories: [], reason: '第二版建议', evidence: [] }), next.publicId],
    );
    const evidence = await reportDetail(opts(ROOT, { id: g.reportId }));
    expect(evidence.evidence).toMatchObject({ revision: 1, body: '第一段\n\n第二段', ai: { reason: '第一版疑点' } });
    await handleReport(
      opts(ROOT, { id: g.reportId, input: input({ expectedVersion: 0, action: 'dismiss', reason: '核实可公开' }) }),
    );
    expect((await history(opts(ROOT, { id: p.publicId }))).items[0]).toMatchObject({
      action: 'report_dismiss',
      actorName: '成员root',
      revision: 1,
      version: next.version,
    });
  });
  const aiEnv = { ...env, PUBLIC_RESOURCES_AI_ENABLED: 'true' };
  const aiDeps = (runSkill) => ({
    db,
    env: aiEnv,
    runSkill,
    withDispatch: async (_db, userId, fn) => fn({ user: { id: userId, role: 'user' } }),
  });
  async function aiDraft() {
    const p = await preview(opts(A, { input: { kind: 'note', sourceId: 'n' } }));
    return submit(
      opts(A, {
        env: aiEnv,
        input: input({
          kind: 'note',
          sourceId: 'n',
          fingerprint: p.fingerprint,
          confirmed: true,
          expectedVersion: p.expectedVersion,
        }),
      }),
    );
  }
  it('AI pass only records advice and never publishes; validates system billing and no extra resources', async () => {
    const p = await aiDraft(),
      run = vi.fn(async (request, _req, deps) => {
        expect(request.scope.resourceRefs).toEqual([]);
        expect(deps.executionConfigOverrides.billingPolicy).toBe('system');
        await deps.commitValidatedResult({
          response: { result: { decision: 'pass', categories: [], reason: '建议通过', evidence: [] } },
        });
      });
    await consumePublicResourceReview(aiDeps(run));
    expect(run).toHaveBeenCalledTimes(1);
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
    expect((await own(opts())).items[0]).toMatchObject({ status: 'pending_review', aiCompleted: true });
  });
  it('late AI results after withdrawal cannot resurrect a revision', async () => {
    const p = await aiDraft();
    await consumePublicResourceReview(
      aiDeps(async (_request, _req, deps) => {
        await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: p.version }) }));
        await deps.commitValidatedResult({
          response: { result: { decision: 'pass', categories: [], reason: '建议通过', evidence: [] } },
        });
      }),
    );
    expect((await own(opts())).items[0].status).toBe('withdrawn');
    await expect(detail(opts(B, { id: p.publicId }))).rejects.toMatchObject({ status: 404 });
  });
  it('passes complete long material once and holds context failures or invalid evidence without replay', async () => {
    await db.query('UPDATE note SET content=? WHERE id=?', ['<p>' + '字'.repeat(30000) + '</p>', 'n']);
    await aiDraft();
    const run = vi.fn(async (request) => {
      expect(request.input.body).toHaveLength(30000);
      throw Object.assign(new Error('context limit'), { code: 'AI_CONTEXT_INSUFFICIENT' });
    });
    await consumePublicResourceReview(aiDeps(run));
    await consumePublicResourceReview(aiDeps(run));
    expect(run).toHaveBeenCalledTimes(1);
    expect((await own(opts())).items[0]).toMatchObject({ status: 'pending_review', aiCompleted: false });
    await db.query("UPDATE note SET content='<p>新材料</p>' WHERE id='n'");
    await aiDraft();
    await consumePublicResourceReview(
      aiDeps(async (_req, _context, deps) => {
        await deps.commitValidatedResult({
          response: {
            result: {
              decision: 'hold',
              categories: ['uncertain'],
              reason: '疑点',
              evidence: [{ paragraph: 999, quote: '越界' }],
            },
          },
        });
      }),
    );
    expect((await own(opts())).items[0].aiCompleted).toBe(false);
  });
  it('immediately shows review fallback when AI is disabled and invalidates a changed policy result', async () => {
    await aiDraft();
    expect((await own(opts(A, { env: aiEnv }))).items[0].status).toBe('ai_checking');
    expect((await own(opts(A, { env: { ...aiEnv, AI_SKILL_KERNEL_ENABLED: 'false' } }))).items[0]).toMatchObject({
      status: 'pending_review',
      aiCompleted: false,
    });
    expect((await capabilities(opts(A, { env: { ...aiEnv, AI_SKILL_KERNEL_ENABLED: 'false' } }))).aiEnabled).toBe(
      false,
    );
    await consumePublicResourceReview(
      aiDeps(async (_req, _context, deps) => {
        await db.query('UPDATE public_resource_review_jobs SET policy_version=2');
        await deps.commitValidatedResult({
          response: { result: { decision: 'pass', categories: [], reason: '建议通过', evidence: [] } },
        });
      }),
    );
    expect((await own(opts())).items[0].aiCompleted).toBe(false);
    expect((await db.query('SELECT reason_code FROM public_resource_review_jobs'))[0][0].reason_code).toBe(
      'result_invalidated',
    );
  });
  it('disabled AI, insufficient budget, provider uncertainty and expired leases fall back without replay', async () => {
    await aiDraft();
    const run = vi.fn();
    await consumePublicResourceReview({
      ...aiDeps(run),
      env: { ...aiEnv, PUBLIC_RESOURCES_AI_DAILY_BUDGET_TOKENS: '0' },
    });
    expect(run).not.toHaveBeenCalled();
    expect((await own(opts())).items[0].aiCompleted).toBe(false);
    await db.query(
      "UPDATE public_resource_review_jobs SET status='processing',lease_until=DATE_SUB(NOW(),INTERVAL 1 MINUTE)",
    );
    await consumePublicResourceReview(aiDeps(run));
    expect(run).not.toHaveBeenCalled();
    expect(await consumePublicResourceReview(aiDeps(run))).toBe(false);
  });
  it('outbox notifications are idempotent, bell-only, and obsolete pending notices disappear', async () => {
    const p = await draft();
    await consumePublicResourceEvent({ db });
    await consumePublicResourceEvent({ db });
    const [before] = await db.query("SELECT * FROM notification WHERE type='public_resource'");
    expect(before).toHaveLength(1);
    expect(before[0].content).toBeNull();
    expect(Number(before[0].browser_push_pending)).toBe(0);
    await withdraw(opts(A, { id: p.publicId, input: input({ expectedVersion: p.version }) }));
    expect(
      (await db.query(`SELECT id FROM notification WHERE ${publicResourceNotificationVisibleSql(true)}`))[0],
    ).toEqual([]);
  });
  it('merges one moderation intent by recipient, preserves read/delete state on replay, and separates later batches', async () => {
    const first = await draft(),
      second = await draft({ kind: 'bookmark', sourceId: 'b' });
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type) VALUES('other','b','其他作者','<p>正文</p>','html')",
    );
    const third = await draft({ sourceId: 'other' }, B);
    const request = input({
      action: 'approve',
      items: [first, second, third].map((p) => input({ publicId: p.publicId, expectedVersion: p.version })),
    });
    await moderationBatch(opts(ROOT, { input: request }));
    for (let i = 0; i < 10 && (await consumePublicResourceEvent({ db })); i++) {
      /* drain */
    }
    const [notices] = await db.query(
      "SELECT * FROM notification WHERE source_type='public_resource_result' ORDER BY user_id",
    );
    expect(notices).toHaveLength(2);
    expect(
      notices.map((row) => JSON.parse(typeof row.meta === 'string' ? row.meta : JSON.stringify(row.meta)).counts),
    ).toEqual([{ approve: 2 }, { approve: 1 }]);
    expect(notices.every((row) => row.batch_id === request.requestId && !row.browser_push_pending)).toBe(true);
    expect(
      (
        await db.query(
          `SELECT id FROM notification WHERE source_type='public_resource_result' AND ${publicResourceNotificationVisibleSql(true)}`,
        )
      )[0],
    ).toHaveLength(2);
    await db.query("UPDATE notification SET is_read=1,del_flag=1 WHERE source_type='public_resource_result'");
    await db.query("UPDATE public_resource_events SET status='pending',recipient_cursor='' WHERE kind='result'");
    await Promise.all([consumePublicResourceEvent({ db }), consumePublicResourceEvent({ db })]);
    for (let i = 0; i < 10 && (await consumePublicResourceEvent({ db })); i++) {
      /* drain */
    }
    expect((await db.query("SELECT id FROM notification WHERE source_type='public_resource_result'"))[0]).toHaveLength(
      2,
    );
    expect(
      (
        await db.query(
          "SELECT id FROM notification WHERE source_type='public_resource_result' AND (is_read<>1 OR del_flag<>1)",
        )
      )[0],
    ).toHaveLength(0);
    await db.query("UPDATE note SET content='<p>新正文</p>' WHERE id='n'");
    const update = await draft();
    await moderationBatch(
      opts(ROOT, {
        input: input({
          action: 'reject',
          items: [input({ publicId: update.publicId, expectedVersion: update.version, reason: '请核对内容' })],
        }),
      }),
    );
    for (let i = 0; i < 10 && (await consumePublicResourceEvent({ db })); i++) {
      /* drain */
    }
    const [later] = await db.query(
      "SELECT meta FROM notification WHERE source_type='public_resource_result' AND del_flag=0",
    );
    expect(later).toHaveLength(1);
    expect(typeof later[0].meta === 'string' ? JSON.parse(later[0].meta) : later[0].meta).toMatchObject({
      counts: { reject: 1 },
    });
  });
  it('updates a still-arriving batch once for new results without reopening the same count on retry', async () => {
    const first = await draft(),
      second = await draft({ kind: 'bookmark', sourceId: 'b' }),
      batchId = randomUUID();
    const approve = (p) =>
      decide({
        ...opts(ROOT, { id: p.publicId, input: input({ expectedVersion: p.version, action: 'approve' }) }),
        batchId,
      });
    const drain = async () => {
      for (let i = 0; i < 10 && (await consumePublicResourceEvent({ db })); i++) {
        /* drain */
      }
    };
    await approve(first);
    await drain();
    await db.query("UPDATE notification SET is_read=1 WHERE source_type='public_resource_result'");
    await approve(second);
    await drain();
    const [rows] = await db.query("SELECT * FROM notification WHERE source_type='public_resource_result'");
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].is_read)).toBe(0);
    expect(typeof rows[0].meta === 'string' ? JSON.parse(rows[0].meta) : rows[0].meta).toMatchObject({
      counts: { approve: 2 },
    });
    await db.query("INSERT INTO user(id,role,alias,preferences) VALUES('root2','root','另一管理员','{}')");
    await db.query("UPDATE note SET content='<p>再次更新</p>' WHERE id='n'");
    const next = await draft();
    await decide({
      ...opts(
        { id: 'root2', role: 'root' },
        {
          id: next.publicId,
          input: input({ expectedVersion: next.version, action: 'approve' }),
        },
      ),
      batchId,
    });
    await drain();
    const [isolated] = await db.query("SELECT meta FROM notification WHERE source_type='public_resource_result'");
    expect(isolated).toHaveLength(2);
    expect(
      isolated.map((row) => (typeof row.meta === 'string' ? JSON.parse(row.meta) : row.meta).counts.approve).sort(),
    ).toEqual([1, 2]);
  });
  it('notifies Root again for a replacement revision while hiding its obsolete review notice', async () => {
    await draft();
    await consumePublicResourceEvent({ db });
    await db.query("UPDATE note SET content='<p>替换材料</p>' WHERE id='n'");
    await draft();
    await consumePublicResourceEvent({ db });
    expect((await db.query("SELECT id FROM notification WHERE type='public_resource'"))[0]).toHaveLength(2);
    expect(
      (await db.query(`SELECT id FROM notification WHERE ${publicResourceNotificationVisibleSql(true)}`))[0],
    ).toHaveLength(1);
    await consumePublicResourceEvent({ db });
    expect((await db.query("SELECT id FROM notification WHERE type='public_resource'"))[0]).toHaveLength(2);
  });
  it('explicit schema assertions detect missing columns; absence disables only this domain', async () => {
    const publication = await publish();
    expect(await publicResourceSchemaReady(db)).toBe(true);
    const assertions = (await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8'))
      .split('\n')
      .filter((line) => line.startsWith("SELECT 'public_resource_"));
    expect(assertions.length).toBeGreaterThan(50);
    for (const sql of assertions) expect((await db.query(sql))[0]).toEqual([]);
    await db.query('RENAME TABLE public_resource_events TO hidden_public_resource_events');
    try {
      expect((await capabilities(opts())).enabled).toBe(false);
      await transaction(db, (c) => softDeleteResources(c, { userId: 'a', items: [{ type: 'note', id: 'n' }] }));
    } finally {
      await db.query('RENAME TABLE hidden_public_resource_events TO public_resource_events');
    }
    await db.query("UPDATE note SET del_flag=0 WHERE id='n'");
    await expect(detail(opts(B, { id: publication.publicId }))).rejects.toMatchObject({ status: 404 });
  });
  it('account purge removes publication text, jobs, receipts and private relationships', async () => {
    await publish();
    const [rows] = await db.query('SELECT table_name FROM information_schema.tables WHERE table_schema=DATABASE()');
    const tables = new Set(rows.map((r) => r.TABLE_NAME || r.table_name));
    await transaction(db, (c) => purgePublicResourceData(c, tables, 'a'));
    for (const table of ['public_resource_publications', 'public_resource_revisions', 'public_resource_review_jobs'])
      expect(Number((await db.query(`SELECT COUNT(*) AS n FROM ${table}`))[0][0].n)).toBe(0);
  });
  it('mixes both origins before ranking and pagination, with separate personal totals', async () => {
    const published = await publish();
    await db.query(
      "INSERT INTO note(id,create_by,title,content,type) VALUES('mine','b','知识管理','<p>个人</p>','html')",
    );
    await db.query(
      "INSERT INTO bookmark(id,user_id,name,url,description) VALUES('my-bookmark','b','知识管理方法','https://b.example.org','个人说明')",
    );
    const first = await combinedSearch(
      opts(B, { input: { keyword: '知识管理', types: ['bookmark', 'note'], sort: 'relevance', pageSize: 1 } }),
    );
    expect(first.total).toBe(3);
    expect(first.publicTotal).toBe(1);
    expect(first.personalTotal).toBe(2);
    expect(first.personalTypeTotals.note).toBe(1);
    const collected = [...first.items];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await combinedSearch(
        opts(B, {
          input: {
            keyword: '知识管理',
            types: ['bookmark', 'note'],
            sort: 'relevance',
            pageSize: 1,
            cursor,
            includeMetadata: false,
          },
        }),
      );
      collected.push(...page.items);
      cursor = page.nextCursor;
    }
    expect(
      collected
        .slice(0, 2)
        .map((i) => i.origin)
        .sort(),
    ).toEqual(['personal', 'public']);
    expect(collected[2].origin).toBe('personal');
    expect(new Set(collected.map((i) => i.origin + ':' + i.type + ':' + i.id)).size).toBe(3);
    expect(collected.find((i) => i.origin === 'public').publicResource.publicId).toBe(published.publicId);
    expect(collected.find((i) => i.origin === 'public').raw).toBeUndefined();
    await expect(
      combinedSearch(opts(B, { input: { keyword: 'changed', types: ['bookmark', 'note'], cursor: first.nextCursor } })),
    ).rejects.toMatchObject({ code: 'PUBLIC_RESOURCE_CURSOR_INVALID' });
  });
  it('private tags and todo filters do not exclude visible public snapshots', async () => {
    await publish();
    const result = await combinedSearch(
      opts(B, { input: { keyword: '知识管理', types: ['note'], tags: ['不存在的私有标签'], todoStatus: 'completed' } }),
    );
    expect(result.items.map((i) => i.origin)).toEqual(['public']);
    expect(result.personalTotal).toBe(0);
  });
  it('mixed suggestions preserve original per-type and compact capacities', async () => {
    await publish();
    for (let i = 0; i < 8; i++)
      await db.query('INSERT INTO note(id,create_by,title,content,type) VALUES(?,?,?,?,?)', [
        `mine-${i}`,
        'b',
        '知识管理' + i,
        '<p>笔记</p>',
        'html',
      ]);
    for (let i = 0; i < 6; i++)
      await db.query('INSERT INTO bookmark(id,user_id,name,url,description) VALUES(?,?,?,?,?)', [
        `book-${i}`,
        'b',
        '知识管理' + i,
        `https://b.example.org/${i}`,
        '说明',
      ]);
    const grouped = await combinedSearch(
      opts(B, {
        input: { keyword: '知识管理', types: ['bookmark', 'note'], mode: 'suggest', suggestLayout: 'grouped' },
      }),
    );
    expect(grouped.groups.map((g) => g.items.length)).toEqual([5, 5]);
    expect(grouped.items.some((i) => i.origin === 'public')).toBe(true);
    const compact = await combinedSearch(
      opts(B, {
        input: { keyword: '知识管理', types: ['bookmark', 'note'], mode: 'suggest', suggestLayout: 'compact' },
      }),
    );
    expect(compact.items).toHaveLength(8);
  });
  it('long public text remains searchable beyond its transferred summary, with exact counts', async () => {
    await db.query("UPDATE note SET content=? WHERE id='n'", ['<p>开头' + '文字'.repeat(5000) + '深处唯一匹配</p>']);
    const published = await publish();
    const result = await combinedSearch(opts(B, { input: { keyword: '深处唯一匹配', types: ['note'] } }));
    expect(result.total).toBe(1);
    expect(result.publicTotal).toBe(1);
    expect(result.personalTotal).toBe(0);
    expect(result.items).toHaveLength(1);
    expect(result.items[0].publicResource.publicId).toBe(published.publicId);
    expect(result.items[0].publicResource.summary.length).toBeLessThanOrEqual(240);
    expect(result.items[0].publicResource.body).toBeUndefined();
    expect((await detail(opts(B, { id: published.publicId }))).body).toContain('深处唯一匹配');
  });
});
