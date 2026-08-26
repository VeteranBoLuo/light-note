import pool from '../../db/index.js';
import { serializeDrawingScene } from '@lightnote/shared/drawing-note';
import { NEW_USER_DRAWING_NOTE_EXAMPLE_SCENE } from './newUserDrawingNoteExample.js';
import { snapshotOwnedNoteVersion } from './noteService.js';

export const VISITOR_DRAWING_SAMPLE_NOTE_ID = '49a0a5b9-719c-8910-b7c3-4de02a9d0cae';
export const VISITOR_DRAWING_SAMPLE_TITLE = '上色';

function syncError(code, message) {
  const error = new Error(`${code}: ${message}`);
  error.code = code;
  return error;
}

export function buildVisitorDrawingSampleTarget() {
  return {
    id: VISITOR_DRAWING_SAMPLE_NOTE_ID,
    title: VISITOR_DRAWING_SAMPLE_TITLE,
    type: 'drawing',
    content: serializeDrawingScene(NEW_USER_DRAWING_NOTE_EXAMPLE_SCENE),
  };
}

const VISITOR_DRAWING_SAMPLE_SELECT = `SELECT n.id,
       n.create_by AS createBy,
       n.title,
       n.content,
       n.type,
       n.revision,
       n.del_flag AS delFlag,
       u.role,
       u.del_flag AS userDelFlag
  FROM note n
  JOIN user u ON u.id = n.create_by
 WHERE n.id = ?
 LIMIT 1`;

function validateVisitorSampleRow(row) {
  if (!row) throw syncError('VISITOR_DRAWING_SAMPLE_NOT_FOUND', '游客手绘示例不存在');
  if (row.role !== 'visitor' || String(row.userDelFlag) !== '0') {
    throw syncError('VISITOR_DRAWING_SAMPLE_OWNER_INVALID', '目标笔记不属于有效游客账号');
  }
  if (String(row.delFlag) !== '0' || row.type !== 'drawing') {
    throw syncError('VISITOR_DRAWING_SAMPLE_NOTE_INVALID', '目标笔记不是有效手绘笔记');
  }
}

function inspectVisitorSampleRow(row, target) {
  validateVisitorSampleRow(row);
  let currentContent;
  try {
    currentContent = serializeDrawingScene(row.content);
  } catch {
    throw syncError('VISITOR_DRAWING_SAMPLE_CONTENT_INVALID', '游客手绘示例正文无效');
  }
  const currentRevision = Math.max(1, Number(row.revision || 1));
  const changed = String(row.title || '') !== target.title || currentContent !== target.content;
  return {
    changed,
    currentRevision,
    currentTitle: String(row.title || ''),
    targetTitle: target.title,
    targetBytes: Buffer.byteLength(target.content),
  };
}

export async function syncVisitorDrawingSample({ db = pool, apply = false } = {}) {
  const target = buildVisitorDrawingSampleTarget();
  if (!apply) {
    const [rows] = await db.query(VISITOR_DRAWING_SAMPLE_SELECT, [target.id]);
    const inspection = inspectVisitorSampleRow(rows[0], target);
    return { applied: false, ...inspection };
  }

  const connection = await db.getConnection();
  let transactionStarted = false;
  try {
    await connection.beginTransaction();
    transactionStarted = true;
    const [rows] = await connection.query(`${VISITOR_DRAWING_SAMPLE_SELECT} FOR UPDATE`, [target.id]);
    const row = rows[0];
    const inspection = inspectVisitorSampleRow(row, target);
    if (!inspection.changed) {
      await connection.commit();
      transactionStarted = false;
      return { applied: false, ...inspection };
    }

    await snapshotOwnedNoteVersion(connection, {
      userId: row.createBy,
      noteId: target.id,
      currentNote: row,
      reason: 'visitor-sample-sync',
    });
    const [result] = await connection.query(
      `UPDATE note
          SET title = ?, content = ?, revision = revision + 1, update_time = NOW()
        WHERE id = ? AND create_by = ? AND revision = ? AND del_flag = 0 AND type = 'drawing'`,
      [target.title, target.content, target.id, row.createBy, inspection.currentRevision],
    );
    if (Number(result?.affectedRows || 0) !== 1) {
      throw syncError('VISITOR_DRAWING_SAMPLE_CONFLICT', '游客手绘示例同步发生并发冲突');
    }

    await connection.commit();
    transactionStarted = false;
    return {
      applied: true,
      changed: true,
      currentRevision: inspection.currentRevision + 1,
      previousTitle: inspection.currentTitle,
      targetTitle: target.title,
      targetBytes: inspection.targetBytes,
    };
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
