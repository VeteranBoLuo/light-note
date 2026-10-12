import { withWorkerStage } from '../workerDiagnostics.js';
export const json = (value) => (typeof value === 'string' ? JSON.parse(value) : value);
export async function transaction(db, work) {
  const c = typeof db.getConnection === 'function' ? await db.getConnection() : db;
  try {
    await c.beginTransaction();
    const result = await work(c);
    await c.commit();
    return result;
  } catch (e) {
    await c.rollback();
    throw e;
  } finally {
    if (c !== db) c.release();
  }
}

export function diagnosedTransaction(db, stage, work) {
  return withWorkerStage(stage, () => transaction(db, work));
}

// Queue discovery must not lock a status-index range before the run's primary key.
// The candidate read happens before BEGIN, so waiting for the run lock cannot leave
// the eligibility recheck using an earlier REPEATABLE READ snapshot.
export function withNextOrganizeRun(db, stage, condition, work) {
  return withWorkerStage(stage, async () => {
    const [candidates] = await db.query(
      `SELECT * FROM organize_suggestion_runs r WHERE ${condition} ORDER BY r.created_at,r.id LIMIT 1`,
    );
    if (!candidates.length) return false;
    return transaction(db, async (c) => {
      const [runs] = await c.query('SELECT * FROM organize_suggestion_runs WHERE id=? FOR UPDATE', [candidates[0].id]);
      if (!runs.length) return false;
      const [eligible] = await c.query(`SELECT r.id FROM organize_suggestion_runs r WHERE r.id=? AND (${condition})`, [
        runs[0].id,
      ]);
      if (!eligible.length) return false;
      return work(c, runs[0]);
    });
  });
}
