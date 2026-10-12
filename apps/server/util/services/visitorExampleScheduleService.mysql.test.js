import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exampleHash,
  parseExampleManifest,
  rollVisitorExamples,
  VISITOR_EXAMPLE_VERSION,
} from './visitorExampleScheduleService.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('visitor maintenance across board schema changes', () => {
  const schema = `visitor_roll_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const readAction = async () => (await db.query("SELECT * FROM toolbox_workspace_items WHERE id='action'"))[0][0];
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    await admin.query(`USE ${schema}`);
    await admin.query('CREATE TABLE user (id VARCHAR(64) PRIMARY KEY,role VARCHAR(24),del_flag INT)');
    await admin.query(`CREATE TABLE toolbox_workspace_items (
      id VARCHAR(64) PRIMARY KEY,user_id VARCHAR(64),lane VARCHAR(24),status VARCHAR(24),
      title VARCHAR(255),content TEXT,due_on DATE,updated_at DATETIME,
      details_json JSON DEFAULT NULL,linked_todo_id CHAR(36) DEFAULT NULL)`);
    await admin.query(`CREATE TABLE visitor_example_maintenance (
      user_id VARCHAR(64) PRIMARY KEY,version VARCHAR(64),enabled INT,manifest_json JSON,last_success_date DATE)`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 4 });
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    for (const table of ['visitor_example_maintenance', 'toolbox_workspace_items', 'user'])
      await admin.query(`DELETE FROM ${table}`);
    await admin.query("INSERT INTO user VALUES ('visitor','visitor',0)");
    await admin.query(`INSERT INTO toolbox_workspace_items (id,user_id,lane,status,title,content,due_on,updated_at)
      VALUES ('action','visitor','action','open','Original','Original body','2026-10-10','2026-10-10 12:00:00')`);
    const { details_json, linked_todo_id, ...legacy } = await readAction();
    await admin.query('INSERT INTO visitor_example_maintenance VALUES (?,?,1,?,?)', [
      'visitor',
      VISITOR_EXAMPLE_VERSION,
      JSON.stringify({
        version: VISITOR_EXAMPLE_VERSION,
        notes: [],
        projects: [],
        rolling: [{ type: 'action', id: 'action', offsets: { due_on: 0 }, expected: exampleHash(legacy) }],
      }),
      '2026-10-10',
    ]);
  });
  it('rolls the exact legacy row once, records the full new hash, and remains idempotent', async () => {
    const invalidate = vi.fn().mockResolvedValue();
    const options = { now: new Date('2026-10-12T04:00:00Z'), invalidate };
    expect(await rollVisitorExamples(db, 'visitor', options)).toEqual({ changed: true, date: '2026-10-12' });
    const [[date]] = await admin.query("SELECT DATE_FORMAT(due_on,'%Y-%m-%d') date FROM toolbox_workspace_items");
    expect(date.date).toBe('2026-10-12');
    const [[state]] = await db.query('SELECT manifest_json FROM visitor_example_maintenance');
    expect(parseExampleManifest(state.manifest_json).rolling[0].expected).toBe(exampleHash(await readAction()));
    expect(await rollVisitorExamples(db, 'visitor', options)).toEqual({ changed: false });
    expect(invalidate).toHaveBeenCalledOnce();
  });
  it.each([
    "title='Edited'",
    "details_json=JSON_OBJECT('description','Edited')",
    "linked_todo_id='00000000-0000-4000-8000-000000000001'",
  ])('rolls back real edits instead of accepting a changed baseline: %s', async (change) => {
    await admin.query(`UPDATE toolbox_workspace_items SET ${change}`);
    await expect(rollVisitorExamples(db, 'visitor', { now: new Date('2026-10-12T04:00:00Z') })).rejects.toMatchObject({
      code: 'VISITOR_OBJECT_CHANGED',
    });
    const [[dates]] = await admin.query(`SELECT DATE_FORMAT(last_success_date,'%Y-%m-%d') maintained,
      (SELECT DATE_FORMAT(due_on,'%Y-%m-%d') FROM toolbox_workspace_items LIMIT 1) due FROM visitor_example_maintenance`);
    expect(dates).toEqual({ maintained: '2026-10-10', due: '2026-10-10' });
  });
});
