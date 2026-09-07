import { buildSnapshot } from './organizeSuggestionRules.js';
const comparisonText = (column) => `CONVERT(${column} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;
const tables = { bookmark: ['bookmark', 'user_id'], note: ['note', 'create_by'], file: ['files', 'create_by'] };
// 范围确认仅冻结 ID 与显示名称，禁止读正文、解析片段及引用关系。
export async function readSuggestionCandidates(
  db,
  userId,
  type,
  { ids, after = '', limit = 100, recent = false, untagged = false } = {},
) {
  const [table, owner] = tables[type];
  const where = [`r.${owner}=?`, 'r.del_flag=0'];
  const params = [userId];
  if (ids) {
    if (!ids.length) return [];
    where.push('r.id IN (?)');
    params.push(ids);
  } else if (!recent) {
    where.push('CAST(r.id AS CHAR)>?');
    params.push(after);
  }
  if (untagged) {
    where.push(
      `NOT EXISTS(SELECT 1 FROM resource_tag_relations tr JOIN tag t ON t.id=tr.tag_id AND t.del_flag=0 AND t.user_id=? WHERE tr.user_id=? AND tr.resource_type=? AND tr.resource_id=${comparisonText('r.id')})`,
    );
    params.push(userId, userId, type);
  }
  const title = { bookmark: 'name', note: 'title', file: 'file_name' }[type];
  const [rows] = await db.query(
    `SELECT r.id,r.${title} AS title FROM ${table} r WHERE ${where.join(' AND ')} ORDER BY ${recent ? 'r.create_time DESC,r.id DESC' : 'CAST(r.id AS CHAR)'} LIMIT ?`,
    [...params, limit],
  );
  return rows.map((row) => ({
    id: String(row.id),
    type,
    title: String(row.title || ''),
    tags: [],
    source: { folder: '' },
    guards: {},
    evidenceLevel: 'pending',
  }));
}
export async function readSuggestionSources(
  db,
  userId,
  type,
  { ids, after = '', limit = 100, recent = false, untagged = false } = {},
) {
  const [table, owner] = tables[type];
  const where = [`r.${owner} = ?`, 'r.del_flag = 0'];
  const params = [userId];
  if (ids) {
    if (!ids.length) return [];
    where.push('r.id IN (?)');
    params.push(ids);
  } else if (!recent) {
    where.push('CAST(r.id AS CHAR) > ?');
    params.push(after);
  }
  if (untagged) {
    where.push(
      `NOT EXISTS (SELECT 1 FROM resource_tag_relations tr JOIN tag t ON t.id=tr.tag_id AND t.del_flag=0 AND t.user_id=${comparisonText(`r.${owner}`)} WHERE tr.user_id=${comparisonText(`r.${owner}`)} AND tr.resource_type=? AND tr.resource_id=${comparisonText('r.id')})`,
    );
    params.push(type);
  }
  let extra = '';
  if (type === 'note')
    extra = `,
    (SELECT COUNT(*) FROM note n WHERE n.parent_id=r.id AND n.create_by=r.create_by AND n.del_flag=0) AS children,
    (SELECT COUNT(*) FROM note_resource_refs nr JOIN note n ON n.id=${comparisonText('nr.source_note_id')} AND n.del_flag=0 WHERE nr.source_user_id=${comparisonText('r.create_by')} AND nr.target_type='note' AND nr.target_id=${comparisonText('r.id')}) AS refs,
    ((SELECT COUNT(*) FROM todo_resource_refs tr WHERE tr.user_id=${comparisonText('r.create_by')} AND tr.target_type='note' AND tr.target_id=${comparisonText('r.id')}) + (SELECT COUNT(*) FROM todo_series_resource_refs tr WHERE tr.user_id=${comparisonText('r.create_by')} AND tr.resource_type='note' AND tr.resource_id=${comparisonText('r.id')})) AS todos,
    (SELECT n.title FROM note n WHERE n.id=r.parent_id AND n.create_by=r.create_by) AS folder_name`;
  if (type === 'file')
    extra = ', (SELECT f.name FROM folders f WHERE f.id=r.folder_id AND f.create_by=r.create_by) AS folder_name';
  const [rows] = await db.query(
    `SELECT r.* ${extra} FROM ${table} r WHERE ${where.join(' AND ')} ORDER BY ${recent ? 'r.create_time DESC, r.id DESC' : 'CAST(r.id AS CHAR)'} LIMIT ?`,
    [...params, limit],
  );
  if (!rows.length) return [];
  const resourceIds = rows.map((r) => String(r.id));
  if (type === 'note') {
    const [tree] = await db.query('SELECT id,parent_id FROM note WHERE create_by=? AND del_flag=0', [userId]);
    const [shares] = await db.query(
      "SELECT root_note_id,scope_type FROM note_shares WHERE owner_user_id=? AND status='active' AND (expires_at IS NULL OR expires_at>NOW())",
      [userId],
    );
    const parents = new Map(tree.map((n) => [String(n.id), n.parent_id ? String(n.parent_id) : null]));
    rows.forEach((row) => {
      const ancestors = new Set();
      let id = String(row.id);
      while (id && !ancestors.has(id)) {
        ancestors.add(id);
        id = parents.get(id);
      }
      row.shares = shares.filter(
        (s) =>
          String(s.root_note_id) === String(row.id) ||
          (s.scope_type === 'subtree' && ancestors.has(String(s.root_note_id))),
      ).length;
    });
  }

  const [tagRows] = await db.query(
    `SELECT tr.resource_id, t.id, t.name FROM resource_tag_relations tr JOIN tag t ON t.id=tr.tag_id AND t.user_id=? AND t.del_flag=0 WHERE tr.user_id=? AND tr.resource_type=? AND tr.resource_id IN (?) ORDER BY t.id`,
    [userId, userId, type, resourceIds],
  );
  if (type === 'bookmark') {
    const [archives] = await db.query(
      'SELECT bookmark_id, content FROM bookmark_snapshot WHERE user_id=? AND bookmark_id IN (?)',
      [userId, resourceIds],
    );
    rows.forEach((r) => {
      const archive = archives.find((a) => String(a.bookmark_id) === String(r.id));
      r.original_description = r.description || '';
      r.description = [r.description, archive?.content].filter(Boolean).join('\n');
    });
  }
  if (type === 'file') {
    const [chunks] = await db.query(
      `SELECT ds.file_id, ds.object_key, dc.content, dc.chunk_index FROM ai_document_sources ds JOIN ai_document_chunks dc ON dc.source_id=ds.id WHERE ds.user_id=? AND ds.file_id IN (?) AND ds.status='ready' AND dc.chunk_index < 5 ORDER BY ds.file_id, dc.chunk_index`,
      [userId, resourceIds],
    );
    rows.forEach((r) => {
      r.parsed_text = chunks
        .filter((c) => String(c.file_id) === String(r.id) && c.object_key === r.obs_key)
        .map((c) => c.content)
        .join('\n')
        .slice(0, 6000);
    });
  }
  return rows.map((row) =>
    buildSnapshot(
      type,
      row,
      tagRows
        .filter((t) => String(t.resource_id) === String(row.id))
        .map((t) => ({ id: String(t.id), name: t.name, source: 'existing' })),
    ),
  );
}
export async function readCurrentSuggestionSource(db, userId, type, id) {
  return (await readSuggestionSources(db, userId, type, { ids: [id], limit: 1 }))[0] || null;
}
