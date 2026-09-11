import pool from '../../db/index.js';

export async function isManagedImage(storage, locator, db = pool) {
  const [rows] = await db.query('SELECT id FROM image_assets WHERE storage_kind=? AND source_locator=? LIMIT 1', [
    storage,
    locator,
  ]);
  return rows.length > 0;
}
