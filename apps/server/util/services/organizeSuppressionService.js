import crypto from 'node:crypto';

export const ORGANIZE_SUPPRESSION_TYPES = Object.freeze({
  UNTAGGED: 'untagged.ignore',
  DUPLICATE: 'duplicate.ignore',
});

export async function upsertOrganizeSuppression(
  db,
  { userId, issueType, subjectKey, contextHash = null },
) {
  if (!Object.values(ORGANIZE_SUPPRESSION_TYPES).includes(issueType)) {
    throw Object.assign(new Error('不支持的忽略类型'), { code: 'ORGANIZE_SUPPRESSION_INVALID' });
  }
  const normalizedSubject = String(subjectKey || '').trim();
  if (!normalizedSubject || normalizedSubject.length > 255) {
    throw Object.assign(new Error('忽略对象无效'), { code: 'ORGANIZE_SUPPRESSION_SUBJECT_INVALID' });
  }
  const normalizedContext = contextHash ? String(contextHash).trim().toLowerCase() : null;
  if (normalizedContext && !/^[a-f0-9]{64}$/.test(normalizedContext)) {
    throw Object.assign(new Error('问题上下文无效'), { code: 'ORGANIZE_CONTEXT_INVALID' });
  }
  const id = crypto.randomUUID();
  await db.query(
    `INSERT INTO organize_issue_suppressions (id, user_id, issue_type, subject_key, context_hash)
     VALUES (?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE context_hash = VALUES(context_hash), update_time = CURRENT_TIMESTAMP`,
    [id, userId, issueType, normalizedSubject, normalizedContext],
  );
  return { issueType, subjectKey: normalizedSubject, contextHash: normalizedContext };
}

export async function deleteOrganizeSuppression(db, { userId, issueType, subjectKey }) {
  const [result] = await db.query(
    'DELETE FROM organize_issue_suppressions WHERE user_id = ? AND issue_type = ? AND subject_key = ?',
    [userId, issueType, String(subjectKey || '').trim()],
  );
  return { removed: Number(result?.affectedRows || 0) > 0 };
}

export async function queryOrganizeSuppressions(db, { userId, issueType, subjectKeys = [] }) {
  const keys = [...new Set(subjectKeys.map(String).filter(Boolean))];
  if (!keys.length) return new Map();
  const placeholders = keys.map(() => '?').join(',');
  const [rows] = await db.query(
    `SELECT subject_key, context_hash
       FROM organize_issue_suppressions
      WHERE user_id = ? AND issue_type = ? AND subject_key IN (${placeholders})`,
    [userId, issueType, ...keys],
  );
  return new Map(rows.map((row) => [String(row.subject_key), row.context_hash ? String(row.context_hash) : null]));
}
