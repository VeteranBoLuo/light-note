import pool from '../../db/index.js';
import { generateUUID } from '../agent/data.js';
import { createNotification } from '../notification.js';

export const FEATURE_REQUEST_CATEGORIES = Object.freeze([
  'bookmark',
  'note',
  'cloud',
  'tag',
  'ai',
  'experience',
  'other',
]);
export const FEATURE_MODERATION_STATUSES = Object.freeze([
  'pending_review',
  'published',
  'rejected',
  'merged',
  'hidden',
]);
export const FEATURE_PROGRESS_STATUSES = Object.freeze([
  'evaluating',
  'planned',
  'in_progress',
  'released',
  'declined',
]);

const categorySet = new Set(FEATURE_REQUEST_CATEGORIES);
const moderationSet = new Set(FEATURE_MODERATION_STATUSES);
const progressSet = new Set(FEATURE_PROGRESS_STATUSES);
const publicSortSql = Object.freeze({
  updated: 'fr.update_time DESC',
  newest: 'fr.create_time DESC',
  popular: 'fr.vote_count DESC, fr.update_time DESC',
});

export class FeatureRequestError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

const cleanText = (value, maxLength) =>
  String(value || '')
    .trim()
    .slice(0, maxLength);
const pageParams = (input = {}) => {
  const currentPage = Math.max(1, Math.floor(Number(input.currentPage) || 1));
  const pageSize = Math.min(40, Math.max(1, Math.floor(Number(input.pageSize) || 12)));
  return { currentPage, pageSize, offset: (currentPage - 1) * pageSize };
};

function validateDraft(input = {}) {
  const title = cleanText(input.title, 160);
  const content = cleanText(input.content, 6000);
  const category = categorySet.has(input.category) ? input.category : 'other';
  if (title.length < 4) throw new FeatureRequestError('TITLE_TOO_SHORT', '建议标题至少需要 4 个字符');
  if (content.length < 10) throw new FeatureRequestError('CONTENT_TOO_SHORT', '请补充使用场景和期望效果');
  return { title, content, category, showIdentity: input.showIdentity !== false };
}

const requestSelect = (viewerUserId = '', includePrivateIdentity = false) => ({
  sql: `
    SELECT fr.id,fr.title,fr.content,fr.category,fr.source_type,fr.show_identity,
           fr.moderation_status,fr.progress_status,fr.merged_to_id,fr.developer_reply,
           fr.release_url,fr.vote_count,fr.published_at,fr.released_at,fr.create_time,fr.update_time,
           CASE WHEN fr.source_type = 'user' AND fr.show_identity = 1 THEN COALESCE(u.alias, '轻笺用户') ELSE NULL END AS submitter_alias,
           CASE WHEN fr.source_type = 'user' AND fr.show_identity = 1 THEN u.head_picture ELSE NULL END AS submitter_avatar,
           ${includePrivateIdentity ? 'u.alias AS owner_alias, u.head_picture AS owner_avatar,' : ''}
           (fr.submitter_user_id = ?) AS viewer_is_owner,
           EXISTS(
             SELECT 1 FROM feature_request_votes fv
             WHERE fv.request_id = fr.id AND fv.user_id = ?
           ) AS viewer_voted
      FROM feature_requests fr
      LEFT JOIN user u ON u.id = fr.submitter_user_id
  `,
  params: [viewerUserId || '', viewerUserId || ''],
});

