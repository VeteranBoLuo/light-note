import { Temporal } from '@js-temporal/polyfill';
import crypto from 'node:crypto';
import { listTodoPage } from './todoService.js';
import { organizationError, todoOrganizationFilters } from './todoOrganizationService.js';

const stamp = (sql) => `COALESCE(DATE_FORMAT(${sql}, '%Y%m%d%H%i%s'), '99991231235959')`;
const reverseStamp = (sql) => `LPAD(99999999999999 - CAST(${stamp(sql)} AS UNSIGNED), 14, '0')`;
const attention = "(i.status = 'pending' AND (i.priority = 2 OR i.due_at < NOW()))";
const scheduled =
  "(i.status = 'pending' AND i.plan_version = 2 AND s.id IS NOT NULL AND s.repeat_mode IN ('scheduled', 'after_completion'))";

export function workspaceGrouped(input) {
  return (
    (input.sort || 'smart') === 'smart' &&
    input.status !== 'completed' &&
    input.listId === undefined &&
    (!input.scope || input.scope === 'all')
  );
}
function normalize(input) {
  const value = { ...input, status: input.status || 'all', sort: input.sort || 'smart' };
  if (
    !['all', 'pending', 'completed'].includes(value.status) ||
    !['smart', 'action', 'priority', 'due', 'newest', 'oldest'].includes(value.sort)
  )
    throw organizationError('TODO_FILTER_INVALID', '筛选或排序无效');
  value.keyword = String(input.keyword || '')
    .trim()
    .slice(0, 100);
  value.limit = input.limit === undefined ? 30 : Number(input.limit);
  if (!Number.isInteger(value.limit) || value.limit < 1 || value.limit > 100)
    throw organizationError('TODO_LIMIT_INVALID', '分页大小无效');
  return value;
}
function filterSql(userId, input) {
  const filter = todoOrganizationFilters(input, 'i');
  filter.where.unshift(
    "i.user_id = ? AND i.del_flag = 0 AND COALESCE(i.instance_state, 'normal') = 'normal' AND i.status IN ('pending', 'completed')",
  );
  filter.params.unshift(userId);
  if (input.status !== 'all') {
    filter.where.push('i.status = ?');
    filter.params.push(input.status);
  }
  if (input.keyword) {
    filter.where.push('(i.title LIKE ? OR i.description LIKE ?)');
    filter.params.push(`%${input.keyword}%`, `%${input.keyword}%`);
  }
  if (input.ids !== undefined) {
    if (
      !Array.isArray(input.ids) ||
      input.ids.length > 100 ||
      input.ids.some((id) => typeof id !== 'string' || id.length > 64)
    )
      throw organizationError('TODO_IDS_INVALID', '待办范围无效');
    filter.where.push(input.ids.length ? 'i.id IN (?)' : '1 = 0');
    if (input.ids.length) filter.params.push(input.ids);
  }
  return filter;
}
function fingerprint(userId, input, kind) {
  return crypto
    .createHash('sha256')
    .update(
      JSON.stringify([
        kind,
        userId,
        input.status,
        input.sort,
        input.keyword,
        input.scope || 'all',
        input.listId,
        [...(input.tagIds || [])].sort(),
        input.priority ?? '',
        input.rangeStart,
        input.rangeEnd,
        input.groupKey,
        input.seriesId,
        input.wholeSeries,
        input.ids,
      ]),
    )
    .digest('hex');
}
function decodeCursor(cursor, scope) {
  if (!cursor) return null;
  try {
    if (typeof cursor !== 'string' || cursor.length > 2048) throw new Error();
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (
      parsed.v !== 1 ||
      parsed.scope !== scope ||
      typeof parsed.order !== 'string' ||
      parsed.order.length > 256 ||
      typeof parsed.key !== 'string' ||
      parsed.key.length > 256
    )
      throw new Error();
    return parsed;
  } catch {
    throw organizationError('TODO_CURSOR_INVALID', '分页已失效，请刷新列表');
  }
}
function encodeCursor(scope, row) {
  return Buffer.from(JSON.stringify({ v: 1, scope, order: row.orderKey, key: row.nodeKey })).toString('base64url');
}

async function workspaceClocks(db, userId) {
  // MySQL installations need not carry IANA timezone tables; use the same Temporal clock as recurrence generation.
  const [zones] = await db.query(
    `SELECT DISTINCT COALESCE(i.instance_timezone, s.timezone) AS timezone
    FROM todo_items i LEFT JOIN todo_series s ON s.id = i.series_id AND s.user_id = i.user_id
    WHERE i.user_id = ? AND i.del_flag = 0 AND i.status = 'pending'`,
    [userId],
  );
  const instant = Temporal.Now.instant();
  return zones.flatMap(({ timezone }) => {
    if (!timezone) return [];
    try {
      return [
        [
          timezone,
          instant.toZonedDateTimeISO(timezone).toPlainDateTime().toString({ smallestUnit: 'second' }).replace('T', ' '),
        ],
      ];
    } catch {
      return [];
    } // Legacy invalid timezone follows the existing database-local date rules.
  });
}

