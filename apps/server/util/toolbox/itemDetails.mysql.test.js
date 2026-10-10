import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
// Reward delivery is orthogonal; the real todo service still writes on the board's connection.
vi.mock('../growthActivityHistory.js', () => ({ recordTodoCreation: vi.fn(), recordTodoCompletion: vi.fn() }));
import { operateBoard } from './board.js';
import {
  getToolboxWorkspace,
  listToolboxWorkspaces,
  listToolboxHomeWorkspaces,
  deleteToolboxWorkspace,
} from './workspace.js';
import { compileWorkshopBriefFacts } from '../services/dailyBriefWorkshop.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('项目证据、结论与行动 · 真实 MySQL', () => {
  const schema = `workspace_details_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const migration = async (name) => {
    const source = await readFile(new URL(`../../migrations/${name}`, import.meta.url), 'utf8');
    for (const sql of source
      .split('\n')
      .filter((line) => !line.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .filter((sql) => sql.trim()))
      await admin.query(sql);
  };
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await admin.query(`USE ${schema}`);
    await admin.query('CREATE TABLE user (id VARCHAR(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY)');
    await migration('20260715_todo_action_center.sql');
    await admin.query('ALTER TABLE todo_items ADD occurrence_date DATE DEFAULT NULL');
    await migration('20260829_toolbox_workspaces.sql');
    await migration('20260908_toolbox_board.sql');
    await migration('20261010_workspace_item_details.sql');
    await migration('20261010_workspace_item_details.sql');
    for (const sql of [
      'CREATE TABLE note (id VARCHAR(64) PRIMARY KEY, create_by VARCHAR(64), title VARCHAR(255), update_time DATETIME, del_flag INT DEFAULT 0)',
      'CREATE TABLE bookmark (id VARCHAR(64) PRIMARY KEY, user_id VARCHAR(64), name VARCHAR(255), url VARCHAR(255), create_time DATETIME, del_flag INT DEFAULT 0)',
      'CREATE TABLE bookmark_snapshot (bookmark_id VARCHAR(64) PRIMARY KEY, update_time DATETIME)',
      'CREATE TABLE files (id VARCHAR(64) PRIMARY KEY, create_by VARCHAR(64), file_name VARCHAR(255), create_time DATETIME, del_flag INT DEFAULT 0)',
    ])
      await admin.query(sql);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 4 });
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of [
      'toolbox_board_operations',
      'toolbox_workspace_items',
      'toolbox_workspace_resources',
      'toolbox_workspace_sessions',
      'toolbox_workspaces',
      'todo_reminders',
      'todo_items',
      'note',
      'bookmark',
      'files',
      'user',
    ])
      await admin.query(`DELETE FROM ${table}`);
    await admin.query("INSERT INTO user VALUES ('owner'),('other')");
    await admin.query(
      "INSERT INTO toolbox_workspaces (id,user_id,kind,title,goal,next_step) VALUES ('project','owner','research','项目','核对结论','验证发现')",
    );
    await admin.query(
      "INSERT INTO note VALUES ('evidence','owner','资料标题','2026-10-01',0),('conclusion','owner','完整论述','2026-10-01',0),('foreign','other','不可泄露','2026-10-01',0)",
    );
    await admin.query(
      "INSERT INTO toolbox_workspace_resources (workspace_id,user_id,resource_type,resource_id,resource_title,resource_version) VALUES ('project','owner','note','evidence','旧标题','old')",
    );
    await admin.query(
      "INSERT INTO toolbox_workspace_items (id,workspace_id,user_id,lane,title,content,status) VALUES ('finding','project','owner','knowledge','发现','摘要','done'),('action','project','owner','action','核对发现','行动说明','open')",
    );
    await admin.query(
      "INSERT INTO todo_items (id,user_id,title,status,due_at) VALUES ('task','owner','正式待办','pending','2026-10-10 23:59:59'),('foreign-task','other','别人的待办','completed',NULL)",
    );
  });
  const read = () => getToolboxWorkspace({ userId: 'owner', workspaceId: 'project', database: db });
  const run = (command, expectedVersion, requestId = randomUUID()) =>
    operateBoard({
      userId: 'owner',
      workspaceId: 'project',
      database: db,
      input: { command, expectedVersion, requestId },
    });
  const details = (itemId = 'finding', extra = {}) => ({
    type: 'details',
    itemId,
    todoId: null,
    details: {
      evidence: [{ type: 'note', resourceId: 'evidence', explanation: '支持当前判断' }],
      conclusionStatus: 'tentative',
      conclusionNoteId: 'conclusion',
    },
    ...extra,
  });

  it('旧卡片不自动确认；保存权威标题与版本，来源更新/删除不复制正文或丢失解释', async () => {
    expect((await read()).items.find((item) => item.id === 'finding').details.conclusionStatus).toBeNull();
    let saved = await run(details(), 0);
    let item = saved.workspace.items.find((item) => item.id === 'finding');
    expect(item.details).toMatchObject({
      conclusionStatus: 'tentative',
      conclusionNote: { id: 'conclusion', title: '完整论述' },
      evidence: [{ title: '资料标题', explanation: '支持当前判断', available: true, changed: false }],
    });
    const originalVersion = item.details.evidence[0].version;
    await admin.query("UPDATE note SET title='更新后的资料',update_time='2026-10-02' WHERE id='evidence'");
    saved = await run(details(), 1);
    expect(saved.workspace.items.find((item) => item.id === 'finding').details.evidence[0]).toMatchObject({
      title: '资料标题',
      currentTitle: '更新后的资料',
      version: originalVersion,
      changed: true,
    });
    const reviewed = details();
    reviewed.details.evidence[0].refresh = true;
    saved = await run(reviewed, 2);
    expect(saved.workspace.items.find((item) => item.id === 'finding').details.evidence[0]).toMatchObject({
      title: '更新后的资料',
      changed: false,
    });
    await admin.query("UPDATE note SET del_flag=1 WHERE id IN ('evidence','conclusion')");
    saved = await run(details(), 3);
    item = saved.workspace.items.find((item) => item.id === 'finding');
    expect(item.details.evidence[0]).toMatchObject({ available: false, explanation: '支持当前判断' });
    expect(item.details.conclusionNote.available).toBe(false);
    await expect(run(reviewed, 4)).rejects.toMatchObject({ code: 'BOARD_REFERENCE_UNAVAILABLE' });
  });
  it('越权、非项目资料、重复引用、上限及非行动绑定都回滚', async () => {
    const foreignEvidence = details();
    foreignEvidence.details.evidence[0].resourceId = 'foreign';
    const outsideProject = details();
    outsideProject.details.evidence[0].resourceId = 'conclusion';
    const foreignNote = details();
    foreignNote.details.conclusionNoteId = 'foreign';
    const duplicate = details();
    duplicate.details.evidence.push(duplicate.details.evidence[0]);
    const tooMany = details();
    tooMany.details.evidence = Array.from({ length: 21 }, (_, i) => ({
      type: 'note',
      resourceId: `n${i}`,
      explanation: '',
    }));
    for (const command of [
      foreignEvidence,
      outsideProject,
      foreignNote,
      duplicate,
      tooMany,
      details('action', { todoId: 'foreign-task' }),
      details('finding', { todoId: 'task' }),
    ])
      await expect(run(command, 0)).rejects.toBeDefined();
    expect((await read()).boardVersion).toBe(0);
    expect((await admin.query('SELECT COUNT(*) AS n FROM toolbox_board_operations'))[0][0].n).toBe(0);
    await expect(
      operateBoard({
        userId: 'other',
        workspaceId: 'project',
        database: db,
        input: { command: details(), requestId: randomUUID(), expectedVersion: 0 },
      }),
    ).rejects.toMatchObject({ code: 'BOARD_NOT_FOUND' });
  });
  it('绑定一个具体实例后，详情、首页统计与到期提醒共同读取实时待办', async () => {
    await run(details('action', { todoId: 'task' }), 0);
    let workspace = await read();
    expect(workspace.items.find((item) => item.id === 'action')).toMatchObject({
      status: 'open',
      dueOn: '2026-10-10',
      linkedTodo: { status: 'pending', available: true },
    });
    const briefDb = {
      query: (sql, args) => (sql.includes('FROM toolbox_artifacts') ? Promise.resolve([[]]) : db.query(sql, args)),
    };
    const calendar = { date: '2026-10-10', yesterdayStart: '2026-10-09', locale: 'zh-CN' };
    expect(
      (await compileWorkshopBriefFacts(briefDb, 'owner', calendar)).find((fact) => fact.id === 'workshop_due'),
    ).toMatchObject({ count: 1, dueDate: '2026-10-10' });
    await admin.query("UPDATE todo_items SET status='completed',completed_at=NOW(),due_at=NULL WHERE id='task'");
    // A subsequent occurrence is a different concrete instance and must not replace the saved link.
    await admin.query(
      "INSERT INTO todo_items (id,user_id,title,status,occurrence_date) VALUES ('next-instance','owner','正式待办','pending','2026-10-11')",
    );
    workspace = await read();
    expect(workspace).toMatchObject({ openItemCount: 0, completedItemCount: 1 });
    expect(workspace.items.find((item) => item.id === 'action')).toMatchObject({
      status: 'done',
      todoId: 'task',
      dueOn: null,
      details: { conclusionStatus: 'tentative' },
    });
    expect((await listToolboxWorkspaces({ userId: 'owner', database: db }))[0]).toMatchObject({
      openItemCount: 0,
      completedItemCount: 1,
    });
    expect((await listToolboxHomeWorkspaces({ userId: 'owner', database: db })).recent[0]).toMatchObject({
      openItemCount: 0,
      completedItemCount: 1,
    });
    expect(
      (await compileWorkshopBriefFacts(briefDb, 'owner', calendar)).find((fact) => fact.id === 'workshop_due').count,
    ).toBe(0);
    await expect(run({ type: 'status', itemId: 'action', status: 'open' }, 1)).rejects.toMatchObject({
      code: 'BOARD_TODO_AUTHORITY',
    });
    await run({ type: 'convert', itemId: 'action', lane: 'knowledge', title: '行动成果', dueOn: null }, 1);
    expect((await read()).items.filter((item) => item.sourceItemId === 'action')).toHaveLength(1);
    await admin.query("UPDATE todo_items SET del_flag=1 WHERE id='task'");
    workspace = await read();
    expect(workspace).toMatchObject({ openItemCount: 0, completedItemCount: 0 });
    expect(workspace.items.find((item) => item.id === 'action').linkedTodo.available).toBe(false);
    await run(details('action'), 2);
    expect((await read()).items.find((item) => item.id === 'action')).toMatchObject({
      todoId: null,
      status: 'open',
      dueOn: null,
    });
    expect((await admin.query("SELECT id FROM todo_items WHERE id='next-instance'"))[0]).toHaveLength(1);
  });
  it('新建待办与绑定同事务，重放不重复创建，撤销和删除项目保留正式资源', async () => {
    const requestId = randomUUID();
    const command = { type: 'createTodo', itemId: 'action' };
    const first = await run(command, 0, requestId);
    const todoId = first.workspace.items.find((item) => item.id === 'action').todoId;
    expect(todoId).toBeTruthy();
    const replay = await run(command, 0, requestId);
    expect(replay.workspace.items.find((item) => item.id === 'action').todoId).toBe(todoId);
    expect((await admin.query('SELECT COUNT(*) AS n FROM todo_items'))[0][0].n).toBe(3);
    await expect(run(command, 1)).rejects.toMatchObject({ code: 'BOARD_TODO_ALREADY_BOUND' });
    await run({ type: 'undo', undoId: requestId }, 1);
    expect((await read()).items.find((item) => item.id === 'action').todoId).toBeNull();
    await deleteToolboxWorkspace({ userId: 'owner', workspaceId: 'project', database: db });
    expect((await admin.query('SELECT id FROM todo_items WHERE id=?', [todoId]))[0]).toHaveLength(1);
    expect((await admin.query("SELECT id FROM note WHERE id='conclusion'"))[0]).toHaveLength(1);
  });
  it('并发版本冲突只接受一份；任务写入后绑定失败会整体回滚', async () => {
    const results = await Promise.allSettled([run(details(), 0), run(details(), 0)]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((result) => result.status === 'rejected').reason.code).toBe('BOARD_VERSION_CONFLICT');
    const count = (await admin.query('SELECT COUNT(*) AS n FROM todo_items'))[0][0].n;
    await admin.query(
      "CREATE TRIGGER fail_workspace_link BEFORE UPDATE ON toolbox_workspace_items FOR EACH ROW SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'",
    );
    try {
      await expect(run({ type: 'createTodo', itemId: 'action' }, 1)).rejects.toThrow();
    } finally {
      await admin.query('DROP TRIGGER fail_workspace_link');
    }
    expect((await admin.query('SELECT COUNT(*) AS n FROM todo_items'))[0][0].n).toBe(count);
    expect((await read()).boardVersion).toBe(1);
  });
  it('增量迁移可重复执行，Schema 只读断言识别缺失列', async () => {
    const source = await readFile(new URL('../../migrations/schema-assertions.sql', import.meta.url), 'utf8');
    const sql = source.split(';').find((sql) => sql.includes("'toolbox_board_missing_column'"));
    expect((await admin.query(sql))[0]).toEqual([]);
    await admin.query('ALTER TABLE toolbox_workspace_items DROP COLUMN details_json');
    expect((await admin.query(sql))[0]).toEqual([
      { check_name: 'toolbox_board_missing_column', detail: 'toolbox_workspace_items.details_json' },
    ]);
    await migration('20261010_workspace_item_details.sql');
  });
  it('creates an action with evidence, note and existing task atomically', async () => {
    const command = {
      ...details(),
      type: 'create',
      lane: 'action',
      title: 'New action',
      content: 'Summary',
      todoId: 'task',
    };
    delete command.itemId;
    const saved = await run(command, 0);
    const item = saved.workspace.items.find((item) => item.id === saved.focusItemId);
    expect(item).toMatchObject({
      todoId: 'task',
      linkedTodo: { title: '正式待办' },
      details: { evidence: [{ resourceId: 'evidence' }], conclusionNote: { id: 'conclusion' } },
    });
    expect(saved.workspace.items).toHaveLength(3);
  });
  it('replaying create-with-task is idempotent; undo keeps the independent task', async () => {
    const command = {
      ...details(),
      type: 'create',
      lane: 'action',
      title: 'New task',
      content: 'Task description',
      dueOn: '2026-10-18',
      createLinkedTodo: true,
    };
    delete command.itemId;
    const request = randomUUID();
    const saved = await run(command, 0, request);
    const item = saved.workspace.items.find((item) => item.id === saved.focusItemId);
    expect(item.linkedTodo).toMatchObject({ title: 'New task', status: 'pending', dueOn: '2026-10-18' });
    const repeated = await run(command, 0, request);
    expect(repeated.focusItemId).toBe(item.id);
    const [[{ count }]] = await admin.query('SELECT COUNT(*) AS count FROM todo_items');
    expect(count).toBe(3);
    await run({ type: 'undo', undoId: request }, 1);
    const [[{ count: remaining }]] = await admin.query('SELECT COUNT(*) AS count FROM todo_items');
    expect(remaining).toBe(3);
  });
  it('invalid ownership rolls back the new item, task, version and receipt', async () => {
    const command = {
      ...details(),
      type: 'create',
      lane: 'action',
      title: 'Rejected',
      content: '',
      createLinkedTodo: true,
    };
    delete command.itemId;
    command.details.conclusionNoteId = 'foreign';
    await expect(run(command, 0)).rejects.toMatchObject({ code: 'BOARD_REFERENCE_UNAVAILABLE' });
    expect((await read()).items).toHaveLength(2);
    expect((await read()).boardVersion).toBe(0);
    const [[{ count }]] = await admin.query('SELECT COUNT(*) AS count FROM todo_items');
    expect(count).toBe(2);
    const [[{ receipts }]] = await admin.query('SELECT COUNT(*) AS receipts FROM toolbox_board_operations');
    expect(receipts).toBe(0);
  });
  it('derived actions take their own references without changing the source finding', async () => {
    const saved = await run(
      { ...details(), type: 'convert', lane: 'action', title: 'Derived', content: 'Plan', todoId: 'task' },
      0,
    );
    expect(saved.workspace.items.find((item) => item.id === saved.focusItemId)).toMatchObject({
      sourceItemId: 'finding',
      todoId: 'task',
      details: { conclusionNote: { id: 'conclusion' } },
    });
    expect(saved.workspace.items.find((item) => item.id === 'finding')).toMatchObject({
      title: '发现',
      todoId: null,
      details: { evidence: [] },
    });
  });
});
