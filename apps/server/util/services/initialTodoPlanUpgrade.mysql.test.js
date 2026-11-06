import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTodoTestSchema } from '../../test-utils/todoSchema.js';
import { localSqlStatements } from '../localSqlStatements.js';
import { buildNewUserSeedContent, newUserSeedResourceId } from './newUserSeedService.js';
import { upgradeInitialTodoPlans } from './initialTodoPlanUpgradeService.js';
import { createSingleTodoPlan } from './todoSingleTaskService.js';
import { exampleHash, rollVisitorExamples, VISITOR_EXAMPLE_VERSION } from './visitorExampleScheduleService.js';

vi.mock('../personalKnowledgeSearch.js', async (importOriginal) => ({
  ...(await importOriginal()),
  invalidatePersonalKnowledgeCache: vi.fn(),
}));
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const now = new Date('2026-11-06T04:00:00Z');

describe.skipIf(!socketPath)('initial todo upgrade on isolated MySQL', () => {
  const schema = `initial_todo_plans_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('ISOLATED_TEST_SOCKET_REQUIRED');
    admin = await mysql.createConnection({ socketPath, user: 'root', dateStrings: true });
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    await admin.query(`USE ${schema}`);
    await admin.query(`CREATE TABLE user (
      id varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci PRIMARY KEY,
      role varchar(16) NOT NULL DEFAULT 'user', del_flag varchar(1) NOT NULL DEFAULT '0'
    ) ENGINE=InnoDB`);
    await installTodoTestSchema(admin);
    for (const file of ['20260723_onboarding_seed_resources.sql', '20260909_visitor_examples.sql']) {
      const source = await readFile(new URL(`../../migrations/${file}`, import.meta.url), 'utf8');
      for (const sql of localSqlStatements(source).filter((sql) => /^CREATE TABLE\b/i.test(sql)))
        await admin.query(sql);
    }
    db = mysql.createPool({ socketPath, user: 'root', database: schema, dateStrings: true, connectionLimit: 4 });
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of [
      'todo_reminders',
      'todo_reminder_jobs',
      'todo_reminder_rules',
      'todo_plan_requests',
      'todo_resource_refs',
      'todo_tag_relations',
      'todo_items',
      'todo_lists',
      'onboarding_seed_resources',
      'visitor_example_maintenance',
      'tag',
      'user',
    ]) {
      await admin.query(`DELETE FROM ${table}`);
    }
    await admin.query("INSERT INTO user (id,role) VALUES ('owner','user'),('other','user'),('visitor','visitor')");
  });
  async function seed(owner = 'owner', lang = 'zh-CN') {
    const content = buildNewUserSeedContent({ lang });
    const listId = randomUUID();
    await admin.query('INSERT INTO todo_lists (id,user_id,name) VALUES (?,?,?)', [
      listId,
      owner,
      content.todoLists[0].name,
    ]);
    const ids = [];
    for (const [index, todo] of content.todos.entries()) {
      const id = randomUUID();
      ids.push(id);
      await admin.query('INSERT INTO todo_items SET ?', [
        {
          id,
          user_id: owner,
          title: todo.title,
          description: todo.description,
          checklist: '[]',
          priority: todo.priority,
          sort_order: (index + 1) * 1000,
          list_id: todo.listKey ? listId : null,
        },
      ]);
      await admin.query(
        "INSERT INTO onboarding_seed_resources (user_id,resource_type,resource_id,seed_version) VALUES (?,'todo',?,'v1')",
        [owner, id],
      );
      for (const key of todo.tagKeys) {
        await admin.query('INSERT IGNORE INTO tag (id,user_id) VALUES (?,?)', [newUserSeedResourceId(owner, `tag:${key}`), owner]);
        await admin.query(
          "INSERT INTO todo_tag_relations (user_id,target_type,target_id,tag_id) VALUES (?,'todo',?,?)",
          [owner, id, newUserSeedResourceId(owner, `tag:${key}`)],
        );
      }
    }
    return ids;
  }
  const versions = async (ids) =>
    (await admin.query('SELECT id,plan_version FROM todo_items WHERE id IN (?) ORDER BY id', [ids]))[0];

  it.each(['zh-CN', 'en-US'])('dry-run and repeated application preserve IDs and original %s content', async (lang) => {
    const ids = await seed('owner', lang);
    const [before] = await admin.query(
      'SELECT id,title,description,status,list_id,checklist,sort_order FROM todo_items ORDER BY id',
    );
    expect((await upgradeInitialTodoPlans(db, { now, userId: 'owner' })).onboarding).toMatchObject({
      eligible: 3,
      upgraded: 0,
    });
    expect((await versions(ids)).every((row) => row.plan_version === 1)).toBe(true);
    expect((await upgradeInitialTodoPlans(db, { apply: true, now, userId: 'owner' })).onboarding.upgraded).toBe(3);
    expect((await versions(ids)).every((row) => row.plan_version === 2)).toBe(true);
    expect(
      (
        await admin.query('SELECT id,title,description,status,list_id,checklist,sort_order FROM todo_items ORDER BY id')
      )[0],
    ).toEqual(before);
    expect((await upgradeInitialTodoPlans(db, { apply: true, now, userId: 'owner' })).onboarding.upgraded).toBe(0);
    expect((await admin.query('SELECT COUNT(*) AS n FROM todo_items'))[0][0].n).toBe(3);
  });
  it('leaves edited, reminded, completed, unmarked and other-owner tasks untouched', async () => {
    const ids = await seed();
    const foreignIds = await seed('other');
    await admin.query('UPDATE todo_items SET description=? WHERE id=?', ['我的说明', ids[0]]);
    await admin.query(
      "INSERT INTO todo_reminders (id,todo_id,user_id,scheduled_at,status) VALUES (?,?,?,'2026-11-07 09:00:00','cancelled')",
      [randomUUID(), ids[1], 'owner'],
    );
    await admin.query("UPDATE todo_items SET status='completed',completed_at='2026-11-05 10:00:00' WHERE id=?", [
      ids[2],
    ]);
    const custom = randomUUID();
    await admin.query('INSERT INTO todo_items SET ?', [
      { id: custom, user_id: 'owner', title: buildNewUserSeedContent().todos[0].title, checklist: '[]' },
    ]);
    const [before] = await admin.query('SELECT * FROM todo_items ORDER BY id');
    expect((await upgradeInitialTodoPlans(db, { apply: true, now, userId: 'owner' })).onboarding.upgraded).toBe(0);
    expect((await admin.query('SELECT * FROM todo_items ORDER BY id'))[0]).toEqual(before);
    expect((await versions(foreignIds)).every((row) => row.plan_version === 1)).toBe(true);
  });
  it('rolls back the entire owner when a later sample update fails', async () => {
    const ids = await seed();
    const sorted = [...ids].sort();
    await admin.query(`CREATE TRIGGER reject_sample_upgrade BEFORE UPDATE ON todo_items FOR EACH ROW
      BEGIN IF OLD.id='${sorted[1]}' AND NEW.plan_version=2 THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT='fixture failure'; END IF; END`);
    try {
      await expect(upgradeInitialTodoPlans(db, { apply: true, now, userId: 'owner' })).rejects.toThrow();
    } finally {
      await admin.query('DROP TRIGGER reject_sample_upgrade');
    }
    expect((await versions(ids)).every((row) => row.plan_version === 1)).toBe(true);
  });
  it('upgrades unchanged managed visitor tasks and keeps the next daily roll consistent', async () => {
    const id = randomUUID();
    await admin.query(
      "INSERT INTO todo_items (id,user_id,title,checklist,status,due_at) VALUES (?,'visitor','托管示例','[]','pending','2026-11-05 18:00:00')",
      [id],
    );
    const [[row]] = await admin.query('SELECT * FROM todo_items WHERE id=?', [id]);
    const entry = {
      type: 'todo',
      id,
      offsets: { due_at: 0, start_at: null, completed_at: null },
      expected: exampleHash(row),
    };
    await admin.query(
      'INSERT INTO visitor_example_maintenance (user_id,version,enabled,manifest_json,last_success_date) VALUES (?,?,1,?,?)',
      [
        'visitor',
        VISITOR_EXAMPLE_VERSION,
        JSON.stringify({ version: VISITOR_EXAMPLE_VERSION, rolling: [entry], notes: [], projects: [] }),
        '2026-11-05',
      ],
    );
    expect((await upgradeInitialTodoPlans(db, { apply: true, now, userId: 'visitor' })).visitor.upgraded).toBe(1);
    expect((await versions([id]))[0].plan_version).toBe(2);
    await expect(rollVisitorExamples(db, 'visitor', { now, invalidate: async () => {} })).resolves.toMatchObject({
      changed: true,
    });
    expect((await admin.query('SELECT due_at,occurrence_date FROM todo_items WHERE id=?', [id]))[0][0]).toEqual({
      due_at: '2026-11-06 18:00:00',
      occurrence_date: '2026-11-06',
    });
    expect((await upgradeInitialTodoPlans(db, { apply: true, now, userId: 'visitor' })).visitor.upgraded).toBe(0);
  });
  it('does not override managed visitor tasks that changed since installation', async () => {
    const id = randomUUID();
    await admin.query("INSERT INTO todo_items (id,user_id,title,checklist) VALUES (?,'visitor','托管示例','[]')", [id]);
    const [[row]] = await admin.query('SELECT * FROM todo_items WHERE id=?', [id]);
    const manifest = {
      version: VISITOR_EXAMPLE_VERSION,
      notes: [],
      projects: [],
      rolling: [{ type: 'todo', id, offsets: { due_at: null }, expected: exampleHash(row) }],
    };
    await admin.query(
      'INSERT INTO visitor_example_maintenance (user_id,version,enabled,manifest_json) VALUES (?,?,1,?)',
      ['visitor', VISITOR_EXAMPLE_VERSION, JSON.stringify(manifest)],
    );
    await admin.query('UPDATE todo_items SET title=? WHERE id=?', ['我修改过', id]);
    expect((await upgradeInitialTodoPlans(db, { apply: true, now, userId: 'visitor' })).visitor).toMatchObject({
      upgraded: 0,
      skipped: 1,
    });
    expect((await versions([id]))[0].plan_version).toBe(1);
  });
  it('internal creation reuses the same v2 instance for an idempotent request', async () => {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const input = { title: '新建普通任务', dueAt: '2026-11-07 18:00:00' };
      const options = { idempotencyKey: 'new-internal-task', suppressUserRewards: true, invalidateSearch: false, now };
      const first = await createSingleTodoPlan(connection, 'owner', input, options);
      const second = await createSingleTodoPlan(connection, 'owner', input, options);
      expect(second.id).toBe(first.id);
      await connection.commit();
      expect((await versions([first.id]))[0].plan_version).toBe(2);
      expect((await admin.query('SELECT COUNT(*) AS n FROM todo_items'))[0][0].n).toBe(1);
      expect((await admin.query('SELECT COUNT(*) AS n FROM todo_reminder_jobs'))[0][0].n).toBe(0);
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  });
});