/** SQL aggregates the full filtered membership before paging. Only page representatives are hydrated. */
export function workspaceNodeQuery(userId, raw, clocks = []) {
  const input = normalize(raw);
  const filter = filterSql(userId, input);
  const group = workspaceGrouped(input)
    ? `CASE WHEN i.status = 'completed' THEN 'completed' WHEN ${attention} THEN 'focus' ELSE COALESCE(i.list_id, 'unassigned') END`
    : "'all'";
  // A series appears once in the current filtered result. Any attention occurrence promotes the whole summary.
  const node = `IF(${scheduled}, CONCAT('series:', i.series_id), CONCAT('todo:', i.id))`;
  const clockJoin = clocks.length
    ? `LEFT JOIN (${clocks.map(() => 'SELECT ? AS timezone, CAST(? AS DATETIME) AS localNow').join(' UNION ALL ')}) clock ON clock.timezone = COALESCE(i.instance_timezone, s.timezone)`
    : '';
  const now = clocks.length ? 'COALESCE(clock.localNow, NOW())' : 'NOW()';
  const at = 'COALESCE(i.occurrence_date, i.start_at, i.due_at)';
  const overdue = `(i.status = 'pending' AND (i.due_at < ${now} OR (i.due_at IS NULL AND DATE(${at}) < DATE(${now}))))`;
  const rank = `CASE WHEN DATE(${at}) = DATE(${now}) AND ${overdue} THEN 0 WHEN DATE(${at}) = DATE(${now}) THEN 1 WHEN ${overdue} THEN 2 WHEN ${at} IS NOT NULL THEN 3 ELSE 4 END`;
  const representative = `CONCAT(${rank}, ${stamp(`IF(${overdue}, COALESCE(i.due_at, ${at}), ${at})`)}, '|', i.id)`;
  const members = `SELECT i.id, ${group} AS groupKey, ${node} AS nodeKey,
    IF(${scheduled}, i.series_id, NULL) AS seriesId, ${representative} AS representativeOrder,
    IF(${overdue}, 1, 0) AS overdue, IF(i.status = 'pending' AND DATE(${at}) > DATE(${now}), 1, 0) AS future
    FROM todo_items i LEFT JOIN todo_series s ON s.id = i.series_id AND s.user_id = i.user_id ${clockJoin}
    WHERE ${filter.where.join(' AND ')}`;
  const grouped = `SELECT CASE WHEN MAX(groupKey = 'focus') THEN 'focus' ELSE SUBSTRING_INDEX(MIN(CONCAT(representativeOrder, '~', groupKey)), '~', -1) END AS groupKey, nodeKey, MAX(seriesId) AS seriesId,
    COUNT(*) AS instanceCount, SUM(overdue) AS overdueCount, SUM(future) AS futureCount,
    SUBSTRING_INDEX(MIN(representativeOrder), '|', -1) AS representativeId FROM (${members}) membership GROUP BY nodeKey`;
  return { input, params: [...clocks.flat(), ...filter.params], sql: grouped };
}
export async function todoWorkspaceGroups(db, userId, raw) {
  normalize(raw);
  const query = workspaceNodeQuery(userId, raw, await workspaceClocks(db, userId));
  const [rows] = await db.query(
    `SELECT groupKey AS \`key\`, COUNT(*) AS nodeCount, SUM(instanceCount) AS instanceCount FROM (${query.sql}) nodes GROUP BY groupKey ORDER BY CASE groupKey WHEN 'focus' THEN 0 WHEN 'completed' THEN 2 ELSE 1 END, groupKey`,
    query.params,
  );
  return {
    groups: rows.map((row) => ({ ...row, nodeCount: Number(row.nodeCount), instanceCount: Number(row.instanceCount) })),
    items: [],
    nextCursor: null,
  };
}
function nodeOrder(sort) {
  const at = 'COALESCE(r.occurrence_date, r.start_at, r.due_at)';
  const created = 'COALESCE(s.create_time, r.create_time)';
  const orders = {
    smart: `CONCAT(IF(r.due_at < NOW(), '0', IF(DATE(${at}) = CURDATE(), '1', '2')), ${stamp(at)}, 2 - r.priority)`,
    priority: `CONCAT(2 - r.priority, ${stamp(at)})`,
    action: stamp(at),
    due: stamp('r.due_at'),
    newest: reverseStamp(created),
    oldest: stamp(created),
  };
  return `CONCAT(IF(r.status = 'completed', '1', '0'), IF(r.status = 'completed', ${reverseStamp('r.completed_at')}, ${orders[sort]}))`;
}
async function hydratePage(db, userId, ids) {
  // Existing domain hydration deliberately caps ID filters at 50. At most two bounded batches.
  const batches = [];
  for (let offset = 0; offset < ids.length; offset += 50)
    batches.push(
      listTodoPage(db, userId, {
        ids: ids.slice(offset, offset + 50),
        status: 'all',
        organization: true,
        includeTotal: false,
      }),
    );
  return { items: (await Promise.all(batches)).flatMap((page) => page.items) };
}
export async function todoWorkspaceGroupPage(db, userId, raw) {
  const input = normalize(raw);
  if (typeof input.groupKey !== 'string' || !input.groupKey || input.groupKey.length > 64)
    throw organizationError('TODO_GROUP_INVALID', '分组无效');
  const scope = fingerprint(userId, input, 'group');
  const cursor = decodeCursor(input.cursor, scope);
  const query = workspaceNodeQuery(userId, input, await workspaceClocks(db, userId));
  const ordered = `SELECT n.*, ${nodeOrder(input.sort)} AS orderKey FROM (${query.sql}) n
    INNER JOIN todo_items r ON r.id = n.representativeId AND r.user_id = ?
    LEFT JOIN todo_series s ON s.id = r.series_id AND s.user_id = r.user_id WHERE n.groupKey = ?`;
  const [rows] = await db.query(
    `SELECT * FROM (${ordered}) ordered ${cursor ? 'WHERE orderKey > ? OR (orderKey = ? AND nodeKey > ?)' : ''} ORDER BY orderKey, nodeKey LIMIT ?`,
    [
      ...query.params,
      userId,
      input.groupKey,
      ...(cursor ? [cursor.order, cursor.order, cursor.key] : []),
      input.limit + 1,
    ],
  );
  const [[count]] = await db.query(`SELECT COUNT(*) AS total FROM (${query.sql}) nodes WHERE groupKey = ?`, [
    ...query.params,
    input.groupKey,
  ]);
  const more = rows.length > input.limit;
  const page = rows.slice(0, input.limit);
  const hydrated = page.length
    ? await hydratePage(
        db,
        userId,
        page.map((row) => row.representativeId),
      )
    : { items: [] };
  const byId = new Map(hydrated.items.map((item) => [String(item.id), item]));
  return {
    nodes: page
      .filter((row) => byId.has(String(row.representativeId)))
      .map((row) => {
        const item = byId.get(String(row.representativeId));
        return row.seriesId
          ? {
              kind: 'series',
              key: row.nodeKey,
              seriesId: row.seriesId,
              representative: item,
              instanceCount: Number(row.instanceCount),
              overdueCount: Number(row.overdueCount),
              futureCount: Number(row.futureCount),
            }
          : { kind: 'item', key: row.nodeKey, item };
      }),
    total: Number(count?.total || 0),
    nextCursor: more ? encodeCursor(scope, page[page.length - 1]) : null,
  };
}
export async function todoWorkspaceSeriesPage(db, userId, raw) {
  if (typeof raw.seriesId !== 'string' || !raw.seriesId || raw.seriesId.length > 64)
    throw organizationError('TODO_SERIES_INVALID', '系列无效');
  const [series] = await db.query('SELECT id FROM todo_series WHERE id = ? AND user_id = ?', [raw.seriesId, userId]);
  if (!series.length) throw organizationError('TODO_NOT_FOUND', '系列不存在或无权访问', 404);
  const input = normalize(
    raw.wholeSeries === true
      ? { seriesId: raw.seriesId, wholeSeries: true, status: raw.status, cursor: raw.cursor, limit: raw.limit }
      : raw,
  );
  const filter = filterSql(userId, input);
  filter.where.push('i.series_id = ?');
  filter.params.push(input.seriesId);
  const scope = fingerprint(userId, input, 'series');
  const cursor = decodeCursor(input.cursor, scope);
  const order =
    input.status === 'completed'
      ? reverseStamp('i.completed_at')
      : stamp('COALESCE(i.occurrence_date, i.start_at, i.due_at)');
  const sql = `SELECT i.id AS nodeKey, ${order} AS orderKey FROM todo_items i WHERE ${filter.where.join(' AND ')}`;
  const [rows] = await db.query(
    `SELECT * FROM (${sql}) instances ${cursor ? 'WHERE orderKey > ? OR (orderKey = ? AND nodeKey > ?)' : ''} ORDER BY orderKey, nodeKey LIMIT ?`,
    [...filter.params, ...(cursor ? [cursor.order, cursor.order, cursor.key] : []), input.limit + 1],
  );
  const [[count]] = await db.query(
    `SELECT COUNT(*) AS total FROM todo_items i WHERE ${filter.where.join(' AND ')}`,
    filter.params,
  );
  const page = rows.slice(0, input.limit);
  const hydrated = page.length
    ? await hydratePage(
        db,
        userId,
        page.map((row) => row.nodeKey),
      )
    : { items: [] };
  const map = new Map(hydrated.items.map((item) => [String(item.id), item]));
  return {
    items: page.map((row) => map.get(String(row.nodeKey))).filter(Boolean),
    total: Number(count?.total || 0),
    nextCursor: rows.length > input.limit ? encodeCursor(scope, page[page.length - 1]) : null,
  };
}
