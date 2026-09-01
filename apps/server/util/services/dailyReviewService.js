import pool from '../../db/index.js';
import { insertData } from '../common.js';
import { getGrowthCalendarContext } from '../growthPreferences.js';
import {
  DAILY_REVIEW_RESOURCE_TYPES,
  dailyReviewBookmarkUrlCondition,
  loadDailyReviewCandidates,
  resolveDailyReviewBookmarkUrl,
} from './dailyReviewCandidateService.js';

export const DAILY_REVIEW_ITEM_ACTIONS = Object.freeze(['open', 'open_tag_space', 'snooze_7d', 'dismiss']);
export const DAILY_REVIEW_SESSION_ACTIONS = Object.freeze(['skip_today', 'resume_today']);

const STORED_ACTION_BY_REQUEST = Object.freeze({
  open: 'opened',
  open_tag_space: 'opened_tag_space',
  snooze_7d: 'snoozed',
  dismiss: 'dismissed',
});

const RESOURCE_TABLES = Object.freeze({
  bookmark: {
    table: 'bookmark',
    ownerColumn: 'user_id',
    ownerCharset: 'utf8',
    ownerCollation: 'utf8_general_ci',
    liveCondition: `del_flag = 0 AND ${dailyReviewBookmarkUrlCondition('url')}`,
  },
  note: {
    table: 'note',
    ownerColumn: 'create_by',
    ownerCharset: 'utf8mb4',
    ownerCollation: 'utf8mb4_unicode_ci',
    liveCondition: "del_flag = '0'",
  },
  file: {
    table: 'files',
    ownerColumn: 'create_by',
    ownerCharset: 'utf8mb4',
    ownerCollation: 'utf8mb4_unicode_ci',
    liveCondition: 'del_flag = 0',
  },
});

export class DailyReviewError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.name = 'DailyReviewError';
    this.code = code;
    this.status = status;
  }
}

function normalizeUserId(value) {
  const userId = String(value || '').trim();
  if (!userId || userId === 'visitor') throw new DailyReviewError('DAILY_REVIEW_LOGIN_REQUIRED', 401);
  return userId;
}

function dateFromCalendar(calendar) {
  const dayKey = String(calendar?.dayKey || '');
  if (!/^\d{8}$/.test(dayKey)) throw new DailyReviewError('DAILY_REVIEW_CALENDAR_INVALID', 500);
  return `${dayKey.slice(0, 4)}-${dayKey.slice(4, 6)}-${dayKey.slice(6, 8)}`;
}

async function resolveCalendar(userId, calendar, db) {
  return calendar || getGrowthCalendarContext(userId, { db });
}

function normalizeSession(row) {
  if (!row) return null;
  return {
    id: String(row.id || ''),
    status: String(row.status || 'active'),
    itemCount: Math.max(0, Number(row.itemCount ?? row.item_count ?? 0)),
    completedAt: row.completedAt ?? row.completed_at ?? null,
    skippedAt: row.skippedAt ?? row.skipped_at ?? null,
    timezoneSnapshot: String(row.timezone || row.timezoneSnapshot || '').trim() || null,
  };
}

