import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  getToolboxPinnedTools,
  updateToolboxPinnedTools,
  preserveToolboxPinnedTools,
} from './toolboxPinnedToolsService.js';
import { getPublicToolboxCatalog } from '../toolbox/catalog.js';
const ids = getPublicToolboxCatalog()
  .tools.filter((tool) => tool.availability.enabled)
  .map((tool) => tool.id);
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('toolbox pins real transactions', () => {
  const schema = `toolbox_pins_${randomUUID().replaceAll('-', '')}`;
  let admin,
    db,
    created = false;
  const user = { id: 'owner', role: 'user' };
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    await admin.query(`CREATE DATABASE ${schema}`);
    created = true;
    await admin.query(
      `CREATE TABLE ${schema}.user (id VARCHAR(255) PRIMARY KEY, del_flag INT, preferences TEXT) CHARACTER SET utf8mb4`,
    );
    db = mysql.createPool({ socketPath, user: 'root', database: schema, connectionLimit: 5 });
  });
  afterAll(async () => {
    await db?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });
  beforeEach(async () => {
    await db.query('DELETE FROM user');
    await db.query('INSERT INTO user VALUES (?, 0, ?), (?, 1, ?)', [
      'owner',
      JSON.stringify({ theme: 'night', homePage: 'bookmark' }),
      'disabled',
      '{}',
    ]);
  });
  it('concurrent additions and migrations preserve the account authority', async () => {
    const update = (input) => updateToolboxPinnedTools({ user, db, input });
    await Promise.all(ids.slice(0, 6).map((toolId) => update({ toolId, pinned: true })));
    expect(new Set((await getToolboxPinnedTools({ user, db })).toolIds)).toEqual(new Set(ids.slice(0, 6)));
    await Promise.all(ids.slice(0, 6).map((toolId) => update({ toolId, pinned: false })));
    await Promise.all([
      update({ action: 'migrate', toolIds: [ids[0]] }),
      update({ action: 'migrate', toolIds: [ids[1]] }),
    ]);
    expect(await getToolboxPinnedTools({ user, db })).toEqual({ initialized: true, toolIds: [] });
  });
  it('concurrent first migrations have one winner and do not merge stale devices', async () => {
    await Promise.all(
      ids
        .slice(0, 2)
        .map((toolId) => updateToolboxPinnedTools({ user, db, input: { action: 'migrate', toolIds: [toolId] } })),
    );
    const result = await getToolboxPinnedTools({ user, db });
    expect(result.toolIds).toHaveLength(1);
    expect(ids.slice(0, 2)).toContain(result.toolIds[0]);
  });
  it('legacy whole-preference saves racing a pin operation preserve both fields', async () => {
    const saveLegacy = async () => {
      const c = await db.getConnection();
      try {
        await c.beginTransaction();
        const [[row]] = await c.query('SELECT preferences FROM user WHERE id=? FOR UPDATE', [user.id]);
        await c.query('UPDATE user SET preferences=? WHERE id=?', [
          preserveToolboxPinnedTools({ theme: 'day' }, row.preferences),
          user.id,
        ]);
        await c.commit();
      } catch (error) {
        await c.rollback();
        throw error;
      } finally {
        c.release();
      }
    };
    await Promise.all([saveLegacy(), updateToolboxPinnedTools({ user, db, input: { toolId: ids[0], pinned: true } })]);
    const [[row]] = await db.query('SELECT preferences FROM user WHERE id=?', [user.id]);
    expect(JSON.parse(row.preferences)).toEqual({ theme: 'day', toolboxPinnedTools: [ids[0]] });
  });
  it('rejects missing and disabled accounts', async () => {
    for (const id of ['missing', 'disabled']) {
      await expect(getToolboxPinnedTools({ user: { ...user, id }, db })).rejects.toMatchObject({ status: 403 });
      await expect(
        updateToolboxPinnedTools({ user: { ...user, id }, db, input: { toolId: ids[0], pinned: true } }),
      ).rejects.toMatchObject({ status: 403 });
    }
  });
});
