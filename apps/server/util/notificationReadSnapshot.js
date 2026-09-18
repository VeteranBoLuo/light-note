/** Mark the bounded, consistent snapshot of visible notifications. UUIDs only paginate
 * within that snapshot; they are never treated as a creation-time watermark. */
export async function markNotificationSnapshotRead(db, where, params) {
  const connection = await db.getConnection();
  let updated = 0,
    after = '';
  try {
    await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT');
    while (true) {
      const [rows] = await connection.query(
        `SELECT id FROM notification WHERE ${where.join(' AND ')} ${after ? 'AND id>?' : ''} ORDER BY id LIMIT 250`,
        [...params, ...(after ? [after] : [])],
      );
      if (!rows.length) break;
      const ids = rows.map((row) => row.id);
      const [result] = await connection.query(
        `UPDATE notification SET is_read=1,read_time=NOW() WHERE ${where.join(' AND ')} AND id IN (${ids.map(() => '?').join(',')})`,
        [...params, ...ids],
      );
      updated += Number(result.affectedRows || 0);
      after = ids.at(-1);
      if (rows.length < 250) break;
    }
    await connection.commit();
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
