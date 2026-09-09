import { randomUUID } from 'node:crypto';

// Older installations used string version IDs; fresh schemas use AUTO_INCREMENT.
// Preserve existing IDs and references instead of rewriting the historical table.
export async function insertNoteVersion(connection, row) {
  const [columns] = await connection.query("SHOW COLUMNS FROM note_versions LIKE 'id'");
  const legacyStringId = /^(?:var)?char\(/i.test(columns?.[0]?.Type || '');
  const data = { ...row, id: legacyStringId ? randomUUID() : null };
  const [result] = await connection.query('INSERT INTO note_versions SET ?', [data]);
  return legacyStringId ? data.id : result.insertId;
}
