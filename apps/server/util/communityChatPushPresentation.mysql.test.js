import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { COMMUNITY_CHAT_TABLE_SQL } from './communityChatSchema.js';
import { readCommunityChatPushPresentations } from './communityChatPushPresentation.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
const schema = 'chat_push_' + randomUUID().replaceAll('-', '');
const env = { COMMUNITY_CHAT_ACCESS_MODE: 'public', COMMUNITY_CHAT_MESSAGING_ENABLED: 'true' };
let db, admin;

describe.skipIf(!socketPath)('chat push preview against real SQL', () => {
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[runtime]] = await admin.query('SELECT @@global.skip_networking AS isolated');
    if (!Number(runtime.isolated)) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema}`);
    db = mysql.createPool({ socketPath, user: 'root', database: schema });
    await db.query("CREATE TABLE user(id varchar(255) PRIMARY KEY, alias varchar(80), role varchar(20) DEFAULT 'user', del_flag tinyint DEFAULT 0, preferences json)");
    for (const sql of COMMUNITY_CHAT_TABLE_SQL) await db.query(sql);
  });
  afterAll(async () => {
    await db?.end();
    if (admin) {
      await admin.query(`DROP DATABASE ${schema}`);
      await admin.end();
    }
  });
  it('uses current message content and suppresses recalled, blocked, deleted and inaccessible text', async () => {
    await db.query("INSERT INTO user(id,alias) VALUES ('alice','接收者'),('bob','发送者')");
    await db.query("INSERT INTO community_chat_rooms(slug,name_zh,name_en) VALUES ('general','客厅','General')");
    const [[room]] = await db.query('SELECT id FROM community_chat_rooms LIMIT 1');
    await db.query("INSERT INTO community_chat_user_identities(user_id,public_id,community_id) VALUES ('alice',?,'A')", [randomUUID()]);
    const messageId = randomUUID();
    await db.query('INSERT INTO community_chat_messages(public_id,room_id,user_id,client_request_id,content) VALUES (?,?,?,?,?)',
      [messageId, room.id, 'bob', randomUUID(), '请看这条消息']);
    const [[message]] = await db.query('SELECT id FROM community_chat_messages WHERE public_id = ?', [messageId]);
    await db.query('INSERT INTO community_chat_message_mentions(message_id,mentioned_user_id) VALUES (?,?)', [message.id, 'alice']);
    const notification = { id: 'n', type: 'community_chat', source_type: 'community_chat_message', source_id: messageId,
      meta: { kind: 'mention' } };
    const preview = () => readCommunityChatPushPresentations(db, 'alice', [notification], env);
    expect((await preview()).get('n')).toMatchObject({ title: '发送者提及了你', body: '请看这条消息' });
    await db.query("UPDATE community_chat_messages SET content = '编辑后的消息' WHERE id = ?", [message.id]);
    expect((await preview()).get('n').body).toBe('编辑后的消息');
    await db.query("UPDATE community_chat_messages SET status = 'recalled' WHERE id = ?", [message.id]);
    expect((await preview()).size).toBe(0);
    await db.query("UPDATE community_chat_messages SET status = 'active' WHERE id = ?", [message.id]);
    await db.query("INSERT INTO community_chat_blocks(id,user_id,blocked_user_id) VALUES (?,'alice','bob')", [randomUUID()]);
    expect((await preview()).size).toBe(0);
    await db.query('DELETE FROM community_chat_blocks');
    await db.query("INSERT INTO community_chat_message_deletions(message_id,user_id) VALUES (?,'alice')", [message.id]);
    expect((await preview()).size).toBe(0);
    await db.query('DELETE FROM community_chat_message_deletions');
    await db.query("INSERT INTO community_chat_members(user_id,status) VALUES ('alice','banned')");
    expect((await preview()).size).toBe(0);
  });
});
