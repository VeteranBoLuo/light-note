import crypto from 'node:crypto';
import pool from '../../db/index.js';
import { resolvePersonalKnowledgeResourceMetadata } from '../personalKnowledgeSearch.js';
import { toolboxError } from './errors.js';

export const TOOLBOX_WORKSPACE_KINDS = Object.freeze(['research', 'learning', 'writing']);
export const TOOLBOX_WORKSPACE_STATUSES = Object.freeze(['active', 'paused', 'completed', 'archived']);
export const TOOLBOX_WORKSPACE_LANES = Object.freeze(['inbox', 'knowledge', 'action']);
export const TOOLBOX_WORKSPACE_ITEM_STATUSES = Object.freeze(['open', 'in_progress', 'done', 'archived']);

const MAX_WORKSPACES = 50;
const MAX_RESOURCES = 100;
const MAX_ITEMS = 500;
const HOME_CONTINUE_WORKSPACE_LIMIT = 4;
const HOME_RECENT_WORKSPACE_LIMIT = 6;
const HOME_WORKSPACE_SCAN_LIMIT = 50;
const WORKSPACE_OPEN_TOUCH_INTERVAL_MINUTES = 5;

function requiredUserId(userId) {
  const value = String(userId || '').trim();
  if (!value) throw toolboxError('TOOLBOX_USER_REQUIRED', '缺少用户身份', 401);
  return value;
}

function requiredText(value, field, maxLength) {
  const text = String(value || '').trim();
  if (!text) throw toolboxError('TOOLBOX_WORKSPACE_FIELD_REQUIRED', `${field}不能为空`, 400, { field });
  if (text.length > maxLength) {
    throw toolboxError('TOOLBOX_WORKSPACE_FIELD_TOO_LONG', `${field}内容过长`, 400, { field, maxLength });
  }
  return text;
}

function optionalText(value, field, maxLength) {
  if (value == null) return null;
  const text = String(value).trim();
  if (text.length > maxLength) {
    throw toolboxError('TOOLBOX_WORKSPACE_FIELD_TOO_LONG', `${field}内容过长`, 400, { field, maxLength });
  }
  return text || null;
}

function oneOf(value, values, field) {
  const normalized = String(value || '').trim();
  if (!values.includes(normalized)) {
    throw toolboxError('TOOLBOX_WORKSPACE_FIELD_INVALID', `${field}不受支持`, 400, { field });
  }
  return normalized;
}

function optionalDate(value, field = 'targetDate') {
  if (value == null || value === '') return null;
  const normalized = String(value).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(normalized) || Number.isNaN(new Date(`${normalized}T00:00:00Z`).getTime())) {
    throw toolboxError('TOOLBOX_WORKSPACE_FIELD_INVALID', `${field}格式无效`, 400, { field });
  }
  return normalized;
}

function iso(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toISOString();
}

function dateOnly(value) {
  if (!value) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return iso(value)?.slice(0, 10) || null;
}

