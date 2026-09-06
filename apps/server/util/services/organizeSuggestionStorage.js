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
