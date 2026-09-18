import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getCommunityPreferences, updateCommunityPreferences } from './communityPreferenceService.js';
import { preserveCommunityPreference } from '../communityPreferences.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('community preference real transactions', () => {
  const schema = `community_p1_${randomUUID().replaceAll('-', '')}`;
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
  it('simultaneous expectedRevision writes have exactly one winner', async () => {
    const results = await Promise.allSettled(
      Array.from({ length: 4 }, () =>
        updateCommunityPreferences({ user, db, input: { defaultView: 'chat', expectedRevision: 0 } }),
      ),
    );
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(
      results.filter((r) => r.status === 'rejected').every((r) => r.reason.code === 'COMMUNITY_PREFERENCE_CONFLICT'),
    ).toBe(true);
    expect(await getCommunityPreferences({ user, db })).toMatchObject({ revision: 1 });
  });
  it('whole-account preference save racing dedicated write preserves both facts', async () => {
    const saveLegacy = async () => {
      const c = await db.getConnection();
      try {
        await c.beginTransaction();
        const [[row]] = await c.query('SELECT preferences FROM user WHERE id=? FOR UPDATE', [user.id]);
        await c.query('UPDATE user SET preferences=? WHERE id=?', [
          preserveCommunityPreference({ theme: 'day', homePage: 'noteLibrary' }, row.preferences),
          user.id,
        ]);
        await c.commit();
      } finally {
        c.release();
      }
    };
    await Promise.all([
      saveLegacy(),
      updateCommunityPreferences({ user, db, input: { defaultView: 'chat', expectedRevision: 0 } }),
    ]);
    const [[row]] = await db.query('SELECT preferences FROM user WHERE id=?', [user.id]);
    expect(JSON.parse(row.preferences)).toEqual({
      theme: 'day',
      homePage: 'noteLibrary',
      communityNavigation: { defaultView: 'chat', revision: 1 },
    });
  });
  it('missing and disabled accounts cannot read or persist preferences', async () => {
    for (const id of ['missing', 'disabled']) {
      await expect(getCommunityPreferences({ user: { ...user, id }, db })).rejects.toMatchObject({
        code: 'COMMUNITY_ACCOUNT_UNAVAILABLE',
      });
      await expect(
        updateCommunityPreferences({ user: { ...user, id }, db, input: { defaultView: 'chat', expectedRevision: 0 } }),
      ).rejects.toMatchObject({ code: 'COMMUNITY_ACCOUNT_UNAVAILABLE' });
    }
  });
});
