import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requeueArchiveDrafts } from '../apps/server/scripts/requeueOrganizeArchiveDrafts.js';

function fixture(checks = ['archive']) {
  const writes = [];
  const c = { beginTransaction: async () => {}, commit: async () => {}, rollback: async () => {}, release() {},
    query: async (sql, args) => {
      if (sql.startsWith('SELECT user_id')) return [[{ user_id: 'u' }]];
      if (sql.startsWith('SELECT id FROM user')) return [[{ id: 'u' }]];
      if (sql.startsWith('SELECT * FROM organize_suggestion_runs')) return [[{ status: 'completed', run_version: 2, user_id: 'u', options_json: { checks } }]];
      if (sql.startsWith('SELECT s.id')) return [[{ id: 'suggestion', item_id: 'item' }]];
      writes.push([sql, args]); return [{ affectedRows: 1 }];
    } };
  return { getConnection: async () => c, writes };
}
test('默认预检不改任务或建议', async () => {
  const db = fixture();
  assert.deepEqual(await requeueArchiveDrafts(db, 'run'), { runId: 'run', eligible: 1, applied: false, aiRerun: false });
  assert.equal(db.writes.length, 0);
});
test('应用只恢复选中旧建议的资源，不触发 AI 队列', async () => {
  const db = fixture();
  await requeueArchiveDrafts(db, 'run', true);
  assert.equal(db.writes.length, 3);
  assert.deepEqual(db.writes[0][1], ['run', ['suggestion']]);
  assert.deepEqual(db.writes[1][1], ['run', ['item']]);
  assert.ok(db.writes.every(([sql]) => !sql.includes('ai_status=')));
});
test('含 AI 项目的任务拒绝恢复，避免重跑收费分析', async () => {
  const db = fixture(['archive', 'tags']);
  await assert.rejects(requeueArchiveDrafts(db, 'run', true));
  assert.equal(db.writes.length, 0);
});
