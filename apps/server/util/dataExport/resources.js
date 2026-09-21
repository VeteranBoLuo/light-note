import path from 'node:path';
import { safeExportName, uniqueExportName, resolveDataExportNoteFormat } from '@lightnote/shared/data-export';
import { hash, exportError } from './storage.js';
// Queries are fixed by kind, never constructed from user identifiers.
const queries = {
  notes: `SELECT id,title,content,type,parent_id,sort,revision FROM note WHERE create_by=? AND del_flag=0`,
  bookmarks: `SELECT b.id,b.name AS title,b.url,b.description,b.create_time,
    (SELECT s.content FROM bookmark_snapshot s WHERE s.bookmark_id=b.id AND s.user_id=b.user_id AND BINARY s.url=BINARY b.url LIMIT 1) AS content
    FROM bookmark b WHERE b.user_id=? AND b.del_flag=0`,
  files: `SELECT id,create_by,file_name AS title,file_size,obs_key,directory,folder_id FROM files WHERE create_by=? AND del_flag=0`,
};
export async function resourcePage(db, owner, kind, offset = 0, id) {
  const q = queries[kind];
  if (!q) throw exportError('DATA_EXPORT_OPTIONS');
  const key = kind === 'bookmarks' ? 'b.id' : 'id';
  const [rows] = await db.query(q + (id === undefined ? ` ORDER BY ${key} LIMIT 100 OFFSET ?` : ` AND ${key}=?`), [
    owner,
    id === undefined ? offset : id,
  ]);
  if (kind === 'bookmarks' && rows.length) {
    const [tags] = await db.query(
      "SELECT r.resource_id,t.name FROM resource_tag_relations r JOIN tag t ON t.id=r.tag_id AND t.del_flag=0 WHERE r.user_id=? AND r.resource_type='bookmark' AND r.resource_id IN (?) ORDER BY t.name,t.id",
      [owner, rows.map((r) => r.id)],
    );
    for (const row of rows)
      row.tags = tags
        .filter((t) => String(t.resource_id) === String(row.id))
        .map((t) => t.name)
        .join(', ');
  }
  return rows;
}
export const resourceVersion = (row) => hash(row);
export function buildPaths(nodes, folders, format) {
  const paths = new Map(),
    stems = new Map(),
    groups = new Map();
  const byId = new Map(nodes.map((n) => [String(n.id), n]));
  const folderMap = new Map(folders.map((n) => [String(n.id), n]));
  function unique(group, title, extension = '') {
    if (!groups.has(group)) groups.set(group, new Set());
    return uniqueExportName(title, groups.get(group), extension);
  }
  function notePath(id, seen = new Set()) {
    if (paths.has('notes:' + id)) return stems.get(id);
    if (seen.has(id)) throw exportError('DATA_EXPORT_INVALID_TREE');
    seen.add(id);
    const n = byId.get(id),
      parent = n.parent_id && byId.has(String(n.parent_id)) ? String(n.parent_id) : null;
    const prefix = parent ? notePath(parent, seen) + '/' : '笔记/';
    const outputFormat = resolveDataExportNoteFormat(n.type, format);
    const ext = outputFormat === 'json' ? '.json' : outputFormat === 'html' ? '.html' : '.md';
    const file = unique(prefix, n.title, ext),
      stem = prefix + file.slice(0, -ext.length);
    stems.set(id, stem);
    paths.set('notes:' + id, prefix + file);
    return stem;
  }
  // Reserve the image directory so a note cannot collide with generated assets.
  groups.set('笔记/', new Set(['图片']));
  for (const n of nodes) notePath(String(n.id));
  const folderPaths = new Map();
  function folderPath(id, seen = new Set()) {
    if (!id || !folderMap.has(String(id))) return '文件';
    id = String(id);
    if (folderPaths.has(id)) return folderPaths.get(id);
    if (seen.has(id)) throw exportError('DATA_EXPORT_INVALID_TREE');
    seen.add(id);
    const f = folderMap.get(id),
      prefix = folderPath(f.parent_id, seen);
    const p = prefix + '/' + unique(prefix + '/', f.name);
    folderPaths.set(id, p);
    return p;
  }
  for (const f of folders) folderPath(f.id);
  return {
    paths,
    filePath: (file) => {
      const name = safeExportName(file.title), extension = path.extname(name);
      return folderPath(file.folder_id) + '/' + unique(folderPath(file.folder_id) + '/', extension ? name.slice(0, -extension.length) : name, extension);
    },
  };
}
