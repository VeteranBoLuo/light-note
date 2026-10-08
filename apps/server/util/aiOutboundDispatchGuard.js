import { acquireAccountAiLifecycleConnection } from './accountAiLifecycleLock.js';

// Lifecycle exclusion spans the Provider call and delivery, but the user row
// is locked only during initial validation so ordinary account writes can proceed.
const admissions = new WeakMap();
const MAX_WAITING_DISPATCHES = 64;

// Waiting for a model (or another dispatch of the same account) must not exhaust
// the pool used by the callback's independent billing/delivery transactions.
function acquireDispatchSlot(database, userId) {
  let state = admissions.get(database);
  if (!state) {
    const poolSize = Number(database.pool?.config?.connectionLimit || 10);
    state = { active: new Set(), waiting: [], limit: Math.min(2, poolSize - 1) };
    admissions.set(database, state);
  }
  if (state.limit < 1 || state.waiting.length >= MAX_WAITING_DISPATCHES) {
    return Promise.reject(
      Object.assign(new Error('AI 外发队列繁忙，请稍后重试'), {
        code: 'AI_DISPATCH_BUSY',
        status: 503,
      }),
    );
  }
  const key = String(userId);
  return new Promise((resolve) => {
    const drain = () => {
      while (state.active.size < state.limit) {
        const index = state.waiting.findIndex((entry) => !state.active.has(entry.key));
        if (index < 0) break;
        const [entry] = state.waiting.splice(index, 1);
        state.active.add(entry.key);
        entry.resolve(() => {
          state.active.delete(entry.key);
          drain();
        });
      }
    };
    state.waiting.push({ key, resolve });
    drain();
  });
}

export async function lockActiveUserForUpdate(connection, userId) {
  const [rows] = await connection.query(
    `SELECT id, role, del_flag
       FROM user
      WHERE id = ?
      LIMIT 1
      FOR UPDATE`,
    [userId],
  );
  const user = rows[0] || null;
  if (!user || Number(user.del_flag || 0) !== 0 || !['user', 'test', 'root'].includes(String(user.role || ''))) {
    const error = new Error('账号当前不可用');
    error.code = 'AI_ACCOUNT_UNAVAILABLE';
    error.status = 403;
    throw error;
  }
  return { id: String(user.id), role: String(user.role), isAuthenticated: true };
}

export async function withActiveUserAiDispatch(database, userId, callback) {
  if (!database || typeof database.getConnection !== 'function') {
    const error = new Error('AI 外发屏障需要连接池');
    error.code = 'AI_DISPATCH_GUARD_UNAVAILABLE';
    error.status = 503;
    throw error;
  }
  const releaseSlot = await acquireDispatchSlot(database, userId);
  let connection;
  let releaseLifecycle;
  try {
    ({ connection, releaseLifecycle } = await acquireAccountAiLifecycleConnection(database, userId));
    await connection.beginTransaction();
    const user = await lockActiveUserForUpdate(connection, userId);
    await connection.commit();
    // Keep the callback's transaction contract (including visitor-subject locks)
    // without carrying the authenticated user's row lock through model latency.
    await connection.beginTransaction();
    const result = await callback({
      connection,
      user,
    });
    await connection.commit();
    return result;
  } catch (error) {
    await connection?.rollback().catch(() => {});
    throw error;
  } finally {
    try {
      await releaseLifecycle?.();
      connection?.release();
    } finally {
      releaseSlot();
    }
  }
}
