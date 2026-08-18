export async function queryActiveInheritedNoteShares(db, { userId, ancestorIds = [] } = {}) {
  const normalizedAncestorIds = [...new Set(ancestorIds.map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalizedAncestorIds.length) return [];
  const placeholders = normalizedAncestorIds.map(() => '?').join(',');
  // 次数耗尽只阻止签发新会话；既有 30 分钟票据仍可浏览，写入提醒不能因此漏掉。
  const [rows] = await db.query(
    `SELECT s.id, s.root_note_id, root.title AS root_title, s.expires_at
       FROM note_shares s
       INNER JOIN note root
               ON root.id = s.root_note_id
              AND root.create_by = s.owner_user_id
              AND root.del_flag = 0
      WHERE s.owner_user_id = ?
        AND s.scope_type = 'subtree'
        AND s.root_note_id IN (${placeholders})
        AND s.status = 'active'
        AND s.revoked_at IS NULL
        AND s.expires_at > NOW()
      ORDER BY s.create_time DESC`,
    [String(userId), ...normalizedAncestorIds],
  );
  return rows.map((row) => ({
    shareId: String(row.id),
    rootNoteId: String(row.root_note_id),
    rootTitle: String(row.root_title || ''),
    expiresAt: row.expires_at,
  }));
}