function localDateOnly(value) {
  if (!(value instanceof Date)) return dateOnly(value);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function mapWorkspace(row) {
  return {
    id: String(row.id),
    kind: String(row.kind),
    title: String(row.title || ''),
    description: String(row.description || ''),
    goal: String(row.goal || ''),
    status: String(row.status || 'active'),
    targetDate: dateOnly(row.target_date),
    nextStep: String(row.next_step || ''),
    resourceCount: Number(row.resource_count || 0),
    openItemCount: Number(row.open_item_count || 0),
    completedItemCount: Number(row.completed_item_count || 0),
    lastOpenedAt: iso(row.last_opened_at),
    createdAt: iso(row.create_time),
    updatedAt: iso(row.updated_at),
    completedAt: iso(row.completed_at),
  };
}

function mapHomeWorkspaceSummary(row) {
  const workspace = mapWorkspace(row);
  return {
    id: workspace.id,
    kind: workspace.kind,
    title: workspace.title,
    status: workspace.status,
    nextStep: workspace.nextStep,
    resourceCount: workspace.resourceCount,
    openItemCount: workspace.openItemCount,
    completedItemCount: workspace.completedItemCount,
    lastOpenedAt: workspace.lastOpenedAt,
    updatedAt: workspace.updatedAt,
  };
}

function workspaceActivityTime(workspace) {
  const time = new Date(workspace.lastOpenedAt || workspace.updatedAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

async function selectHomeWorkspaceSummary(database, ownerId, workspaceId) {
  const [rows] = await database.query(
    `SELECT w.id, w.kind, w.title, w.status, w.next_step, w.last_opened_at, w.updated_at,
            (SELECT COUNT(*)
               FROM toolbox_workspace_resources resource
              WHERE resource.workspace_id = w.id AND resource.user_id = w.user_id) AS resource_count,
            (SELECT COALESCE(SUM(item.status IN ('open', 'in_progress')), 0)
               FROM toolbox_workspace_items item
              WHERE item.workspace_id = w.id AND item.user_id = w.user_id) AS open_item_count,
            (SELECT COALESCE(SUM(item.status = 'done'), 0)
               FROM toolbox_workspace_items item
              WHERE item.workspace_id = w.id AND item.user_id = w.user_id) AS completed_item_count
       FROM toolbox_workspaces w
      WHERE w.id = ? AND w.user_id = ?
      LIMIT 1`,
    [workspaceId, ownerId],
  );
  return rows[0] ? mapHomeWorkspaceSummary(rows[0]) : null;
}

function mapResource(row) {
  return {
    id: Number(row.id),
    type: String(row.resource_type),
    resourceId: String(row.resource_id),
    version: String(row.resource_version || ''),
    title: String(row.resource_title || ''),
    createdAt: iso(row.create_time),
  };
}

function mapItem(row) {
  return {
    id: String(row.id),
    lane: String(row.lane),
    title: String(row.title || ''),
    content: String(row.content || ''),
    status: String(row.status || 'open'),
    position: Number(row.position || 0),
    dueOn: dateOnly(row.due_on),
    createdAt: iso(row.create_time),
    updatedAt: iso(row.updated_at),
    completedAt: iso(row.completed_at),
  };
}

function mapSession(row) {
  return {
    id: String(row.id),
    summary: String(row.summary || ''),
    nextStep: String(row.next_step || ''),
    durationMinutes: Number(row.duration_minutes || 0),
    createdAt: iso(row.create_time),
  };
}

function normalizeResourceRefs(resourceRefs) {
  const refs = Array.isArray(resourceRefs) ? resourceRefs : [];
  const unique = new Map();
  for (const raw of refs) {
    const type = oneOf(raw?.type, ['note', 'bookmark', 'file'], 'resourceType');
    const id = requiredText(raw?.id, 'resourceId', 128);
    const key = `${type}:${id}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      type,
      id,
      title: optionalText(raw?.title, 'resourceTitle', 255) || '',
    });
  }
  if (!unique.size) throw toolboxError('TOOLBOX_WORKSPACE_RESOURCES_REQUIRED', '请选择要加入的资料', 400);
  if (unique.size > MAX_RESOURCES) {
    throw toolboxError('TOOLBOX_WORKSPACE_RESOURCE_LIMIT', `单个工作区最多关联 ${MAX_RESOURCES} 项资料`, 409);
  }
  return [...unique.values()];
}

async function requireWorkspace(database, userId, workspaceId) {
  const id = requiredText(workspaceId, 'workspaceId', 36);
  const [rows] = await database.query(`SELECT * FROM toolbox_workspaces WHERE id = ? AND user_id = ? LIMIT 1`, [
    id,
    userId,
  ]);
  if (!rows[0]) throw toolboxError('TOOLBOX_WORKSPACE_NOT_FOUND', '工作区不存在或已不可访问', 404);
  return rows[0];
}

async function lockWorkspace(database, userId, workspaceId) {
  const id = requiredText(workspaceId, 'workspaceId', 36);
  const [rows] = await database.query(
    `SELECT id FROM toolbox_workspaces WHERE id = ? AND user_id = ? LIMIT 1 FOR UPDATE`,
    [id, userId],
  );
  if (!rows[0]) throw toolboxError('TOOLBOX_WORKSPACE_NOT_FOUND', '工作区不存在或已不可访问', 404);
  return rows[0];
}

async function withTransaction(database, work) {
  if (typeof database.getConnection !== 'function') return work(database);
  const connection = await database.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export function calculateWorkspaceStreak(sessionDates = [], today = new Date()) {
  const unique = [...new Set(sessionDates.map((value) => dateOnly(value)).filter(Boolean))].sort().reverse();
  if (!unique.length) return 0;
  const base = new Date(`${localDateOnly(today)}T00:00:00Z`);
  const latest = new Date(`${unique[0]}T00:00:00Z`);
  const dayMs = 24 * 60 * 60 * 1000;
  const gap = Math.round((base.getTime() - latest.getTime()) / dayMs);
  if (gap > 1 || gap < 0) return 0;
  let streak = 1;
  let cursor = latest;
  for (let index = 1; index < unique.length; index += 1) {
    const current = new Date(`${unique[index]}T00:00:00Z`);
    if (Math.round((cursor.getTime() - current.getTime()) / dayMs) !== 1) break;
    streak += 1;
    cursor = current;
  }
  return streak;
}

export async function listToolboxWorkspaces({ userId, kind, status, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const workspaceKind = oneOf(kind, TOOLBOX_WORKSPACE_KINDS, 'kind');
  const params = [ownerId, workspaceKind];
  const statusSql = status ? 'AND w.status = ?' : "AND w.status <> 'archived'";
  if (status) params.push(oneOf(status, TOOLBOX_WORKSPACE_STATUSES, 'status'));
  const [rows] = await database.query(
    `SELECT w.*,
            COALESCE(resources.resource_count, 0) AS resource_count,
            COALESCE(items.open_item_count, 0) AS open_item_count,
            COALESCE(items.completed_item_count, 0) AS completed_item_count
       FROM toolbox_workspaces w
       LEFT JOIN (
         SELECT workspace_id, COUNT(*) AS resource_count
           FROM toolbox_workspace_resources
          WHERE user_id = ?
          GROUP BY workspace_id
       ) resources ON resources.workspace_id = w.id
       LEFT JOIN (
         SELECT workspace_id,
                SUM(status IN ('open', 'in_progress')) AS open_item_count,
                SUM(status = 'done') AS completed_item_count
           FROM toolbox_workspace_items
          WHERE user_id = ?
          GROUP BY workspace_id
       ) items ON items.workspace_id = w.id
      WHERE w.user_id = ? AND w.kind = ? ${statusSql}
      ORDER BY FIELD(w.status, 'active', 'paused', 'completed', 'archived'), w.updated_at DESC
      LIMIT ${MAX_WORKSPACES}`,
    [ownerId, ownerId, ...params],
  );
  return rows.map(mapWorkspace);
}

export async function listToolboxHomeWorkspaces({ userId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const [rows] = await database.query(
    `SELECT w.id, w.kind, w.title, w.status, w.next_step, w.last_opened_at, w.updated_at,
            COALESCE(resources.resource_count, 0) AS resource_count,
            COALESCE(items.open_item_count, 0) AS open_item_count,
            COALESCE(items.completed_item_count, 0) AS completed_item_count
       FROM toolbox_workspaces w
       LEFT JOIN (
         SELECT workspace_id, COUNT(*) AS resource_count
           FROM toolbox_workspace_resources
          WHERE user_id = ?
          GROUP BY workspace_id
       ) resources ON resources.workspace_id = w.id
       LEFT JOIN (
         SELECT workspace_id,
                SUM(status IN ('open', 'in_progress')) AS open_item_count,
                SUM(status = 'done') AS completed_item_count
           FROM toolbox_workspace_items
          WHERE user_id = ?
          GROUP BY workspace_id
       ) items ON items.workspace_id = w.id
      WHERE w.user_id = ? AND w.status <> 'archived'
      ORDER BY COALESCE(w.last_opened_at, w.updated_at, w.create_time) DESC, w.id DESC
      LIMIT ${HOME_WORKSPACE_SCAN_LIMIT}`,
    [ownerId, ownerId, ownerId],
  );
  const summaries = rows.map(mapHomeWorkspaceSummary);
  const continuation = summaries
    .filter((workspace) => workspace.status === 'active' || workspace.status === 'paused')
    .sort((left, right) => {
      const statusDifference = Number(left.status === 'paused') - Number(right.status === 'paused');
      return statusDifference || workspaceActivityTime(right) - workspaceActivityTime(left);
    })
    .slice(0, HOME_CONTINUE_WORKSPACE_LIMIT);
  // 最近打开与待继续语义独立：前者按真实活动时间，后者按行动状态。
  const recent = summaries.slice(0, HOME_RECENT_WORKSPACE_LIMIT);
  return { continue: continuation, recent };
}

export async function markToolboxWorkspaceOpened({ userId, workspaceId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const id = requiredText(workspaceId, 'workspaceId', 36);
  await database.query(
    `UPDATE toolbox_workspaces
        SET last_opened_at = CURRENT_TIMESTAMP,
            updated_at = updated_at
      WHERE id = ? AND user_id = ?
        AND (last_opened_at IS NULL
          OR last_opened_at <= DATE_SUB(CURRENT_TIMESTAMP, INTERVAL ${WORKSPACE_OPEN_TOUCH_INTERVAL_MINUTES} MINUTE))`,
    [id, ownerId],
  );
  const summary = await selectHomeWorkspaceSummary(database, ownerId, id);
  if (!summary) throw toolboxError('TOOLBOX_WORKSPACE_NOT_FOUND', '工作区不存在或已不可访问', 404);
  return summary;
}

export async function createToolboxWorkspace({ userId, input = {}, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const kind = oneOf(input.kind, TOOLBOX_WORKSPACE_KINDS, 'kind');
  const title = requiredText(input.title, 'title', 120);
  const description = optionalText(input.description, 'description', 500);
  const goal = optionalText(input.goal, 'goal', 1000);
  const targetDate = optionalDate(input.targetDate);
  const nextStep = optionalText(input.nextStep, 'nextStep', 500);
  const [countRows] = await database.query(
    "SELECT COUNT(*) AS total FROM toolbox_workspaces WHERE user_id = ? AND status <> 'archived'",
    [ownerId],
  );
  if (Number(countRows[0]?.total || 0) >= MAX_WORKSPACES) {
    throw toolboxError('TOOLBOX_WORKSPACE_LIMIT', `每个账号最多保留 ${MAX_WORKSPACES} 个进行中的工作区`, 409);
  }
  const id = crypto.randomUUID();
  await database.query(
    `INSERT INTO toolbox_workspaces
      (id, user_id, kind, title, description, goal, status, target_date, next_step, last_opened_at)
     VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?, CURRENT_TIMESTAMP)`,
    [id, ownerId, kind, title, description, goal, targetDate, nextStep],
  );
  return getToolboxWorkspace({ userId: ownerId, workspaceId: id, database });
}

export async function getToolboxWorkspace({ userId, workspaceId, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const workspace = await requireWorkspace(database, ownerId, workspaceId);
  const [resourcesResult, itemsResult, sessionsResult, datesResult] = await Promise.all([
    database.query(
      `SELECT * FROM toolbox_workspace_resources WHERE workspace_id = ? AND user_id = ? ORDER BY create_time DESC`,
      [workspace.id, ownerId],
    ),
    database.query(
      `SELECT * FROM toolbox_workspace_items
        WHERE workspace_id = ? AND user_id = ? AND status <> 'archived'
        ORDER BY FIELD(lane, 'inbox', 'knowledge', 'action'), position, create_time`,
      [workspace.id, ownerId],
    ),
    database.query(
      `SELECT * FROM toolbox_workspace_sessions WHERE workspace_id = ? AND user_id = ? ORDER BY create_time DESC LIMIT 12`,
      [workspace.id, ownerId],
    ),
    database.query(
      `SELECT DISTINCT DATE_FORMAT(create_time, '%Y-%m-%d') AS session_date
         FROM toolbox_workspace_sessions
        WHERE workspace_id = ? AND user_id = ? AND create_time >= DATE_SUB(CURRENT_DATE, INTERVAL 366 DAY)
        ORDER BY session_date DESC`,
      [workspace.id, ownerId],
    ),
  ]);
  const resources = resourcesResult[0].map(mapResource);
  const items = itemsResult[0].map(mapItem);
  const sessions = sessionsResult[0].map(mapSession);
  return {
    ...mapWorkspace({
      ...workspace,
      resource_count: resources.length,
      open_item_count: items.filter((item) => ['open', 'in_progress'].includes(item.status)).length,
      completed_item_count: items.filter((item) => item.status === 'done').length,
    }),
    streakDays: calculateWorkspaceStreak(datesResult[0].map((row) => row.session_date)),
    resources,
    items,
    sessions,
  };
}

export async function updateToolboxWorkspace({ userId, workspaceId, input = {}, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const workspace = await requireWorkspace(database, ownerId, workspaceId);
  const setters = [];
  const params = [];
  const fields = [
    ['title', 'title', (value) => requiredText(value, 'title', 120)],
    ['description', 'description', (value) => optionalText(value, 'description', 500)],
    ['goal', 'goal', (value) => optionalText(value, 'goal', 1000)],
    ['targetDate', 'target_date', (value) => optionalDate(value)],
    ['nextStep', 'next_step', (value) => optionalText(value, 'nextStep', 500)],
    ['status', 'status', (value) => oneOf(value, TOOLBOX_WORKSPACE_STATUSES, 'status')],
  ];
  for (const [inputKey, column, normalize] of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, inputKey)) continue;
    setters.push(`${column} = ?`);
    params.push(normalize(input[inputKey]));
  }
  if (!setters.length) throw toolboxError('TOOLBOX_WORKSPACE_UPDATE_EMPTY', '没有可更新的工作区字段', 400);
  const nextStatus = Object.prototype.hasOwnProperty.call(input, 'status') ? input.status : workspace.status;
  setters.push("completed_at = CASE WHEN ? = 'completed' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END");
  params.push(nextStatus);
  params.push(workspace.id, ownerId);
  await database.query(
    `UPDATE toolbox_workspaces SET ${setters.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
    params,
  );
  return getToolboxWorkspace({ userId: ownerId, workspaceId: workspace.id, database });
}

export async function addToolboxWorkspaceResources({ userId, workspaceId, resourceRefs, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  const refs = normalizeResourceRefs(resourceRefs);
  await withTransaction(database, async (connection) => {
    await lockWorkspace(connection, ownerId, workspaceId);
    // 归属与版本校验必须和引用写入处于同一事务快照，避免资源在校验后、落库前被删除。
    const verified = await resolvePersonalKnowledgeResourceMetadata({
      userId: ownerId,
      resourceRefs: refs,
      database: connection,
      lockForShare: true,
    });
    const verifiedByKey = new Map(verified.map((ref) => [`${ref.type}:${ref.id}`, ref]));
    if (verifiedByKey.size !== refs.length) {
      throw toolboxError('TOOLBOX_WORKSPACE_RESOURCE_UNAVAILABLE', '部分资料已删除、无权访问或暂时不可用', 409);
    }
    const [existingRows] = await connection.query(
      `SELECT resource_type, resource_id FROM toolbox_workspace_resources WHERE workspace_id = ? AND user_id = ? FOR UPDATE`,
      [workspaceId, ownerId],
    );
    const existing = new Set(existingRows.map((row) => `${row.resource_type}:${row.resource_id}`));
    const additions = refs.filter((ref) => !existing.has(`${ref.type}:${ref.id}`));
    if (existing.size + additions.length > MAX_RESOURCES) {
      throw toolboxError('TOOLBOX_WORKSPACE_RESOURCE_LIMIT', `单个工作区最多关联 ${MAX_RESOURCES} 项资料`, 409);
    }
    for (const ref of additions) {
      const authoritative = verifiedByKey.get(`${ref.type}:${ref.id}`);
      const version = authoritative?.version || '';
      const title = authoritative?.title || ref.title;
      await connection.query(
        `INSERT INTO toolbox_workspace_resources
          (workspace_id, user_id, resource_type, resource_id, resource_version, resource_title)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [workspaceId, ownerId, ref.type, ref.id, version, title],
      );
    }
    if (additions.length) {
      await connection.query(
        `UPDATE toolbox_workspaces SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
        [workspaceId, ownerId],
      );
    }
  });
  return getToolboxWorkspace({ userId: ownerId, workspaceId, database });
}

export async function removeToolboxWorkspaceResource({ userId, workspaceId, resource, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  await requireWorkspace(database, ownerId, workspaceId);
  const type = oneOf(resource?.type, ['note', 'bookmark', 'file'], 'resourceType');
  const id = requiredText(resource?.id, 'resourceId', 128);
  await database.query(
    `DELETE FROM toolbox_workspace_resources
      WHERE workspace_id = ? AND user_id = ? AND resource_type = ? AND resource_id = ?`,
    [workspaceId, ownerId, type, id],
  );
  await database.query(`UPDATE toolbox_workspaces SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [
    workspaceId,
    ownerId,
  ]);
  return getToolboxWorkspace({ userId: ownerId, workspaceId, database });
}

export async function createToolboxWorkspaceItem({ userId, workspaceId, input = {}, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  await requireWorkspace(database, ownerId, workspaceId);
  const lane = oneOf(input.lane, TOOLBOX_WORKSPACE_LANES, 'lane');
  const title = requiredText(input.title, 'title', 255);
  const content = optionalText(input.content, 'content', 5000);
  const dueOn = optionalDate(input.dueOn, 'dueOn');
  const id = crypto.randomUUID();
  await withTransaction(database, async (connection) => {
    await lockWorkspace(connection, ownerId, workspaceId);
    const [countRows] = await connection.query(
      `SELECT COUNT(*) AS total FROM toolbox_workspace_items
        WHERE workspace_id = ? AND user_id = ? AND status <> 'archived'`,
      [workspaceId, ownerId],
    );
    if (Number(countRows[0]?.total || 0) >= MAX_ITEMS) {
      throw toolboxError('TOOLBOX_WORKSPACE_ITEM_LIMIT', `单个工作区最多保留 ${MAX_ITEMS} 个事项`, 409);
    }
    const [positionRows] = await connection.query(
      `SELECT COALESCE(MAX(position), -1) + 1 AS next_position
         FROM toolbox_workspace_items WHERE workspace_id = ? AND user_id = ? AND lane = ?`,
      [workspaceId, ownerId, lane],
    );
    await connection.query(
      `INSERT INTO toolbox_workspace_items
        (id, workspace_id, user_id, lane, title, content, status, position, due_on)
       VALUES (?, ?, ?, ?, ?, ?, 'open', ?, ?)`,
      [id, workspaceId, ownerId, lane, title, content, Number(positionRows[0]?.next_position || 0), dueOn],
    );
    await connection.query(
      `UPDATE toolbox_workspaces SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`,
      [workspaceId, ownerId],
    );
  });
  return getToolboxWorkspace({ userId: ownerId, workspaceId, database });
}

export async function updateToolboxWorkspaceItem({ userId, workspaceId, itemId, input = {}, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  await requireWorkspace(database, ownerId, workspaceId);
  const [rows] = await database.query(
    `SELECT * FROM toolbox_workspace_items WHERE id = ? AND workspace_id = ? AND user_id = ? LIMIT 1`,
    [requiredText(itemId, 'itemId', 36), workspaceId, ownerId],
  );
  if (!rows[0]) throw toolboxError('TOOLBOX_WORKSPACE_ITEM_NOT_FOUND', '事项不存在或已不可访问', 404);
  const setters = [];
  const params = [];
  const fields = [
    ['title', 'title', (value) => requiredText(value, 'title', 255)],
    ['content', 'content', (value) => optionalText(value, 'content', 5000)],
    ['lane', 'lane', (value) => oneOf(value, TOOLBOX_WORKSPACE_LANES, 'lane')],
    ['status', 'status', (value) => oneOf(value, TOOLBOX_WORKSPACE_ITEM_STATUSES, 'status')],
    ['dueOn', 'due_on', (value) => optionalDate(value, 'dueOn')],
    ['position', 'position', (value) => Math.max(0, Math.min(100_000, Number(value) || 0))],
  ];
  for (const [inputKey, column, normalize] of fields) {
    if (!Object.prototype.hasOwnProperty.call(input, inputKey)) continue;
    setters.push(`${column} = ?`);
    params.push(normalize(input[inputKey]));
  }
  if (!setters.length) throw toolboxError('TOOLBOX_WORKSPACE_ITEM_UPDATE_EMPTY', '没有可更新的事项字段', 400);
  const nextStatus = Object.prototype.hasOwnProperty.call(input, 'status') ? input.status : rows[0].status;
  setters.push("completed_at = CASE WHEN ? = 'done' THEN COALESCE(completed_at, CURRENT_TIMESTAMP) ELSE NULL END");
  params.push(nextStatus, itemId, workspaceId, ownerId);
  await database.query(
    `UPDATE toolbox_workspace_items SET ${setters.join(', ')}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND workspace_id = ? AND user_id = ?`,
    params,
  );
  await database.query(`UPDATE toolbox_workspaces SET updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`, [
    workspaceId,
    ownerId,
  ]);
  return getToolboxWorkspace({ userId: ownerId, workspaceId, database });
}

export async function createToolboxWorkspaceSession({ userId, workspaceId, input = {}, database = pool } = {}) {
  const ownerId = requiredUserId(userId);
  await requireWorkspace(database, ownerId, workspaceId);
  const summary = optionalText(input.summary, 'summary', 1000);
  const nextStep = optionalText(input.nextStep, 'nextStep', 500);
  if (!summary && !nextStep) {
    throw toolboxError('TOOLBOX_WORKSPACE_SESSION_EMPTY', '请记录本次进展或下一步', 400);
  }
  const durationMinutes = Math.max(0, Math.min(1440, Math.round(Number(input.durationMinutes) || 0)));
  const id = crypto.randomUUID();
  await withTransaction(database, async (connection) => {
    await lockWorkspace(connection, ownerId, workspaceId);
    await connection.query(
      `INSERT INTO toolbox_workspace_sessions
        (id, workspace_id, user_id, summary, next_step, duration_minutes)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [id, workspaceId, ownerId, summary, nextStep, durationMinutes],
    );
    await connection.query(
      `UPDATE toolbox_workspaces
          SET next_step = COALESCE(?, next_step),
              last_opened_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?`,
      [nextStep, workspaceId, ownerId],
    );
  });
  return getToolboxWorkspace({ userId: ownerId, workspaceId, database });
}

export const toolboxWorkspaceInternals = Object.freeze({
  HOME_CONTINUE_WORKSPACE_LIMIT,
  HOME_RECENT_WORKSPACE_LIMIT,
  WORKSPACE_OPEN_TOUCH_INTERVAL_MINUTES,
  mapHomeWorkspaceSummary,
  normalizeResourceRefs,
  requiredText,
  optionalText,
  optionalDate,
  localDateOnly,
});
