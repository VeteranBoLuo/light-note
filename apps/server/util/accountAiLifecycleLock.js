import { createHash } from 'node:crypto';

// Acquire before beginning any transaction or locking user rows. All participating
// API/Worker processes must use the same MySQL primary and lock-name derivation.
export async function acquireAccountAiLifecycleLock(connection, userId, { timeoutSeconds = 0 } = {}) {
  const name = `ln-ai-account:${createHash('sha256').update(String(userId)).digest('hex').slice(0, 48)}`;
  let rows;
  try {
    [rows] = await connection.query('SELECT GET_LOCK(?, ?) AS acquired', [name, timeoutSeconds]);
  } catch (error) {
    // Acquisition may have succeeded before the response was lost. Do not put
    // a session that could own a named lock back into the shared pool.
    connection.destroy();
    throw error;
  }
  if (Number(rows[0]?.acquired) !== 1) {
    const error = new Error('账号任务正在处理，请稍后重试');
    error.code = 'AI_ACCOUNT_LIFECYCLE_BUSY';
    error.status = 503;
    throw error;
  }
  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      const [result] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [name]);
      if (Number(result[0]?.released) !== 1) connection.destroy();
    } catch {
      connection.destroy();
    }
  };
}

/** Wait without reserving a pool connection needed by in-flight AI delivery. */
export async function acquireAccountAiLifecycleConnection(database, userId, { timeoutMs = 50_000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const connection = await database.getConnection();
    try {
      // User ids are compared using the table's collation. Resolve the stored
      // spelling so case/accent aliases accepted by SQL cannot choose another lock.
      const [accounts] = await connection.query('SELECT id FROM user WHERE id = ? LIMIT 1', [userId]);
      const releaseLifecycle = await acquireAccountAiLifecycleLock(connection, accounts[0]?.id ?? userId);
      return { connection, releaseLifecycle };
    } catch (error) {
      connection.release();
      if (error?.code !== 'AI_ACCOUNT_LIFECYCLE_BUSY' || Date.now() >= deadline) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(100, Math.max(1, deadline - Date.now()))));
  }
}
