// 默认只读预检；仅 --apply 将指定已完成、仅存档任务的旧格式未审核项重新交给 Worker。
import { pathToFileURL } from 'node:url';

export async function requeueArchiveDrafts(db, runId, apply = false) {
  const c = await db.getConnection();
  try {
    await c.beginTransaction();
    const [owners] = await c.query('SELECT user_id FROM organize_suggestion_runs WHERE id=?', [runId]);
    if (!owners.length) throw new Error('指定任务不存在');
    if (apply) {
      const [users] = await c.query('SELECT id FROM user WHERE id=? AND del_flag=0 FOR UPDATE', [owners[0].user_id]);
      if (!users.length) throw new Error('用户不可用');
    }
    const [runs] = await c.query(`SELECT * FROM organize_suggestion_runs WHERE id=?${apply ? ' FOR UPDATE' : ''}`, [runId]);
    const run = runs[0];
    const options = typeof run.options_json === 'string' ? JSON.parse(run.options_json) : run.options_json;
    if (run.status !== 'completed' || Number(run.run_version) !== 2 || options.checks?.length !== 1 || options.checks[0] !== 'archive')
      throw new Error('只允许恢复已完成的 V2 纯网页存档任务');
    const [rows] = await c.query(`SELECT s.id,s.item_id FROM organize_suggestions s
      JOIN organize_suggestion_items i ON i.id=s.item_id AND i.user_id=s.user_id
      WHERE s.run_id=? AND s.user_id=? AND s.kind='archive' AND s.status='pending'
      AND JSON_EXTRACT(s.payload_json,'$.archiveDraft') IS NULL AND JSON_EXTRACT(s.payload_json,'$.archivePreview') IS NULL
      AND i.resource_type='bookmark' AND i.ai_status='not_needed'${apply ? ' FOR UPDATE' : ''}`, [runId, run.user_id]);
    if (apply && rows.length) {
      await c.query('DELETE FROM organize_suggestions WHERE run_id=? AND id IN (?)', [runId, rows.map(row => row.id)]);
      await c.query("UPDATE organize_suggestion_items SET rule_status='pending' WHERE run_id=? AND id IN (?)", [runId, rows.map(row => row.item_id)]);
      await c.query("UPDATE organize_suggestion_runs SET status='preparing',rule_phase='pending',rule_lease_token=NULL,rule_lease_expires_at=NULL WHERE id=?", [runId]);
    }
    await c.commit();
    return { runId, eligible: rows.length, applied: apply, aiRerun: false };
  } catch (error) {
    await c.rollback();
    throw error;
  } finally {
    c.release();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const runId = process.argv.find(arg => arg.startsWith('--run='))?.slice(6);
  if (!/^[a-f0-9-]{36}$/i.test(runId || '')) throw new Error('请用 --run=UUID 指定唯一任务');
  const apply = process.argv.includes('--apply');
  process.env.ALLOW_REMOTE_DATABASE_READS = apply ? 'false' : 'true';
  if (!apply) process.env.ALLOW_REMOTE_DATABASE_WRITES = 'false';
  const { default: db } = await import('../db/index.js');
  try { console.log(JSON.stringify(await requeueArchiveDrafts(db, runId, apply))); }
  finally { await db.end(); }
}
