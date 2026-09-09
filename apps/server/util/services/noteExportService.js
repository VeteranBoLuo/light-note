import { createHash } from 'node:crypto';
import pool from '../../db/index.js';
import { MAX_NOTE_BATCH_ACTION_ITEMS } from '@lightnote/shared/resource-selection';
import { loadOwnedNoteTree, resolveNoteDescendantIdsFromSnapshot, NoteTreeError } from './noteTreeService.js';

export async function readNoteExportScope(userId, input, db = pool) {
  if (
    input.ids !== undefined ||
    typeof input.rootNoteId !== 'string' ||
    !input.rootNoteId.trim() ||
    typeof input.includeDescendants !== 'boolean'
  ) {
    throw new NoteTreeError('NOTE_EXPORT_INVALID_SCOPE', 'Invalid export scope');
  }
  const tree = await loadOwnedNoteTree(userId, { db });
  const allIds = resolveNoteDescendantIdsFromSnapshot(tree, input.rootNoteId, { includeRoot: true });
  const ids = input.includeDescendants ? allIds : allIds.slice(0, 1);
  const nodes = ids.map((id) => tree.nodesById.get(id));
  const scopeToken = createHash('sha256')
    .update(JSON.stringify(nodes.map((n) => [n.id, n.parentId, n.title, n.type, n.sort, n.revision])))
    .digest('hex');
  return {
    nodes,
    scopeToken,
    count: ids.length,
    descendantCount: allIds.length - 1,
    drawingCount: nodes.filter((n) => n.type === 'drawing').length,
    limit: MAX_NOTE_BATCH_ACTION_ITEMS,
  };
}

export async function readScopedNotesForExport(userId, input) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const scope = await readNoteExportScope(userId, input, db);
    if (scope.count > scope.limit) throw new NoteTreeError('NOTE_EXPORT_LIMIT', 'Export scope exceeds limit', 413);
    if (scope.scopeToken !== input.scopeToken)
      throw new NoteTreeError('NOTE_EXPORT_SCOPE_CHANGED', 'Export scope changed', 409);
    const ids = scope.nodes.map((n) => n.id);
    const [rows] = await db.query(
      `SELECT id,title,content,type,parent_id,sort FROM note WHERE create_by=? AND del_flag=0 AND id IN (${ids.map(() => '?').join(',')})`,
      [userId, ...ids],
    );
    if (rows.length !== ids.length) throw new NoteTreeError('NOTE_EXPORT_SCOPE_CHANGED', 'Export scope changed', 409);
    const byId = new Map(rows.map((n) => [String(n.id), n]));
    await db.commit();
    return { notes: ids.map((id) => byId.get(id)), requestedCount: ids.length, missingCount: 0 };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
