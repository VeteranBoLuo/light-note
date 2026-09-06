import { MAX_EXPLICIT_RESOURCE_SELECTION } from '@lightnote/shared/resource-selection';
import { queryOwnedResourceIds } from './resourceTagWriteService.js';
import { resolveFileCategory } from '../fileCategory.js';

const FIELDS = {
  bookmark: { table: 'bookmark', owner: 'user_id', fields: 'id, name AS title, name, url, description' },
  note: { table: 'note', owner: 'create_by', fields: 'id, title, type AS noteType, parent_id AS parentId' },
  file: {
    table: 'files',
    owner: 'create_by',
    fields:
      'id, file_name AS title, file_name AS fileName, file_type AS fileType, file_size AS size, folder_id AS folderId',
  },
};

/** 只核对显式 ID；不读取正文、对象键或生成文件地址。 */
export async function resolveExplicitResourceSelection(db, userId, rawItems) {
  if (
    !Array.isArray(rawItems) ||
    rawItems.length > MAX_EXPLICIT_RESOURCE_SELECTION ||
    rawItems.some(
      (x) =>
        !Object.hasOwn(FIELDS, x?.type) ||
        !['string', 'number'].includes(typeof x.id) ||
        !String(x.id).trim() ||
        (typeof x.id === 'number' && !Number.isFinite(x.id)),
    )
  ) {
    throw Object.assign(new Error('无效的资源选择'), { status: 400 });
  }
  const items = [
    ...new Map(
      rawItems.map((x) => [`${x.type}:${String(x.id).trim()}`, { type: x.type, id: String(x.id).trim() }]),
    ).values(),
  ];
  const resolved = new Map();
  for (const [type, config] of Object.entries(FIELDS)) {
    const ids = items.filter((x) => x.type === type).map((x) => x.id);
    for (let offset = 0; offset < ids.length; offset += 200) {
      const validIds = await queryOwnedResourceIds(db, { userId, type, ids: ids.slice(offset, offset + 200) });
      if (!validIds.length) continue;
      const placeholders = validIds.map(() => '?').join(',');
      const [rows] = await db.query(
        `SELECT ${config.fields} FROM ${config.table} WHERE ${config.owner} = ? AND del_flag = 0 AND id IN (${placeholders})`,
        [userId, ...validIds],
      );
      for (const row of rows) {
        const item = { ...row, id: String(row.id), type, title: String(row.title || '') };
        if (type === 'file') item.category = resolveFileCategory(item);
        if (type === 'bookmark') item.tagList = [];
        resolved.set(`${type}:${item.id}`, item);
      }
      if (type === 'bookmark') {
        const [tags] = await db.query(
          `SELECT r.resource_id AS resourceId, t.id, t.name
          FROM resource_tag_relations r INNER JOIN tag t ON t.id = r.tag_id
          WHERE r.user_id = ? AND t.user_id = ? AND t.del_flag = 0 AND r.resource_type = 'bookmark'
          AND r.resource_id IN (${placeholders}) ORDER BY t.sort, t.create_time DESC`,
          [userId, userId, ...validIds],
        );
        for (const tag of tags)
          resolved
            .get(`bookmark:${tag.resourceId}`)
            ?.tagList.push({ id: String(tag.id), name: String(tag.name || '') });
      }
    }
  }
  return {
    resolvedItems: items.map((x) => resolved.get(`${x.type}:${x.id}`)).filter(Boolean),
    unavailableItems: items.filter((x) => !resolved.has(`${x.type}:${x.id}`)),
  };
}
