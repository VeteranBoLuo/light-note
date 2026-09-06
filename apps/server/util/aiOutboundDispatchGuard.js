/**
 * 在账号注销事务使用的同一行锁上建立一次 AI 外发屏障。
 *
 * 锁必须覆盖真正的 Provider 调用：若注销先取得锁，后续外发会在读到 deleted
 * 后停止；若外发先取得锁，注销会等该次调用交付/失败后才提交。这样跨进程实例
 * 也不会出现“注销已提交但旧 Worker 仍开始外发”的 TOCTOU 窗口。
 */
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
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const user = await lockActiveUserForUpdate(connection, userId);
    const result = await callback({
      connection,
      user,
    });
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
}