export async function createFeatureRequest({ userId, input, sourceType = 'user', db = pool }) {
  const draft = validateDraft(input);
  const normalizedSourceType = sourceType === 'official' ? 'official' : 'user';
  const id = generateUUID();
  const updateId = generateUUID();
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const isOfficial = normalizedSourceType === 'official';
    await connection.query(
      `INSERT INTO feature_requests
        (id,title,content,category,source_type,submitter_user_id,show_identity,moderation_status,progress_status,published_at)
       VALUES (?,?,?,?,?,?,?, ?, 'evaluating', CASE WHEN ? = 'published' THEN NOW() ELSE NULL END)`,
      [
        id,
        draft.title,
        draft.content,
        draft.category,
        normalizedSourceType,
        userId,
        isOfficial ? 0 : draft.showIdentity ? 1 : 0,
        isOfficial ? 'published' : 'pending_review',
        isOfficial ? 'published' : 'pending_review',
      ],
    );
    await connection.query(
      `INSERT INTO feature_request_updates
        (id,request_id,type,content,actor_user_id,create_time)
       VALUES (?,?,?,?,?,NOW())`,
      [
        updateId,
        id,
        isOfficial ? 'official_created' : 'submitted',
        isOfficial ? '轻笺团队发布了官方规划' : '建议已提交，等待审核',
        userId,
      ],
    );
    await connection.commit();
    return {
      id,
      ...draft,
      sourceType: normalizedSourceType,
      moderationStatus: isOfficial ? 'published' : 'pending_review',
      progressStatus: 'evaluating',
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listPublicFeatureRequests({ viewerUserId = '', filters = {}, pagination = {}, db = pool }) {
  const { currentPage, pageSize, offset } = pageParams(pagination);
  const progressStatus = progressSet.has(filters.progressStatus) ? filters.progressStatus : '';
  const category = categorySet.has(filters.category) ? filters.category : '';
  const keyword = cleanText(filters.keyword, 100);
  const sort = publicSortSql[filters.sort] ? filters.sort : 'updated';
  const where = ['fr.del_flag = 0', "fr.moderation_status = 'published'"];
  const params = [];
  if (progressStatus) {
    where.push('fr.progress_status = ?');
    params.push(progressStatus);
  }
  if (category) {
    where.push('fr.category = ?');
    params.push(category);
  }
  if (keyword) {
    where.push('(fr.title LIKE ? OR fr.content LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`);
  }
  const selected = requestSelect(viewerUserId);
  const [rows] = await db.query(
    `${selected.sql} WHERE ${where.join(' AND ')} ORDER BY ${publicSortSql[sort]} LIMIT ? OFFSET ?`,
    [...selected.params, ...params, pageSize, offset],
  );
  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total FROM feature_requests fr WHERE ${where.join(' AND ')}`,
    params,
  );
  const [summaryRows] = await db.query(
    `SELECT progress_status, COUNT(*) AS total
       FROM feature_requests
      WHERE del_flag = 0 AND moderation_status = 'published'
      GROUP BY progress_status`,
  );
  const summary = Object.fromEntries(FEATURE_PROGRESS_STATUSES.map((status) => [status, 0]));
  for (const row of summaryRows) summary[row.progress_status] = Number(row.total || 0);
  return {
    items: rows,
    total: Number(countRow?.total || 0),
    summary,
    currentPage,
    pageSize,
  };
}

export async function listMyFeatureRequests({ userId, pagination = {}, db = pool }) {
  const { currentPage, pageSize, offset } = pageParams(pagination);
  const selected = requestSelect(userId);
  const [rows] = await db.query(
    `${selected.sql}
      WHERE fr.del_flag = 0 AND fr.submitter_user_id = ?
      ORDER BY fr.create_time DESC LIMIT ? OFFSET ?`,
    [...selected.params, userId, pageSize, offset],
  );
  const [[countRow]] = await db.query(
    'SELECT COUNT(*) AS total FROM feature_requests WHERE del_flag = 0 AND submitter_user_id = ?',
    [userId],
  );
  return { items: rows, total: Number(countRow?.total || 0), currentPage, pageSize };
}

export async function listAdminFeatureRequests({ filters = {}, pagination = {}, db = pool }) {
  const { currentPage, pageSize, offset } = pageParams(pagination);
  const moderationStatus = moderationSet.has(filters.moderationStatus) ? filters.moderationStatus : '';
  const progressStatus = progressSet.has(filters.progressStatus) ? filters.progressStatus : '';
  const keyword = cleanText(filters.keyword, 100);
  const where = ['fr.del_flag = 0'];
  const params = [];
  if (moderationStatus) {
    where.push('fr.moderation_status = ?');
    params.push(moderationStatus);
  }
  if (progressStatus) {
    where.push('fr.progress_status = ?');
    params.push(progressStatus);
  }
  if (keyword) {
    where.push('(fr.title LIKE ? OR fr.content LIKE ? OR u.alias LIKE ?)');
    params.push(`%${keyword}%`, `%${keyword}%`, `%${keyword}%`);
  }
  const selected = requestSelect('', true);
  const [rows] = await db.query(
    `${selected.sql} WHERE ${where.join(' AND ')} ORDER BY fr.update_time DESC LIMIT ? OFFSET ?`,
    [...selected.params, ...params, pageSize, offset],
  );
  const [[countRow]] = await db.query(
    `SELECT COUNT(*) AS total
       FROM feature_requests fr LEFT JOIN user u ON u.id = fr.submitter_user_id
      WHERE ${where.join(' AND ')}`,
    params,
  );
  return { items: rows, total: Number(countRow?.total || 0), currentPage, pageSize };
}

export async function getFeatureRequestDetail({ id, viewerUserId = '', viewerRole = 'visitor', db = pool }) {
  const selected = requestSelect(viewerUserId, viewerRole === 'root');
  const [rows] = await db.query(
    `${selected.sql}
      WHERE fr.id = ? AND fr.del_flag = 0
        AND (fr.moderation_status IN ('published','merged') OR fr.submitter_user_id = ? OR ? = 'root')
      LIMIT 1`,
    [...selected.params, id, viewerUserId || '', viewerRole],
  );
  const request = rows[0];
  if (!request) throw new FeatureRequestError('NOT_FOUND', '建议不存在或尚未公开', 404);
  const [updates] = await db.query(
    `SELECT fu.id,fu.type,fu.content,fu.from_status,fu.to_status,fu.create_time,
            CASE WHEN u.role = 'root' THEN 'developer' ELSE 'submitter' END AS actor_type
       FROM feature_request_updates fu
       LEFT JOIN user u ON u.id = fu.actor_user_id
      WHERE fu.request_id = ? ORDER BY fu.create_time ASC`,
    [id],
  );
  let mergedTo = null;
  if (request.merged_to_id) {
    const [[target]] = await db.query(
      `SELECT id,title FROM feature_requests
        WHERE id = ? AND del_flag = 0 AND moderation_status IN ('published','merged') LIMIT 1`,
      [request.merged_to_id],
    );
    mergedTo = target || null;
  }
  return { ...request, updates, mergedTo };
}

export async function toggleFeatureRequestVote({ requestId, userId, db = pool }) {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query(
      `SELECT id FROM feature_requests
        WHERE id = ? AND del_flag = 0 AND moderation_status = 'published' FOR UPDATE`,
      [requestId],
    );
    if (!request) throw new FeatureRequestError('NOT_FOUND', '公开建议不存在', 404);
    const [[existing]] = await connection.query(
      'SELECT 1 AS voted FROM feature_request_votes WHERE request_id = ? AND user_id = ? LIMIT 1',
      [requestId, userId],
    );
    let voted;
    if (existing) {
      await connection.query('DELETE FROM feature_request_votes WHERE request_id = ? AND user_id = ?', [
        requestId,
        userId,
      ]);
      voted = false;
    } else {
      await connection.query('INSERT INTO feature_request_votes (request_id,user_id,create_time) VALUES (?,?,NOW())', [
        requestId,
        userId,
      ]);
      voted = true;
    }
    const [[countRow]] = await connection.query(
      'SELECT COUNT(*) AS total FROM feature_request_votes WHERE request_id = ?',
      [requestId],
    );
    const voteCount = Number(countRow?.total || 0);
    await connection.query('UPDATE feature_requests SET vote_count = ?, update_time = update_time WHERE id = ?', [
      voteCount,
      requestId,
    ]);
    await connection.commit();
    return { voted, voteCount };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function addSubmitterFeatureUpdate({ requestId, userId, content, db = pool }) {
  const text = cleanText(content, 2000);
  if (text.length < 2) throw new FeatureRequestError('CONTENT_REQUIRED', '补充内容不能为空');
  const [[request]] = await db.query(
    `SELECT id FROM feature_requests
      WHERE id = ? AND submitter_user_id = ? AND del_flag = 0
        AND moderation_status IN ('pending_review','published') LIMIT 1`,
    [requestId, userId],
  );
  if (!request) throw new FeatureRequestError('FORBIDDEN', '当前建议不可补充', 403);
  await db.query(
    `INSERT INTO feature_request_updates
      (id,request_id,type,content,actor_user_id,create_time)
     VALUES (?,?,'submitter_addition',?,?,NOW())`,
    [generateUUID(), requestId, text, userId],
  );
  await db.query('UPDATE feature_requests SET update_time = NOW() WHERE id = ?', [requestId]);
  return { requestId, content: text };
}

async function addTimeline(connection, { requestId, type, content, fromStatus = null, toStatus = null, actorUserId }) {
  await connection.query(
    `INSERT INTO feature_request_updates
      (id,request_id,type,content,from_status,to_status,actor_user_id,create_time)
     VALUES (?,?,?,?,?,?,?,NOW())`,
    [generateUUID(), requestId, type, content || null, fromStatus, toStatus, actorUserId || null],
  );
}

export async function adminReviewFeatureRequest({ requestId, moderationStatus, reply = '', actorUserId, db = pool }) {
  if (!['published', 'rejected', 'hidden'].includes(moderationStatus)) {
    throw new FeatureRequestError('INVALID_STATUS', '无效的审核状态');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query(
      'SELECT * FROM feature_requests WHERE id = ? AND del_flag = 0 FOR UPDATE',
      [requestId],
    );
    if (!request) throw new FeatureRequestError('NOT_FOUND', '建议不存在', 404);
    const replyText = cleanText(reply, 4000);
    await connection.query(
      `UPDATE feature_requests
          SET moderation_status = ?,
              developer_reply = CASE WHEN ? <> '' THEN ? ELSE developer_reply END,
              published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at,NOW()) ELSE published_at END,
              update_time = NOW()
        WHERE id = ?`,
      [moderationStatus, replyText, replyText, moderationStatus, requestId],
    );
    await addTimeline(connection, {
      requestId,
      type: 'moderation',
      content: replyText,
      fromStatus: request.moderation_status,
      toStatus: moderationStatus,
      actorUserId,
    });
    await connection.commit();
    return { requestId, moderationStatus, previousStatus: request.moderation_status };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function adminReplyFeatureRequest({ requestId, content, actorUserId, db = pool }) {
  const text = cleanText(content, 4000);
  if (!text) throw new FeatureRequestError('CONTENT_REQUIRED', '回复内容不能为空');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query(
      'SELECT id FROM feature_requests WHERE id = ? AND del_flag = 0 FOR UPDATE',
      [requestId],
    );
    if (!request) throw new FeatureRequestError('NOT_FOUND', '建议不存在', 404);
    await connection.query('UPDATE feature_requests SET developer_reply = ?, update_time = NOW() WHERE id = ?', [
      text,
      requestId,
    ]);
    await addTimeline(connection, { requestId, type: 'developer_reply', content: text, actorUserId });
    await connection.commit();
    return { requestId, content: text };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function adminUpdateFeatureProgress({
  requestId,
  progressStatus,
  releaseUrl = '',
  actorUserId,
  db = pool,
}) {
  if (!progressSet.has(progressStatus)) throw new FeatureRequestError('INVALID_STATUS', '无效的产品进度');
  const safeReleaseUrl = cleanText(releaseUrl, 500);
  if (safeReleaseUrl && !/^https?:\/\//i.test(safeReleaseUrl) && !safeReleaseUrl.startsWith('/')) {
    throw new FeatureRequestError('INVALID_RELEASE_URL', '更新日志链接格式不正确');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[request]] = await connection.query(
      `SELECT id,progress_status FROM feature_requests
        WHERE id = ? AND del_flag = 0 AND moderation_status = 'published' FOR UPDATE`,
      [requestId],
    );
    if (!request) throw new FeatureRequestError('NOT_FOUND', '公开建议不存在', 404);
    await connection.query(
      `UPDATE feature_requests
          SET progress_status = ?,
              release_url = CASE WHEN ? <> '' THEN ? ELSE release_url END,
              released_at = CASE WHEN ? = 'released' THEN COALESCE(released_at,NOW()) ELSE released_at END,
              update_time = NOW()
        WHERE id = ?`,
      [progressStatus, safeReleaseUrl, safeReleaseUrl, progressStatus, requestId],
    );
    await addTimeline(connection, {
      requestId,
      type: progressStatus === 'released' ? 'release' : 'status_change',
      content: safeReleaseUrl,
      fromStatus: request.progress_status,
      toStatus: progressStatus,
      actorUserId,
    });
    await connection.commit();
    return { requestId, progressStatus, previousStatus: request.progress_status, releaseUrl: safeReleaseUrl };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function adminDeleteFeatureRequestUpdate({ requestId, updateId, db = pool }) {
  const safeRequestId = cleanText(requestId, 64);
  const safeUpdateId = cleanText(updateId, 64);
  if (!safeRequestId || !safeUpdateId) {
    throw new FeatureRequestError('INVALID_UPDATE', '请选择要删除的进度记录');
  }

  const [[update]] = await db.query(
    `SELECT fu.id,fu.type
       FROM feature_request_updates fu
       JOIN feature_requests fr ON fr.id = fu.request_id
      WHERE fu.id = ? AND fu.request_id = ? AND fr.del_flag = 0
      LIMIT 1`,
    [safeUpdateId, safeRequestId],
  );
  if (!update) throw new FeatureRequestError('UPDATE_NOT_FOUND', '进度记录不存在', 404);
  if (['submitted', 'official_created'].includes(update.type)) {
    throw new FeatureRequestError('PROTECTED_UPDATE', '首次提交记录不能删除', 409);
  }

  const [result] = await db.query('DELETE FROM feature_request_updates WHERE id = ? AND request_id = ?', [
    safeUpdateId,
    safeRequestId,
  ]);
  if (!result?.affectedRows) throw new FeatureRequestError('UPDATE_NOT_FOUND', '进度记录不存在', 404);
  return { requestId: safeRequestId, updateId: safeUpdateId, type: update.type };
}

export async function adminMergeFeatureRequest({ requestId, targetRequestId, content = '', actorUserId, db = pool }) {
  if (!requestId || !targetRequestId || requestId === targetRequestId) {
    throw new FeatureRequestError('INVALID_TARGET', '请选择另一条公开建议作为合并目标');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [rows] = await connection.query(
      `SELECT id,moderation_status FROM feature_requests
        WHERE id IN (?,?) AND del_flag = 0 FOR UPDATE`,
      [requestId, targetRequestId],
    );
    const source = rows.find((row) => row.id === requestId);
    const target = rows.find((row) => row.id === targetRequestId);
    if (!source || !target || target.moderation_status !== 'published') {
      throw new FeatureRequestError('INVALID_TARGET', '合并目标必须是已公开建议', 400);
    }
    await connection.query(
      `UPDATE feature_requests
          SET moderation_status = 'merged', merged_to_id = ?, update_time = NOW()
        WHERE id = ?`,
      [targetRequestId, requestId],
    );
    await addTimeline(connection, {
      requestId,
      type: 'merged',
      content: cleanText(content, 2000),
      fromStatus: source.moderation_status,
      toStatus: 'merged',
      actorUserId,
    });
    await connection.commit();
    return { requestId, targetRequestId };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function adminEditFeatureRequest({ requestId, input, actorUserId, db = pool }) {
  const draft = validateDraft(input);
  const [[request]] = await db.query('SELECT id FROM feature_requests WHERE id = ? AND del_flag = 0 LIMIT 1', [
    requestId,
  ]);
  if (!request) throw new FeatureRequestError('NOT_FOUND', '建议不存在', 404);
  await db.query(
    `UPDATE feature_requests
        SET title = ?, content = ?, category = ?, show_identity = ?, update_time = NOW()
      WHERE id = ?`,
    [draft.title, draft.content, draft.category, draft.showIdentity ? 1 : 0, requestId],
  );
  await db.query(
    `INSERT INTO feature_request_updates
      (id,request_id,type,content,actor_user_id,create_time)
     VALUES (?,?,'admin_edit',?,?,NOW())`,
    [generateUUID(), requestId, '开发者调整了公开描述', actorUserId],
  );
  return { requestId, ...draft };
}

const notificationCopy = (event, lang, data = {}) => {
  const en = lang === 'en-US';
  const map = {
    published: en
      ? ['Your suggestion is now public', 'The suggestion has passed review and is now visible on Co-build Light Note.']
      : ['你的建议已公开', '建议已通过审核，现在可以在“共建轻笺”中查看。'],
    reply: en
      ? ['Developer replied to a suggestion', cleanText(data.content, 240)]
      : ['开发者回复了建议', cleanText(data.content, 240)],
    merged: en
      ? ['Suggestion merged', 'This suggestion was merged into a related public request.']
      : ['建议已合并', '这条建议已合并到相关的公开需求中。'],
    planned: en
      ? ['Suggestion is now planned', 'The suggestion has entered the product plan.']
      : ['建议已进入计划', '这条建议已进入产品计划。'],
    in_progress: en
      ? ['Suggestion is in development', 'Development or verification has started.']
      : ['建议正在开发', '这条建议已经开始开发或验证。'],
    released: en
      ? ['Suggested feature released', 'The requested feature is now available.']
      : ['建议功能已上线', '你关注的建议已经上线。'],
    declined: en
      ? ['Suggestion status updated', 'The suggestion is not planned for now.']
      : ['建议状态已更新', '这条建议当前暂不考虑，详情中可以查看说明。'],
    rejected: en
      ? [
          'Suggestion review completed',
          'This suggestion was not published. You can review its status in My suggestions.',
        ]
      : ['建议审核完成', '这条建议暂未公开，你可以在“我的建议”中查看状态。'],
    hidden: en
      ? ['Suggestion visibility updated', 'This suggestion is no longer publicly visible.']
      : ['建议展示状态已更新', '这条建议暂时不再公开展示。'],
    evaluating: en
      ? ['Suggestion is being evaluated', 'The suggestion returned to evaluation.']
      : ['建议正在评估', '这条建议已进入评估状态。'],
  };
  return map[event] || map.evaluating;
};

export async function notifyFeatureRequestFollowers({ requestId, event, content = '', excludeUserId = '', db = pool }) {
  try {
    const [users] = await db.query(
      `SELECT DISTINCT u.id,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.lang')), 'zh-CN') AS lang,
              COALESCE(JSON_UNQUOTE(JSON_EXTRACT(u.preferences, '$.notifyFeatureRequest')), 'true') AS notify_pref
         FROM user u
         JOIN (
           SELECT submitter_user_id AS user_id FROM feature_requests WHERE id = ?
           UNION
           SELECT user_id FROM feature_request_votes WHERE request_id = ?
         ) followers ON followers.user_id = u.id
        WHERE u.del_flag = 0`,
      [requestId, requestId],
    );
    await Promise.all(
      users
        .filter((item) => item.id !== excludeUserId && item.notify_pref !== 'false')
        .map((item) => {
          const [title, notificationContent] = notificationCopy(event, item.lang, { content });
          return createNotification(item.id, {
            type: 'feature_request',
            title,
            content: notificationContent,
            link: `/co-build/${requestId}`,
            meta: { requestId, event },
          });
        }),
    );
  } catch (error) {
    console.error('[共建轻笺] 写入状态通知失败:', error.message);
  }
}