async function findSession(db, userId, date, { forUpdate = false } = {}) {
  const [rows] = await db.query(
    `SELECT id, timezone, status, item_count AS itemCount,
            completed_at AS completedAt, skipped_at AS skippedAt
       FROM daily_content_review_sessions
      WHERE user_id = ? AND review_date = ?
      LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
    [userId, date],
  );
  return normalizeSession(rows?.[0]);
}

const hydrateText = (expression) => `CONVERT(${expression} USING utf8mb4) COLLATE utf8mb4_unicode_ci`;

const HYDRATE_ITEMS_SQL = `
  SELECT hydrated.*
  FROM (
    SELECT i.id, i.slot,
           ${hydrateText("'bookmark'")} AS resourceType,
           ${hydrateText('b.id')} AS resourceId,
           ${hydrateText('b.name')} AS title,
           ${hydrateText('b.url')} AS url,
           b.create_time AS time,
           DATE_FORMAT(i.resource_date, '%Y-%m-%d') AS resourceDate,
           i.reason_code AS reasonCode,
           ${hydrateText('i.reason_tag_id')} AS reasonTagId,
           ${hydrateText('reason_tag.name')} AS reasonTagName,
           i.action, i.acted_at AS actedAt
      FROM daily_content_review_items i
      INNER JOIN bookmark b
        ON i.resource_type = 'bookmark'
       AND ${hydrateText('b.id')} = ${hydrateText('i.resource_id')}
       AND b.user_id = CONVERT(? USING utf8) COLLATE utf8_general_ci
       AND b.del_flag = 0
       AND ${dailyReviewBookmarkUrlCondition('b.url')}
      LEFT JOIN resource_tag_relations reason_relation
        ON BINARY i.reason_code = 'active_tag'
       AND reason_relation.tag_id = CONVERT(i.reason_tag_id USING utf8) COLLATE utf8_general_ci
       AND reason_relation.user_id = CONVERT(i.user_id USING utf8) COLLATE utf8_general_ci
       AND reason_relation.resource_type = 'bookmark'
       AND reason_relation.resource_id = CONVERT(b.id USING utf8) COLLATE utf8_general_ci
      LEFT JOIN tag reason_tag
        ON reason_tag.id = reason_relation.tag_id
       AND reason_tag.user_id = reason_relation.user_id
       AND reason_tag.del_flag = 0
     WHERE i.user_id = ? AND i.session_id = ?
    UNION ALL
    SELECT i.id, i.slot,
           ${hydrateText("'note'")} AS resourceType,
           ${hydrateText('n.id')} AS resourceId,
           ${hydrateText('n.title')} AS title,
           ${hydrateText('NULL')} AS url,
           n.create_time AS time,
           DATE_FORMAT(i.resource_date, '%Y-%m-%d') AS resourceDate,
           i.reason_code AS reasonCode,
           ${hydrateText('i.reason_tag_id')} AS reasonTagId,
           ${hydrateText('reason_tag.name')} AS reasonTagName,
           i.action, i.acted_at AS actedAt
      FROM daily_content_review_items i
      INNER JOIN note n
        ON i.resource_type = 'note'
       AND ${hydrateText('n.id')} = ${hydrateText('i.resource_id')}
       AND n.create_by = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND n.del_flag = '0'
      LEFT JOIN resource_tag_relations reason_relation
        ON BINARY i.reason_code = 'active_tag'
       AND reason_relation.tag_id = CONVERT(i.reason_tag_id USING utf8) COLLATE utf8_general_ci
       AND reason_relation.user_id = CONVERT(i.user_id USING utf8) COLLATE utf8_general_ci
       AND reason_relation.resource_type = 'note'
       AND reason_relation.resource_id = CONVERT(n.id USING utf8) COLLATE utf8_general_ci
      LEFT JOIN tag reason_tag
        ON reason_tag.id = reason_relation.tag_id
       AND reason_tag.user_id = reason_relation.user_id
       AND reason_tag.del_flag = 0
     WHERE i.user_id = ? AND i.session_id = ?
    UNION ALL
    SELECT i.id, i.slot,
           ${hydrateText("'file'")} AS resourceType,
           ${hydrateText('CAST(f.id AS CHAR)')} AS resourceId,
           ${hydrateText('f.file_name')} AS title,
           ${hydrateText('NULL')} AS url,
           f.create_time AS time,
           DATE_FORMAT(i.resource_date, '%Y-%m-%d') AS resourceDate,
           i.reason_code AS reasonCode,
           ${hydrateText('i.reason_tag_id')} AS reasonTagId,
           ${hydrateText('reason_tag.name')} AS reasonTagName,
           i.action, i.acted_at AS actedAt
      FROM daily_content_review_items i
      INNER JOIN files f
        ON i.resource_type = 'file'
       AND ${hydrateText('CAST(f.id AS CHAR)')} = ${hydrateText('i.resource_id')}
       AND f.create_by = CONVERT(? USING utf8mb4) COLLATE utf8mb4_unicode_ci
       AND f.del_flag = 0
      LEFT JOIN resource_tag_relations reason_relation
        ON BINARY i.reason_code = 'active_tag'
       AND reason_relation.tag_id = CONVERT(i.reason_tag_id USING utf8) COLLATE utf8_general_ci
       AND reason_relation.user_id = CONVERT(i.user_id USING utf8) COLLATE utf8_general_ci
       AND reason_relation.resource_type = 'file'
       AND reason_relation.resource_id = CONVERT(CAST(f.id AS CHAR) USING utf8) COLLATE utf8_general_ci
      LEFT JOIN tag reason_tag
        ON reason_tag.id = reason_relation.tag_id
       AND reason_tag.user_id = reason_relation.user_id
       AND reason_tag.del_flag = 0
     WHERE i.user_id = ? AND i.session_id = ?
  ) hydrated
  ORDER BY hydrated.slot ASC
`;

function normalizeHydratedItem(row) {
  const resourceType = String(row.resourceType || row.resource_type || '');
  const bookmarkUrl = resourceType === 'bookmark' ? resolveDailyReviewBookmarkUrl(row?.url) : null;
  if (resourceType === 'bookmark' && !bookmarkUrl) return null;
  const reasonTagId = String(row?.reasonTagId ?? row?.reason_tag_id ?? '').trim() || null;
  const reasonTagName = String(row?.reasonTagName ?? row?.reason_tag_name ?? '').trim() || null;
  const resourceDateValue = String(row?.resourceDate ?? row?.resource_date ?? '').trim();
  return {
    id: String(row.id || ''),
    slot: Number(row.slot || 0),
    resourceType,
    resourceId: String(row.resourceId || row.resource_id || ''),
    title: String(row.title || ''),
    url: bookmarkUrl,
    time: row.time || null,
    resourceDate: /^\d{4}-\d{2}-\d{2}$/.test(resourceDateValue) ? resourceDateValue : null,
    reasonCode: String(row.reasonCode || row.reason_code || ''),
    reasonTag: reasonTagId && reasonTagName ? { id: reasonTagId, name: reasonTagName } : null,
    action: String(row.action || 'pending'),
  };
}

async function hydrateItems(db, userId, sessionId) {
  const [rows] = await db.query(HYDRATE_ITEMS_SQL, [
    userId,
    userId,
    sessionId,
    userId,
    userId,
    sessionId,
    userId,
    userId,
    sessionId,
  ]);
  return (rows || []).map(normalizeHydratedItem).filter(Boolean);
}

function buildReview({ date, timezone, session, items }) {
  if (!session) {
    return {
      generated: false,
      date,
      timezone,
      session: null,
      progress: { done: 0, total: 0, pending: 0 },
      items: [],
    };
  }
  const done = items.filter((item) => item.action !== 'pending').length;
  const total = items.length;
  const pending = Math.max(0, total - done);
  const effectiveSession = {
    id: session.id,
    status: session.status,
    itemCount: total,
    completedAt: session.completedAt || null,
    skippedAt: session.skippedAt || null,
  };
  // GET 必须保持纯读；除明确跳过外，状态始终由当前仍可用的条目派生。这样资源删除时
  // 不会计入进度，资源当天恢复后也不会遗留 completed + pending > 0 的矛盾状态。
  if (effectiveSession.status !== 'skipped') {
    effectiveSession.status = deriveLiveSessionStatus(session, { total, pending });
    if (effectiveSession.status !== 'completed') effectiveSession.completedAt = null;
    effectiveSession.skippedAt = null;
  }
  return {
    generated: true,
    date,
    timezone,
    session: effectiveSession,
    progress: { done, total, pending },
    items,
  };
}

function deriveLiveSessionStatus(session, { total, pending }) {
  if (session?.status === 'skipped') return 'skipped';
  return total === 0
    ? Number(session?.itemCount || 0) === 0
      ? 'empty'
      : 'completed'
    : pending === 0
      ? 'completed'
      : 'active';
}

async function hydrateSessionReview(db, { userId, date, timezone, session }) {
  const items = session ? await hydrateItems(db, userId, session.id) : [];
  return buildReview({ date, timezone, session, items });
}

export function visitorDailyReview() {
  return {
    generated: false,
    isVisitor: true,
    date: null,
    timezone: null,
    session: null,
    progress: { done: 0, total: 0, pending: 0 },
    items: [],
  };
}

export async function getDailyReviewToday(userId, { calendar = null, db = pool } = {}) {
  const ownerId = normalizeUserId(userId);
  const accountCalendar = await resolveCalendar(ownerId, calendar, db);
  const date = dateFromCalendar(accountCalendar);
  const session = await findSession(db, ownerId, date);
  return hydrateSessionReview(db, {
    userId: ownerId,
    date,
    timezone: session?.timezoneSnapshot || accountCalendar.timezone,
    session,
  });
}

async function insertDailyItems(connection, { userId, sessionId, candidates, idFactory }) {
  if (!candidates.length) return;
  const values = candidates.map(() => `(?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`).join(', ');
  const params = [];
  candidates.forEach((candidate, index) => {
    params.push(
      idFactory(),
      sessionId,
      userId,
      index + 1,
      candidate.resourceType,
      candidate.resourceId,
      candidate.resourceDate,
      candidate.reasonCode,
      candidate.reasonTagId || null,
    );
  });
  await connection.query(
    `INSERT INTO daily_content_review_items
       (id, session_id, user_id, slot, resource_type, resource_id, resource_date, reason_code, reason_tag_id, action)
     VALUES ${values}`,
    params,
  );
}

async function markCandidatesShown(connection, { userId, date, candidates }) {
  if (!candidates.length) return;
  const values = candidates.map(() => '(?, ?, ?, ?)').join(', ');
  const params = candidates.flatMap((candidate) => [userId, candidate.resourceType, candidate.resourceId, date]);
  await connection.query(
    `INSERT INTO growth_recap_state (user_id, resource_type, resource_id, last_shown_date)
     VALUES ${values}
     ON DUPLICATE KEY UPDATE
       last_shown_date = IF(
         growth_recap_state.last_shown_date IS NULL
           OR growth_recap_state.last_shown_date < VALUES(last_shown_date),
         VALUES(last_shown_date),
         growth_recap_state.last_shown_date
       )`,
    params,
  );
}

export async function ensureDailyReviewToday(
  userId,
  { calendar = null, db = pool, idFactory = () => insertData({}).id, loadCandidates = loadDailyReviewCandidates } = {},
) {
  const ownerId = normalizeUserId(userId);
  // 必须在事务外解析日历。InnoDB REPEATABLE READ 下，事务内的普通偏好查询会先建立
  // consistent snapshot；并发首次生成的输家即使随后用 FOR UPDATE 看见赢家 session，
  // 再普通读取 items 仍可能停留在赢家提交前的空快照。
  const accountCalendar = await resolveCalendar(ownerId, calendar, db);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const date = dateFromCalendar(accountCalendar);
    const sessionId = idFactory();
    // 先竞争唯一键，再做锁定读；避免对不存在的 (user_id, review_date) 先加 gap lock，
    // 使两个首次 ensure 互相等待甚至死锁。
    let inserted = false;
    try {
      await connection.query(
        `INSERT INTO daily_content_review_sessions
         (id, user_id, review_date, timezone, status, item_count)
       VALUES (?, ?, ?, ?, 'active', 0)`,
        [sessionId, ownerId, date, accountCalendar.timezone],
      );
      inserted = true;
    } catch (error) {
      if (error?.code !== 'ER_DUP_ENTRY') throw error;
    }
    let session = null;
    if (!inserted) {
      // 唯一键竞争后的锁定读是 current read，可以读取已经提交的赢家及其条目。
      session = await findSession(connection, ownerId, date, { forUpdate: true });
      if (!session) throw new DailyReviewError('DAILY_REVIEW_CONCURRENT_STATE_LOST', 409);
    } else {
      const loadedCandidates = await loadCandidates({
        db: connection,
        userId: ownerId,
        calendar: accountCalendar,
        date,
      });
      const candidates = (Array.isArray(loadedCandidates) ? loadedCandidates : []).slice(0, 3);
      await insertDailyItems(connection, { userId: ownerId, sessionId, candidates, idFactory });
      await markCandidatesShown(connection, { userId: ownerId, date, candidates });
      const status = candidates.length ? 'active' : 'empty';
      await connection.query(
        `UPDATE daily_content_review_sessions
              SET status = ?, item_count = ?, completed_at = NULL, skipped_at = NULL
            WHERE id = ? AND user_id = ?`,
        [status, candidates.length, sessionId, ownerId],
      );
      session = {
        id: sessionId,
        status,
        itemCount: candidates.length,
        completedAt: null,
        skippedAt: null,
        timezoneSnapshot: accountCalendar.timezone,
      };
    }
    const review = await hydrateSessionReview(connection, {
      userId: ownerId,
      date,
      timezone: session?.timezoneSnapshot || accountCalendar.timezone,
      session,
    });
    await connection.commit();
    return review;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function findTodayItemForUpdate(connection, { itemId, userId, date }) {
  const [rows] = await connection.query(
    `SELECT i.id, i.session_id AS sessionId, i.resource_type AS resourceType,
            i.resource_id AS resourceId, i.reason_code AS reasonCode,
            i.reason_tag_id AS reasonTagId, i.action,
            s.status AS sessionStatus, s.item_count AS sessionItemCount,
            s.completed_at AS sessionCompletedAt, s.skipped_at AS sessionSkippedAt,
            s.timezone AS sessionTimezone
       FROM daily_content_review_items i
       INNER JOIN daily_content_review_sessions s
         ON s.id = i.session_id AND s.user_id = i.user_id
      WHERE i.id = ? AND i.user_id = ? AND s.review_date = ?
      LIMIT 1 FOR UPDATE`,
    [itemId, userId, date],
  );
  return rows?.[0] || null;
}

async function ensureResourceAvailable(connection, { userId, resourceType, resourceId }) {
  const definition = RESOURCE_TABLES[resourceType];
  if (!definition) throw new DailyReviewError('DAILY_REVIEW_RESOURCE_INVALID', 400);
  const [rows] = await connection.query(
    `SELECT id${resourceType === 'bookmark' ? ', url' : ''} FROM ${definition.table}
      WHERE id = ?
        AND ${definition.ownerColumn} = CONVERT(? USING ${definition.ownerCharset}) COLLATE ${definition.ownerCollation}
        AND ${definition.liveCondition}
      LIMIT 1`,
    [resourceId, userId],
  );
  if (!rows?.length) throw new DailyReviewError('DAILY_REVIEW_RESOURCE_UNAVAILABLE', 409);
  if (resourceType === 'bookmark' && !resolveDailyReviewBookmarkUrl(rows[0].url)) {
    throw new DailyReviewError('DAILY_REVIEW_RESOURCE_UNAVAILABLE', 409);
  }
}

async function ensureReasonTagAvailable(connection, { userId, resourceType, resourceId, reasonTagId }) {
  if (!reasonTagId) throw new DailyReviewError('DAILY_REVIEW_REASON_TAG_UNAVAILABLE', 409);
  const [rows] = await connection.query(
    `SELECT t.id
       FROM tag t
       INNER JOIN resource_tag_relations relation
         ON relation.tag_id = t.id
        AND relation.user_id = t.user_id
      WHERE t.id = CONVERT(? USING utf8) COLLATE utf8_general_ci
        AND t.user_id = CONVERT(? USING utf8) COLLATE utf8_general_ci
        AND t.del_flag = 0
        AND relation.resource_type = ? AND relation.resource_id = ?
      LIMIT 1`,
    [reasonTagId, userId, resourceType, resourceId],
  );
  if (!rows?.length) throw new DailyReviewError('DAILY_REVIEW_REASON_TAG_UNAVAILABLE', 409);
}

async function updateCrossDayRecapState(connection, { userId, resourceType, resourceId, action, date }) {
  if (action === 'snooze_7d') {
    await connection.query(
      `INSERT INTO growth_recap_state
         (user_id, resource_type, resource_id, snoozed_until, dismissed_at, last_shown_date)
       VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 7 DAY), NULL, ?)
       ON DUPLICATE KEY UPDATE
         snoozed_until = IF(
           growth_recap_state.dismissed_at IS NULL,
           GREATEST(COALESCE(growth_recap_state.snoozed_until, NOW()), VALUES(snoozed_until)),
           growth_recap_state.snoozed_until
         ),
         last_shown_date = IF(
           growth_recap_state.last_shown_date IS NULL
             OR growth_recap_state.last_shown_date < VALUES(last_shown_date),
           VALUES(last_shown_date),
           growth_recap_state.last_shown_date
         )`,
      [userId, resourceType, resourceId, date],
    );
  }
  if (action === 'dismiss') {
    await connection.query(
      `INSERT INTO growth_recap_state
         (user_id, resource_type, resource_id, snoozed_until, dismissed_at, last_shown_date)
       VALUES (?, ?, ?, NULL, NOW(), ?)
       ON DUPLICATE KEY UPDATE
         snoozed_until = NULL,
         dismissed_at = COALESCE(growth_recap_state.dismissed_at, VALUES(dismissed_at)),
         last_shown_date = IF(
           growth_recap_state.last_shown_date IS NULL
             OR growth_recap_state.last_shown_date < VALUES(last_shown_date),
           VALUES(last_shown_date),
           growth_recap_state.last_shown_date
         )`,
      [userId, resourceType, resourceId, date],
    );
  }
}

async function countLiveItems(connection, { userId, sessionId }) {
  const items = await hydrateItems(connection, userId, sessionId);
  return {
    total: items.length,
    pending: items.filter((item) => item.action === 'pending').length,
  };
}

async function updateCompletionStatus(connection, { userId, sessionId, refreshCompletedAt = false }) {
  const { pending } = await countLiveItems(connection, { userId, sessionId });
  // 该函数只能由已有条目的动作进入；有效资源降到 0 代表原条目失效，应完成而不是伪装成从未生成内容。
  const status = pending === 0 ? 'completed' : 'active';
  if (status !== 'active') {
    await connection.query(
      `UPDATE daily_content_review_sessions
          SET status = ?,
              completed_at = ${status === 'completed' ? (refreshCompletedAt ? 'NOW()' : 'COALESCE(completed_at, NOW())') : 'NULL'},
              skipped_at = NULL
        WHERE id = ? AND user_id = ?`,
      [status, sessionId, userId],
    );
    return status;
  }
  await connection.query(
    `UPDATE daily_content_review_sessions
        SET status = 'active', completed_at = NULL, skipped_at = NULL
      WHERE id = ? AND user_id = ?`,
    [sessionId, userId],
  );
  return 'active';
}

function sessionFromLockedItem(item, status = item.sessionStatus) {
  return {
    id: String(item.sessionId),
    status,
    itemCount: Number(item.sessionItemCount || 0),
    completedAt: status === 'completed' ? item.sessionCompletedAt || null : null,
    skippedAt: status === 'skipped' ? item.sessionSkippedAt || null : null,
    timezoneSnapshot: String(item.sessionTimezone || '').trim() || null,
  };
}

export async function actOnDailyReviewItem(userId, itemId, action, { calendar = null, db = pool } = {}) {
  const ownerId = normalizeUserId(userId);
  const normalizedItemId = String(itemId || '').trim();
  const normalizedAction = String(action || '');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalizedItemId)) {
    throw new DailyReviewError('DAILY_REVIEW_ITEM_REQUIRED', 400);
  }
  if (!DAILY_REVIEW_ITEM_ACTIONS.includes(normalizedAction)) {
    throw new DailyReviewError('DAILY_REVIEW_ACTION_INVALID', 400);
  }
  const storedAction = STORED_ACTION_BY_REQUEST[normalizedAction];
  // 与 ensure 保持同一事务快照边界：账号日历是请求输入，不应让读取偏好提前固定写事务快照。
  const accountCalendar = await resolveCalendar(ownerId, calendar, db);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const date = dateFromCalendar(accountCalendar);
    const item = await findTodayItemForUpdate(connection, {
      itemId: normalizedItemId,
      userId: ownerId,
      date,
    });
    if (!item) throw new DailyReviewError('DAILY_REVIEW_ITEM_NOT_FOUND', 404);
    if (String(item.action) !== 'pending') {
      if (String(item.action) !== storedAction) {
        throw new DailyReviewError('DAILY_REVIEW_ITEM_ALREADY_PROCESSED', 409);
      }
      // 首次成功响应可能丢失；即使另一端随后收起今日卡片，同一动作重试仍返回当前快照。
    } else if (String(item.sessionStatus) === 'skipped') {
      throw new DailyReviewError('DAILY_REVIEW_TODAY_SKIPPED', 409);
    }

    let nextStatus = String(item.sessionStatus || 'active');
    if (String(item.action) === 'pending') {
      const resourceType = String(item.resourceType || '');
      if (!DAILY_REVIEW_RESOURCE_TYPES.includes(resourceType)) {
        throw new DailyReviewError('DAILY_REVIEW_RESOURCE_INVALID', 400);
      }
      await ensureResourceAvailable(connection, {
        userId: ownerId,
        resourceType,
        resourceId: String(item.resourceId || ''),
      });
      if (normalizedAction === 'open_tag_space') {
        if (String(item.reasonCode || '') !== 'active_tag') {
          throw new DailyReviewError('DAILY_REVIEW_REASON_TAG_UNAVAILABLE', 409);
        }
        await ensureReasonTagAvailable(connection, {
          userId: ownerId,
          resourceType,
          resourceId: String(item.resourceId || ''),
          reasonTagId: String(item.reasonTagId || '').trim() || null,
        });
      }
      await updateCrossDayRecapState(connection, {
        userId: ownerId,
        resourceType,
        resourceId: String(item.resourceId || ''),
        action: normalizedAction,
        date,
      });
      const [updateResult] = await connection.query(
        `UPDATE daily_content_review_items
            SET action = ?, acted_at = NOW()
          WHERE id = ? AND user_id = ? AND action = 'pending'`,
        [storedAction, normalizedItemId, ownerId],
      );
      if (!Number(updateResult?.affectedRows || 0)) {
        throw new DailyReviewError('DAILY_REVIEW_ITEM_STATE_CHANGED', 409);
      }
      nextStatus = await updateCompletionStatus(connection, {
        userId: ownerId,
        sessionId: String(item.sessionId),
        // 资源曾失效时会话可能已持久化为 completed；资源恢复后的本次动作属于一次新的
        // active -> completed 转换，不能沿用恢复前的审计时间。
        refreshCompletedAt: String(item.sessionStatus) === 'completed',
      });
    }

    const refreshedSession = await findSession(connection, ownerId, date, { forUpdate: true });
    const review = await hydrateSessionReview(connection, {
      userId: ownerId,
      date,
      timezone:
        (refreshedSession || sessionFromLockedItem(item, nextStatus)).timezoneSnapshot || accountCalendar.timezone,
      session: refreshedSession || sessionFromLockedItem(item, nextStatus),
    });
    await connection.commit();
    return { ok: true, review };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function actOnDailyReviewToday(userId, action, { calendar = null, db = pool } = {}) {
  const ownerId = normalizeUserId(userId);
  const normalizedAction = String(action || '');
  if (!DAILY_REVIEW_SESSION_ACTIONS.includes(normalizedAction)) {
    throw new DailyReviewError('DAILY_REVIEW_SESSION_ACTION_INVALID', 400);
  }
  const accountCalendar = await resolveCalendar(ownerId, calendar, db);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const date = dateFromCalendar(accountCalendar);
    let session = await findSession(connection, ownerId, date, { forUpdate: true });
    if (!session) throw new DailyReviewError('DAILY_REVIEW_SESSION_NOT_FOUND', 404);
    const liveCounts = await countLiveItems(connection, { userId: ownerId, sessionId: session.id });
    const effectiveStatus = deriveLiveSessionStatus(session, liveCounts);

    if (normalizedAction === 'skip_today' && effectiveStatus === 'active') {
      await connection.query(
        `UPDATE daily_content_review_sessions
            SET status = 'skipped', skipped_at = COALESCE(skipped_at, NOW()), completed_at = NULL
          WHERE id = ? AND user_id = ?`,
        [session.id, ownerId],
      );
      session = { ...session, status: 'skipped', completedAt: null };
    }
    if (normalizedAction === 'resume_today' && session.status === 'skipped') {
      const status = deriveLiveSessionStatus({ ...session, status: 'active' }, liveCounts);
      await connection.query(
        `UPDATE daily_content_review_sessions
            SET status = ?,
                completed_at = ${status === 'completed' ? 'COALESCE(completed_at, NOW())' : 'NULL'},
                skipped_at = NULL
          WHERE id = ? AND user_id = ?`,
        [status, session.id, ownerId],
      );
      session = { ...session, status, skippedAt: null };
    }

    const refreshedSession = await findSession(connection, ownerId, date, { forUpdate: true });
    const review = await hydrateSessionReview(connection, {
      userId: ownerId,
      date,
      timezone: (refreshedSession || session).timezoneSnapshot || accountCalendar.timezone,
      session: refreshedSession || session,
    });
    await connection.commit();
    return { ok: true, review };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export { buildReview, HYDRATE_ITEMS_SQL };
