import crypto from 'node:crypto';

export const ORGANIZABLE_RESOURCE_TYPES = Object.freeze(['bookmark', 'note', 'file']);

function toText(value) {
  return String(value ?? '').trim();
}

export function normalizeOrganizableResourceType(value, { allowAll = true } = {}) {
  const type = toText(value);
  if (ORGANIZABLE_RESOURCE_TYPES.includes(type)) return type;
  return allowAll ? 'all' : '';
}

/** 资源中心与整理中心共用同一份“有效标签 / 无标签”判定。 */
export function appendResourceTagFilters({ where, params, alias, resourceType, tagNames, untagged, userId }) {
  if (tagNames.length) {
    where.push(`
      EXISTS (
        SELECT 1
        FROM resource_tag_relations selected_rel
        INNER JOIN tag selected_tag ON selected_tag.id = selected_rel.tag_id
        WHERE selected_rel.resource_type = ?
          AND selected_rel.resource_id = ${alias}.id
          AND selected_rel.user_id = ?
          AND selected_tag.user_id = ?
          AND selected_tag.del_flag = 0
          AND selected_tag.name IN (${tagNames.map(() => '?').join(', ')})
      )
    `);
    params.push(resourceType, userId, userId, ...tagNames);
  }
  if (untagged) {
    where.push(`
      NOT EXISTS (
        SELECT 1
        FROM resource_tag_relations untagged_rel
        INNER JOIN tag untagged_tag ON untagged_tag.id = untagged_rel.tag_id
        WHERE untagged_rel.resource_type = ?
          AND untagged_rel.resource_id = ${alias}.id
          AND untagged_rel.user_id = ?
          AND untagged_tag.user_id = ?
          AND untagged_tag.del_flag = 0
      )
    `);
    params.push(resourceType, userId, userId);
  }
}

function cursorSignature({ keyword, resourceType }) {
  return crypto.createHash('sha256').update(`${resourceType}\n${keyword}`).digest('hex').slice(0, 16);
}

function encodeCursor(value) {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

function decodeCursor(value, filters) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(String(value), 'base64url').toString('utf8'));
    if (
      parsed?.v !== 1 ||
      parsed?.f !== cursorSignature(filters) ||
      !parsed?.time ||
      !ORGANIZABLE_RESOURCE_TYPES.includes(parsed?.type) ||
      !parsed?.id
    ) {
      throw new Error('invalid');
    }
    const time = new Date(parsed.time);
    if (Number.isNaN(time.getTime())) throw new Error('invalid');
    return { ...parsed, time };
  } catch {
    const error = new Error('分页位置已失效，请重新加载');
    error.code = 'ORGANIZE_CURSOR_INVALID';
    throw error;
  }
}

