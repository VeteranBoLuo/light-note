import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import mysql from 'mysql2/promise';
import { randomUUID } from 'node:crypto';
import { readNativeNotifications, validateNativeCursor } from './nativeNotificationSync.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'native_notification_' + randomUUID().replaceAll('-', '');
let db, admin;
describe('native cursor validation', () => {
  it('rejects malformed and non-string cursor values', () => {
    for (const value of [{ since: [] }, { since: 'invalid' }, { cursor: {} }, { cursor: 'bad' }])
      expect(() => validateNativeCursor(value)).toThrow();
  });
});
describe.skipIf(!socketPath)('native notification real SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (!Number(runtime.isolated)) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema });
    await db.query(`CREATE TABLE notification (
      id char(36) PRIMARY KEY, user_id char(36), type varchar(32), source_type varchar(40),
      meta json, del_flag tinyint DEFAULT 0, recalled tinyint DEFAULT 0,
      create_time datetime DEFAULT CURRENT_TIMESTAMP, browser_push_created_at datetime(6),
      KEY idx_user_time(user_id,create_time))`);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  });
  beforeEach(async () => {
    await db.query('DELETE FROM notification');
  });
  async function add(values = {}, connection = db) {
    const row = { id: randomUUID(), user_id: 'alice', type: 'system', ...values };
    await connection.query('INSERT INTO notification SET ?,browser_push_created_at=NOW(6)', [row]);
    return row.id;
  }
  it('first activation returns no historical rows; later sweeps are owner-scoped', async () => {
    await add();
    const baseline = await readNativeNotifications(db, 'alice');
    expect(baseline.items).toEqual([]);
    const own = await add();
    await add({ user_id: 'bob' });
    const page = await readNativeNotifications(db, 'alice', { since: baseline.since });
    expect(page.items.map((x) => x.id)).toEqual([own]);
    expect(page.owner).toBe('alice');
  });
  it('filters deleted/recalled/non-targeted chat and unavailable community content', async () => {
    const { since } = await readNativeNotifications(db, 'alice');
    await add({ del_flag: 1 });
    await add({ recalled: 1 });
    await add({ type: 'community_chat', meta: '{"kind":"message"}' });
    await add({ source_type: 'community_chat_message', meta: '{"kind":"message"}' });
    await add({ type: 'community_feed' });
    const reply = await add({ type: 'community_chat', meta: '{"kind":"reply"}' });
    const mention = await add({ type: 'community_chat', meta: '{"kind":"mention"}' });
    expect((await readNativeNotifications(db, 'alice', { since })).items.map((x) => x.id)).toEqual([reply, mention]);
  });
  it('keyset pages share a fixed upper bound; next sweep catches late commits and new arrivals', async () => {
    const { since } = await readNativeNotifications(db, 'alice');
    const held = await db.getConnection();
    await held.beginTransaction();
    try {
      const late = await add({}, held);
      const ids = [];
      for (let i = 0; i < 105; i++) ids.push(await add());
      const first = await readNativeNotifications(db, 'alice', { since });
      expect(first.items).toHaveLength(100);
      const newer = await add();
      await held.commit();
      const second = await readNativeNotifications(db, 'alice', { since, cursor: first.cursor });
      expect(second.items).toHaveLength(5);
      expect(second.cursor).toBeNull();
      expect([...first.items, ...second.items].map((x) => x.id)).toEqual(ids);
      const sweep = await readNativeNotifications(db, 'alice', { since });
      expect(sweep.items[0].id).toBe(late);
      const rest = await readNativeNotifications(db, 'alice', { since, cursor: sweep.cursor });
      expect(rest.items.some((x) => x.id === newer)).toBe(true);
    } finally {
      await held.rollback();
      held.release();
    }
  });
  it('limits catchup to 24 hours and does not expose notification text', async () => {
    const id = await add();
    await db.query('UPDATE notification SET create_time=DATE_SUB(NOW(),INTERVAL 25 HOUR) WHERE id=?', [id]);
    expect((await readNativeNotifications(db, 'alice', { since: '2000-01-01 00:00:00.000000' })).items).toEqual([]);
    await add();
    const page = await readNativeNotifications(db, 'alice', { since: '2000-01-01 00:00:00.000000' });
    expect(Object.keys(page.items[0]).sort()).toEqual(['id', 'time']);
  });
});
