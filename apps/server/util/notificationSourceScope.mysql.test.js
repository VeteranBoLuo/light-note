import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest';
import { notificationSourceQuery } from './notificationSourceScope.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = `notification_sources_${randomUUID().replaceAll('-', '')}`;
let db, admin;
describe.skipIf(!socketPath)('notification source recipient SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary MySQL socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (!Number(runtime.isolated)) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema });
    await db.query(`CREATE TABLE notification (
      id varchar(64) PRIMARY KEY, user_id varchar(255) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci,
      source_type varchar(40), source_id varchar(64), type varchar(32), batch_id varchar(64), meta JSON, del_flag int DEFAULT 0,
      UNIQUE KEY uk_notification_source(user_id,source_type,source_id), KEY idx_batch(batch_id))`);
    for (const [table, owner] of [
      ['community_posts', 'author_id'],
      ['community_comments', 'author_id'],
      ['public_resource_publications', 'owner_id'],
      ['community_chat_messages', 'user_id'],
      ['community_chat_user_identities', 'user_id'],
    ]) {
      const publicIdType =
        table === 'community_chat_messages'
          ? 'varchar(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci'
          : 'char(36) CHARACTER SET ascii COLLATE ascii_bin';
      await db.query(
        `CREATE TABLE ${table} (public_id ${publicIdType} PRIMARY KEY, ${owner} varchar(255) CHARACTER SET utf8 COLLATE utf8_general_ci, KEY idx_owner(${owner}))`,
      );
    }
    await db.query("INSERT INTO community_posts VALUES ('post','author'),('other-post','other-author')");
    await db.query("INSERT INTO community_comments VALUES ('comment','author')");
    await db.query("INSERT INTO community_chat_messages VALUES ('message','author')");
    await db.query("INSERT INTO public_resource_publications VALUES ('publication','author')");
    await db.query("INSERT INTO community_chat_user_identities VALUES ('actor-public','author')");
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
  async function add(userId, sourceType, sourceId, meta = {}, values = {}) {
    const id = randomUUID();
    const kind = String(sourceType || '');
    await db.query('INSERT INTO notification SET ?', [
      {
        id,
        user_id: userId,
        source_type: sourceType,
        source_id: sourceId,
        type: kind.startsWith('community_feed')
          ? 'community_feed'
          : kind.startsWith('public_resource')
            ? 'public_resource'
            : sourceType === 'community_chat_message'
              ? 'community_chat'
              : 'todo_reminder',
        meta: JSON.stringify(meta),
        ...values,
      },
    ]);
    return id;
  }
  async function recipients(kind, ids, online = ['alice', 'bob'], userIds) {
    const query = notificationSourceQuery({ kind, ids, ...(userIds ? { userIds } : {}) }, online);
    if (!query) return [];
    return (await db.query(query.sql, query.params))[0].map((row) => row.userId).sort();
  }

  it('finds recalled/archived batches and legacy single-row IDs without notifying offline or unrelated accounts', async () => {
    await add('alice', 'system', 'a', {}, { batch_id: 'batch', del_flag: 1 });
    await add('offline', 'system', 'b', {}, { batch_id: 'batch', del_flag: 1 });
    await add('bob', 'system', 'c', {}, { batch_id: 'other' });
    expect(await recipients('batch', ['batch'])).toEqual(['alice']);
    const id = await add('bob', 'system', 'legacy', {}, { del_flag: 1 });
    expect(await recipients('batch', [id])).toEqual(['bob']);
  });

  it('resolves chat, feed posts/comments and publication revisions by existing notification facts', async () => {
    await add('alice', 'community_chat_message', 'message');
    await add('bob', 'community_chat_message', 'other');
    expect(await recipients('chat', ['message'])).toEqual(['alice']);
    await add('alice', 'community_feed_review', 'post', { postId: 'post' });
    await add('bob', 'community_feed_comment_like', 'like', { postId: 'post', commentId: 'comment' });
    expect(await recipients('feed_post', ['post'])).toEqual(['alice', 'bob']);
    expect(await recipients('feed_comment', ['comment'])).toEqual(['bob']);
    await add('alice', 'public_resource_review', 'publication:1', { publicationId: 'publication' });
    await add('bob', 'public_resource_result', 'action', { publicationId: 'publication' });
    expect(await recipients('publication', ['publication'])).toEqual(['alice', 'bob']);
  });

  it('limits todo changes to their owner, including historical reminders without a source key', async () => {
    await add('alice', null, null, { todoId: 'todo' }, { type: 'todo_reminder' });
    await add('bob', 'todo_reminder_job', 'job', { todoId: 'todo' });
    expect(await recipients('todo', ['todo'], ['alice', 'bob'], ['alice'])).toEqual(['alice']);
  });

  it('targets author suspension/deletion/role changes through posts, comments, likes, chat and review sources', async () => {
    await add('alice', 'community_feed_post_like', 'post-like', { postId: 'post' });
    await add('bob', 'community_feed_post_like', 'other-like', { postId: 'other-post' });
    expect(await recipients('actor', ['author'])).toEqual(['alice']);
    for (const [sourceType, sourceId, meta] of [
      ['community_feed_comment_like', 'comment-like', { commentId: 'comment' }],
      ['community_feed_post_like', 'by-actor', { actorId: 'actor-public' }],
      ['community_chat_message', 'message', {}],
      ['public_resource_review', 'publication:1', {}],
    ]) {
      await db.query("DELETE FROM notification WHERE user_id='alice'");
      await add('alice', sourceType, sourceId, meta);
      expect(await recipients('actor', ['author'])).toEqual(['alice']);
    }
  });

  it('uses owner/source index ranges in the presence of a large unrelated offline history', async () => {
    const records = Array.from({ length: 4000 }, (_, i) => [
      `n-${i}`,
      `offline-${i}`,
      'community_chat_message',
      `message-${i}`,
      'community_chat',
      '{}',
    ]);
    await db.query('INSERT INTO notification(id,user_id,source_type,source_id,type,meta) VALUES ?', [records]);
    await add('alice', 'community_chat_message', 'message');
    await db.query('ANALYZE TABLE notification');
    const query = notificationSourceQuery({ kind: 'chat', ids: ['message'] }, ['alice', 'bob']);
    const [plan] = await db.query('EXPLAIN ' + query.sql, query.params);
    const scan = plan.find((row) => row.table === 'n');
    expect(scan.key).toBe('uk_notification_source');
    expect(['range', 'ref']).toContain(scan.type);
    expect(Number(scan.rows)).toBeLessThan(10);
    expect(await recipients('chat', ['message'])).toEqual(['alice']);
  });
});