function normalizeLimit(value, fallback = 20, max = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function buildUntaggedBranch(type, { userId, keyword }) {
  const like = `%${keyword.replace(/[\\%_]/g, '\\$&')}%`;
  const definitions = {
    bookmark: {
      table: 'bookmark b',
      alias: 'b',
      owner: 'b.user_id',
      title: 'b.name',
      summary: 'b.description',
      url: 'b.url',
      created: 'b.create_time',
      updated: 'COALESCE(b.update_time, b.create_time)',
      keyword: '(b.name LIKE ? ESCAPE \'\\\\\' OR b.description LIKE ? ESCAPE \'\\\\\' OR b.url LIKE ? ESCAPE \'\\\\\')',
      keywordParams: [like, like, like],
    },
    note: {
      table: 'note n',
      alias: 'n',
      owner: 'n.create_by',
      title: 'n.title',
      summary: "CASE WHEN COALESCE(n.type, 'html') = 'drawing' THEN 'drawing' ELSE '' END",
      url: "''",
      created: 'n.create_time',
      updated: 'COALESCE(n.update_time, n.create_time)',
      // 整理列表不读取完整正文；正文搜索仍由 SearchCenter 的既有查询负责。
      keyword: 'n.title LIKE ? ESCAPE \'\\\\\'',
      keywordParams: [like],
    },
    file: {
      table: 'files f',
      alias: 'f',
      owner: 'f.create_by',
      title: 'f.file_name',
      summary: 'COALESCE(f.file_type, \'\')',
      url: "''",
      created: 'f.create_time',
      updated: 'f.create_time',
      keyword: '(f.file_name LIKE ? ESCAPE \'\\\\\' OR f.file_type LIKE ? ESCAPE \'\\\\\')',
      keywordParams: [like, like],
    },
  };
  const config = definitions[type];
  const where = [`${config.owner} = ?`, `${config.alias}.del_flag = 0`];
  const params = [userId];
  if (keyword) {
    where.push(config.keyword);
    params.push(...config.keywordParams);
  }
  appendResourceTagFilters({
    where,
    params,
    alias: config.alias,
    resourceType: type,
    tagNames: [],
    untagged: true,
    userId,
  });
  return {
    sql: `
      SELECT '${type}' AS resource_type,
             CONVERT(${config.alias}.id USING utf8mb4) COLLATE utf8mb4_unicode_ci AS id,
             CONVERT(COALESCE(${config.title}, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS title,
             CONVERT(COALESCE(${config.summary}, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS summary,
             CONVERT(COALESCE(${config.url}, '') USING utf8mb4) COLLATE utf8mb4_unicode_ci AS url,
             ${config.created} AS created_at,
             ${config.updated} AS updated_at,
             ${config.updated} AS sort_time
        FROM ${config.table}
       WHERE ${where.join(' AND ')}
    `,
    params,
  };
}

function buildUntaggedInventory({ userId, keyword, resourceType }) {
  const types = resourceType === 'all' ? ORGANIZABLE_RESOURCE_TYPES : [resourceType];
  const branches = types.map((type) => buildUntaggedBranch(type, { userId, keyword }));
  return {
    sql: branches.map((branch) => branch.sql).join('\nUNION ALL\n'),
    params: branches.flatMap((branch) => branch.params),
  };
}

export async function listUntaggedResources(
  db,
  { userId, keyword: rawKeyword = '', resourceType: rawResourceType = 'all', cursor: rawCursor, limit: rawLimit } = {},
) {
  const keyword = toText(rawKeyword).slice(0, 120);
  const resourceType = normalizeOrganizableResourceType(rawResourceType);
  const limit = normalizeLimit(rawLimit);
  const filters = { keyword, resourceType };
  const cursor = decodeCursor(rawCursor, filters);
  const inventory = buildUntaggedInventory({ userId, keyword, resourceType });
  const where = [
    `NOT EXISTS (
       SELECT 1 FROM organize_issue_suppressions suppression
        WHERE suppression.user_id = ?
          AND suppression.issue_type = 'untagged.ignore'
          AND suppression.subject_key = CONCAT(inventory.resource_type, ':', inventory.id)
     )`,
  ];
  const params = [...inventory.params, userId];
  if (cursor) {
    where.push(`(
      inventory.sort_time < ?
      OR (inventory.sort_time = ? AND inventory.resource_type > ?)
      OR (inventory.sort_time = ? AND inventory.resource_type = ? AND inventory.id < ?)
    )`);
    params.push(cursor.time, cursor.time, cursor.type, cursor.time, cursor.type, cursor.id);
  }
  params.push(limit + 1);
  const [rows] = await db.query(
    `SELECT inventory.*
       FROM (${inventory.sql}) inventory
      WHERE ${where.join(' AND ')}
      ORDER BY inventory.sort_time DESC, inventory.resource_type ASC, inventory.id DESC
      LIMIT ?`,
    params,
  );
  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row) => ({
    resourceType: row.resource_type,
    resourceId: String(row.id),
    title: row.title || '',
    summary: row.summary || '',
    url: row.url || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  const last = rows[Math.min(rows.length, limit) - 1];
  return {
    items,
    hasMore,
    nextCursor:
      hasMore && last
        ? encodeCursor({
            v: 1,
            f: cursorSignature(filters),
            time: last.sort_time instanceof Date ? last.sort_time.toISOString() : String(last.sort_time),
            type: last.resource_type,
            id: String(last.id),
          })
        : null,
  };
}

export async function getUntaggedSummary(db, { userId, maxKeys = 5000 } = {}) {
  const inventory = buildUntaggedInventory({ userId, keyword: '', resourceType: 'all' });
  const [rows] = await db.query(
    `SELECT inventory.resource_type, inventory.id
       FROM (${inventory.sql}) inventory
      WHERE NOT EXISTS (
        SELECT 1 FROM organize_issue_suppressions suppression
         WHERE suppression.user_id = ?
           AND suppression.issue_type = 'untagged.ignore'
           AND suppression.subject_key = CONCAT(inventory.resource_type, ':', inventory.id)
      )
      LIMIT ?`,
    [...inventory.params, userId, maxKeys + 1],
  );
  const hasMore = rows.length > maxKeys;
  const keys = rows.slice(0, maxKeys).map((row) => `${row.resource_type}:${row.id}`);
  return {
    findingCount: keys.length,
    affectedResourceCount: keys.length,
    resourceKeys: keys,
    exact: !hasMore,
    hasMore,
  };
}

export async function isOwnedUntaggedResource(db, { userId, resourceType, resourceId }) {
  const type = normalizeOrganizableResourceType(resourceType, { allowAll: false });
  if (!type || !resourceId) return false;
  const inventory = buildUntaggedInventory({ userId, keyword: '', resourceType: type });
  const [rows] = await db.query(`SELECT 1 FROM (${inventory.sql}) inventory WHERE inventory.id = ? LIMIT 1`, [
    ...inventory.params,
    String(resourceId),
  ]);
  return rows.length > 0;
}
