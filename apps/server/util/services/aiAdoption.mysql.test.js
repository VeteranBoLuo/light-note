import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { recordAiProductEvent } from '../aiProductTelemetry.js';
import { AI_OUTCOMES_QUERY } from './productInsightsQueries.js';

const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;
describe.skipIf(!socketPath)('AI adoption linkage (isolated MySQL)', () => {
  let db;
  let created = false;
  const schema = `ai_adoption_${randomUUID().replaceAll('-', '')}`;
  beforeAll(async () => {
    if (!/^\/(?:private\/)?tmp\//.test(socketPath)) throw new Error('Temporary socket required');
    db = await mysql.createConnection({ socketPath, user: 'root' });
    await db.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci`);
    created = true;
    await db.query(`USE ${schema}`);
    await db.query(`CREATE TABLE user (id VARCHAR(64) PRIMARY KEY,role VARCHAR(20),del_flag CHAR(1))`);
    await db.query(
      `CREATE TABLE ai_product_events (id CHAR(36) PRIMARY KEY,actor_user_id VARCHAR(64),subject_user_id VARCHAR(64),admin_context_id VARCHAR(64),admin_context_mode VARCHAR(32),event_name VARCHAR(64),dimensions_json JSON,create_time DATETIME DEFAULT CURRENT_TIMESTAMP)`,
    );
  });
  afterAll(async () => {
    try {
      if (created) await db.query(`DROP DATABASE ${schema}`);
    } finally {
      await db?.end();
    }
  });
  beforeEach(async () => {
    await db.query('DELETE FROM ai_product_events');
    await db.query('DELETE FROM user');
    await db.query(
      "INSERT INTO user VALUES ('one','user','0'),('two','user','0'),('root','root','0'),('test','test','0'),('visitor','visitor','0'),('disabled','user','1')",
    );
  });
  const emit = (event, requestId, kind, user = 'one', mode = 'normal', actor = user) =>
    recordAiProductEvent(
      { actorUserId: actor, subjectUserId: user, adminContextMode: mode },
      {
        event,
        dimensions: {
          requestId,
          skillId: 'bookmark.parse_url',
          measurementVersion: '2',
          outcome: 'success',
          ...(kind ? { adoptionKind: kind } : {}),
        },
      },
      db,
    );
  const report = async () =>
    Object.fromEntries(Object.entries((await db.query(AI_OUTCOMES_QUERY, [30]))[0][0]).map(([k, v]) => [k, Number(v)]));
  it('links the same delivered execution, separates outcome kinds and excludes clicks/failures/legacy from adoption', async () => {
    for (let i = 0; i < 2; i++) {
      await emit('ai_skill_started', 'first');
      await emit('ai_skill_completed', 'first');
      await emit('ai_skill_result_action', 'first');
      await emit('ai_skill_applied', 'first', 'draft');
      await emit('ai_skill_applied', 'first', 'saved');
    }
    await emit('ai_skill_applied', 'first', 'insert');
    await emit('ai_skill_started', 'cancel-save');
    await emit('ai_skill_completed', 'cancel-save');
    await emit('ai_skill_result_action', 'cancel-save');
    await emit('ai_skill_started', 'failed');
    await emit('ai_skill_failed', 'failed');
    await emit('ai_skill_applied', 'failed', 'saved'); // orphan application cannot count
    await emit('ai_skill_completed', 'first', null, 'two');
    await emit('ai_skill_applied', 'first', 'copy', 'two');
    await recordAiProductEvent({ actorUserId: 'one', subjectUserId: 'one' }, { event: 'ai_skill_applied' }, db);
    expect(await report()).toEqual({
      started: 3,
      completed: 3,
      result_actions: 2,
      draft: 1,
      inserted: 1,
      copied: 1,
      saved: 1,
      legacy_events: 1,
    });
    const [[saved]] = await db.query(
      "SELECT COUNT(*) n FROM ai_product_events WHERE event_name='ai_skill_applied' AND JSON_UNQUOTE(JSON_EXTRACT(dimensions_json,'$.adoptionKind'))='saved'",
    );
    expect(saved.n).toBe(2); // first + unlinked failed, each deduplicated at persistence
    const [[row]] = await db.query(
      "SELECT dimensions_json FROM ai_product_events WHERE event_name='ai_skill_started' LIMIT 1",
    );
    expect(row.dimensions_json.requestId).toMatch(/^h_[a-f0-9]{32}$/);
  });
  it('does not join different actors, skills, internal roles, old windows or admin previews', async () => {
    for (const user of ['root', 'test', 'visitor', 'disabled']) {
      await emit('ai_skill_completed', 'same', null, user);
      await emit('ai_skill_applied', 'same', 'saved', user);
    }
    for (const mode of ['readonly', 'maintain']) {
      await emit('ai_skill_completed', 'same', null, 'one', mode, 'root');
      await emit('ai_skill_applied', 'same', 'saved', 'one', mode, 'root');
    }
    await emit('ai_skill_completed', 'same', null, 'one', 'normal', 'root');
    await emit('ai_skill_applied', 'same', 'saved', 'one');
    expect((await report()).saved).toBe(0);
    await emit('ai_skill_completed', 'outside');
    await emit('ai_skill_applied', 'outside', 'saved');
    await db.query(
      "UPDATE ai_product_events SET create_time=DATE_SUB(NOW(),INTERVAL 31 DAY) WHERE event_name='ai_skill_completed'",
    );
    await emit('ai_skill_completed', 'different-skill');
    await recordAiProductEvent(
      { actorUserId: 'one', subjectUserId: 'one' },
      {
        event: 'ai_skill_applied',
        dimensions: {
          requestId: 'different-skill',
          skillId: 'note.transform_text',
          measurementVersion: '2',
          adoptionKind: 'saved',
          outcome: 'success',
        },
      },
      db,
    );
    expect((await report()).saved).toBe(0);
  });
});
