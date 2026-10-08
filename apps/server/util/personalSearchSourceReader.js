import { setImmediate as yieldToEventLoop } from 'node:timers/promises';

const MAX_BATCH_ROWS = 50;
const TARGET_BATCH_BYTES = 1024 * 1024;
const sources = {
  note: {
    metadata: `SELECT CAST(id AS CHAR) AS id,
      COALESCE(OCTET_LENGTH(title), 0) + IF(type = 'drawing', 0, COALESCE(OCTET_LENGTH(content), 0)) AS body_bytes
      FROM note WHERE create_by = ? AND del_flag = '0' ORDER BY update_time DESC, id ASC LIMIT 3000`,
    body: `SELECT CAST(id AS CHAR) AS id, title, IF(type = 'drawing', '', content) AS content, type, update_time
      FROM note WHERE create_by = ? AND del_flag = '0' AND id IN`,
  },
  bookmark: {
    metadata: `SELECT CAST(b.id AS CHAR) AS id,
      COALESCE(OCTET_LENGTH(b.name), 0) + COALESCE(OCTET_LENGTH(b.url), 0) +
      COALESCE(OCTET_LENGTH(b.description), 0) + COALESCE(OCTET_LENGTH(s.summary), 0) +
      COALESCE(OCTET_LENGTH(s.content), 0) AS body_bytes
      FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id
      WHERE b.user_id = ? AND b.del_flag = 0 ORDER BY b.create_time DESC, b.id ASC LIMIT 3000`,
    body: `SELECT CAST(b.id AS CHAR) AS id, b.name, b.url, b.description, b.create_time, s.summary, s.content, s.update_time
      FROM bookmark b LEFT JOIN bookmark_snapshot s ON s.bookmark_id = b.id
      WHERE b.user_id = ? AND b.del_flag = 0 AND b.id IN`,
  },
  todo: {
    metadata: `SELECT CAST(id AS CHAR) AS id,
      COALESCE(OCTET_LENGTH(title), 0) + COALESCE(OCTET_LENGTH(description), 0) +
      COALESCE(OCTET_LENGTH(checklist), 0) AS body_bytes
      FROM todo_items WHERE user_id = ? AND del_flag = 0 ORDER BY update_time DESC, id ASC LIMIT 2000`,
    body: `SELECT CAST(id AS CHAR) AS id, title, description, checklist, status, due_at, update_time
      FROM todo_items WHERE user_id = ? AND del_flag = 0 AND id IN`,
  },
};

export async function* readPersonalSearchSource(database, userId, type, hasCapacity) {
  if (!hasCapacity()) return;
  const source = sources[type];
  if (!source) throw new Error('Unsupported private search source');
  // Retain only bounded IDs and byte lengths, not all resource bodies. A single
  // oversized resource is read alone, never silently truncated. Concurrent edits
  // may change these lengths; the caller's generation fence detects stale builds.
  const [metadata] = await database.query(source.metadata, [userId]);
  for (let offset = 0; offset < metadata.length && hasCapacity();) {
    const ids = [];
    let bytes = 0;
    while (offset < metadata.length && ids.length < MAX_BATCH_ROWS) {
      const item = metadata[offset];
      const size = Math.max(0, Number(item.body_bytes) || 0);
      if (ids.length && bytes + size > TARGET_BATCH_BYTES) break;
      ids.push(String(item.id));
      bytes += size;
      offset += 1;
    }
    const [rows] = await database.query(`${source.body} (${ids.map(() => '?').join(',')})`, [userId, ...ids]);
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    // IN results have no ordering guarantee; preserve the metadata selection order.
    for (const id of ids) {
      if (!hasCapacity()) return;
      const row = byId.get(id);
      if (row) yield row;
    }
    await yieldToEventLoop();
  }
}
