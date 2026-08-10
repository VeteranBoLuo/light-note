import pool from '../../db/index.js';
import { generateUUID } from '../agent/data.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG, getCommunityChatFeatureState } from '../communityChatFeature.js';
import { publishCommunityChatRealtimeEvent } from '../communityChat/realtimeBroker.js';

export class CommunityChatError extends Error {
  constructor(code, status, zhMessage, enMessage) {
    super(zhMessage);
    this.name = 'CommunityChatError';
    this.code = code;
    this.status = status;
    this.zhMessage = zhMessage;
    this.enMessage = enMessage || zhMessage;
  }
}

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

const isRegistered = (user) => Boolean(user?.id && user?.role && user.role !== 'visitor');
const COMMUNITY_CHAT_RUNTIME_POLICY_ID = 1;
const COMMUNITY_CHAT_NOTIFICATION_LEVELS = new Set(['official', 'mentions_only', 'mentions', 'all']);
const COMMUNITY_CHAT_DEFAULT_NOTIFICATION_LEVEL = 'mentions';

function normalizeCommunityChatNotificationLevel(value) {
  const normalized = String(value || '').trim();
  return COMMUNITY_CHAT_NOTIFICATION_LEVELS.has(normalized) ? normalized : COMMUNITY_CHAT_DEFAULT_NOTIFICATION_LEVEL;
}

function applyCommunityChatNotificationSettings(access, settings, defaultEnabled) {
  access.notificationsEnabled = settings
    ? Boolean(Number(settings.notificationsEnabled || 0))
    : Boolean(defaultEnabled);
  access.notificationLevel = normalizeCommunityChatNotificationLevel(settings?.defaultRoomLevel);
}

function normalizeText(value, maxLength, fieldName) {
  const text = String(value || '').trim();
  if (Array.from(text).length > maxLength) {
    throw chatError(
      'INVALID_INPUT',
      400,
      `${fieldName}不能超过 ${maxLength} 个字符`,
      `${fieldName} must not exceed ${maxLength} characters`,
    );
  }
  return text;
}

async function queryFirst(db, sql, params) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

function resolveRuntimePolicy(feature, row = null) {
  const databasePostingEnabled = Boolean(Number(row?.postingEnabled || 0));
  const environmentReadOnly = Boolean(feature.emergencyReadOnly);
  const postingEnabled = Boolean(feature.messagingEnabled && databasePostingEnabled && !environmentReadOnly);
  return {
    messagingEnabled: feature.messagingEnabled,
    postingEnabled,
    databasePostingEnabled,
    emergencyReadOnly: Boolean(feature.messagingEnabled && !postingEnabled),
    environmentReadOnly,
    updatedAt: row?.updatedAt || null,
  };
}

export async function getCommunityChatRuntimePolicy({ env = process.env, db = pool, lock = false } = {}) {
  const feature = getCommunityChatFeatureState(env);
  const row = await queryFirst(
    db,
    `SELECT posting_enabled AS postingEnabled, update_time AS updatedAt
       FROM community_chat_runtime_policy
      WHERE id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [COMMUNITY_CHAT_RUNTIME_POLICY_ID],
  );
  return resolveRuntimePolicy(feature, row);
}

function baseAccess(feature, user, runtimePolicy) {
  return {
    accessMode: feature.accessMode,
    waitlistEnabled: feature.waitlistEnabled,
    messagingEnabled: feature.messagingEnabled,
    realtimeEnabled: feature.realtimeEnabled,
    postingEnabled: runtimePolicy.postingEnabled,
    emergencyReadOnly: runtimePolicy.emergencyReadOnly,
    environmentReadOnly: runtimePolicy.environmentReadOnly,
    notificationsDefaultEnabled: feature.notificationsDefaultEnabled,
    rulesVersion: feature.rulesVersion,
    authenticated: isRegistered(user),
    canManage: user?.role === 'root',
    canRead: false,
    canPost: false,
    canEnter: false,
    canRequest: false,
    canAcceptRules: false,
    status: 'closed',
    requestStatus: null,
    memberRole: null,
    notificationsEnabled: Boolean(isRegistered(user) && feature.notificationsDefaultEnabled),
    notificationLevel: COMMUNITY_CHAT_DEFAULT_NOTIFICATION_LEVEL,
  };
}

async function loadPublicAccessRows(db, userId) {
  const [member, settings] = await Promise.all([
    queryFirst(
      db,
      `SELECT role, status, rules_version AS rulesVersion, rules_accepted_at AS rulesAcceptedAt
         FROM community_chat_members
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    ),
    queryFirst(
      db,
      `SELECT global_notification_enabled AS notificationsEnabled,
              default_room_level AS defaultRoomLevel
         FROM community_chat_user_settings
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    ),
  ]);
  return { member, settings };
}

async function loadNotificationSettings(db, userId) {
  return queryFirst(
    db,
    `SELECT global_notification_enabled AS notificationsEnabled,
            default_room_level AS defaultRoomLevel
       FROM community_chat_user_settings
      WHERE user_id = ?
      LIMIT 1`,
    [userId],
  );
}

async function loadUserAccessRows(db, userId, includeMembership) {
  const requestPromise = queryFirst(
    db,
    `SELECT id, status, reviewed_at AS reviewedAt, create_time AS createTime, update_time AS updateTime
       FROM community_chat_access_requests
      WHERE user_id = ?
      LIMIT 1`,
    [userId],
  );
  if (!includeMembership) return { request: await requestPromise, member: null, settings: null };

  const [request, member, settings] = await Promise.all([
    requestPromise,
    queryFirst(
      db,
      `SELECT role, status, rules_version AS rulesVersion, rules_accepted_at AS rulesAcceptedAt,
              joined_at AS joinedAt, revoked_at AS revokedAt
         FROM community_chat_members
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    ),
    queryFirst(
      db,
      `SELECT global_notification_enabled AS notificationsEnabled,
              browser_notification_enabled AS browserNotificationsEnabled,
              android_notification_enabled AS androidNotificationsEnabled,
              lock_screen_preview AS lockScreenPreview,
              default_room_level AS defaultRoomLevel
         FROM community_chat_user_settings
        WHERE user_id = ?
        LIMIT 1`,
      [userId],
    ),
  ]);
  return { request, member, settings };
}

export async function getCommunityChatAccess({ user, env = process.env, db = pool }) {
  const feature = getCommunityChatFeatureState(env);
  const runtimePolicy = feature.messagingEnabled
    ? await getCommunityChatRuntimePolicy({ env, db })
    : resolveRuntimePolicy(feature);
  const access = baseAccess(feature, user, runtimePolicy);

  if (feature.accessMode === 'public') {
    if (!access.authenticated) {
      return {
        ...access,
        status: 'read_only',
        canRead: feature.messagingEnabled,
        canEnter: feature.messagingEnabled,
      };
    }
    const { member, settings } = await loadPublicAccessRows(db, user.id);
    applyCommunityChatNotificationSettings(access, settings, feature.notificationsDefaultEnabled);
    if (access.canManage) {
      return {
        ...access,
        status: 'active',
        canRead: feature.messagingEnabled,
        canPost: access.postingEnabled,
        canEnter: feature.messagingEnabled,
        memberRole: 'admin',
      };
    }

    if (member?.status === 'banned') {
      access.status = 'restricted';
      return access;
    }
    access.status = 'active';
    access.canRead = feature.messagingEnabled;
    access.canPost = access.postingEnabled;
    access.canEnter = feature.messagingEnabled;
    access.memberRole = member?.status === 'active' && member?.role === 'moderator' ? 'moderator' : 'member';
    return access;
  }

  if (!access.authenticated) {
    access.status = 'login_required';
    return access;
  }

  if (access.canManage && feature.accessMode === 'invite_only') {
    const settings = await loadNotificationSettings(db, user.id);
    applyCommunityChatNotificationSettings(access, settings, feature.notificationsDefaultEnabled);
    return {
      ...access,
      status: 'active',
      canRead: true,
      canPost: access.postingEnabled,
      canEnter: true,
      memberRole: 'admin',
    };
  }

  const shouldReadRows = feature.accessMode === 'invite_only' || feature.waitlistEnabled;
  if (!shouldReadRows) return access;

  const { request, member, settings } = await loadUserAccessRows(db, user.id, feature.accessMode === 'invite_only');
  access.requestStatus = request?.status || null;

  if (feature.accessMode === 'closed') {
    if (request?.status === 'pending') access.status = 'requested';
    access.canRequest = feature.waitlistEnabled && request?.status !== 'pending';
    return access;
  }

  access.memberRole = member?.role || null;
  applyCommunityChatNotificationSettings(access, settings, feature.notificationsDefaultEnabled);

  if (member?.status === 'revoked' || member?.status === 'banned') {
    access.status = 'restricted';
    return access;
  }

  if (member?.status === 'invited' || (member?.status === 'active' && member.rulesVersion !== feature.rulesVersion)) {
    access.status = 'rules_required';
    access.canAcceptRules = true;
    return access;
  }

  if (member?.status === 'active' && member.rulesVersion === feature.rulesVersion) {
    access.status = 'active';
    access.canRead = true;
    access.canPost = access.postingEnabled;
    access.canEnter = true;
    return access;
  }

  if (request?.status === 'pending') {
    access.status = 'requested';
    return access;
  }

  access.status = 'not_invited';
  access.canRequest = feature.waitlistEnabled;
  return access;
}

/**
 * 消息写边界独立复核开关、登录态、成员限制和禁言；邀请制模式额外复核邀请与规则版本。
 * 写操作可传 lock=true，让复核与消息落库处于同一事务，避免处罚状态与发言竞态。
 */
export async function assertCommunityChatMessagingAccess({ user, env = process.env, db = pool, lock = false }) {
  const feature = getCommunityChatFeatureState(env);
  if (!isRegistered(user)) {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
  if (!feature.messagingEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGING_CLOSED',
      403,
      '聊天室消息试点当前未开放',
      'The community messaging pilot is currently closed',
    );
  }
  if (user.role === 'root') return { feature, memberRole: 'admin' };

  const [rows] = await db.query(
    `SELECT role, status, rules_version AS rulesVersion
       FROM community_chat_members
      WHERE user_id = ?
      LIMIT 1${lock ? ' FOR UPDATE' : ''}`,
    [user.id],
  );
  const member = rows[0];
  if (member?.status === 'banned' || (feature.accessMode === 'invite_only' && member?.status === 'revoked')) {
    throw chatError('COMMUNITY_CHAT_RESTRICTED', 403, '当前账号的社区访问已受限', 'Community access is restricted');
  }
  if (feature.accessMode === 'public') {
    return {
      feature,
      memberRole: member?.status === 'active' && member?.role === 'moderator' ? 'moderator' : 'member',
    };
  }
  if (member?.status !== 'active') {
    throw chatError('INVITE_REQUIRED', 403, '当前账号尚未获得聊天室邀请', 'This account has not been invited');
  }
  if (member.rulesVersion !== feature.rulesVersion) {
    throw chatError(
      'COMMUNITY_CHAT_RULES_REQUIRED',
      409,
      '社区规则已经更新，请先重新确认',
      'The community rules changed. Review and accept them again.',
    );
  }
  return { feature, memberRole: member.role || 'member' };
}

/**
 * 紧急只读阻断新增公开内容及互动（新消息、点赞、图片上传），但不阻断撤回、历史阅读、举报、屏蔽和已读位置。
 * 消息落库事务必须以 lock=true 再次读取该单行策略，避免 Root 切换与发送并发穿透。
 */
export async function assertCommunityChatPostingEnabled({ env = process.env, db = pool, lock = false } = {}) {
  const runtimePolicy = await getCommunityChatRuntimePolicy({ env, db, lock });
  if (!runtimePolicy.postingEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_EMERGENCY_READ_ONLY',
      423,
      '聊天室当前处于紧急只读状态，请稍后再发言',
      'Community chat is temporarily read-only. Please try posting later.',
    );
  }
  return runtimePolicy;
}

/**
 * 公共频道允许游客只读；发言、已读位置、举报和屏蔽仍走登录态写权限。
 * 邀请制模式继续复用严格消息权限，避免未来私密频道被公开读取。
 */
export async function assertCommunityChatReadAccess({ user, env = process.env, db = pool }) {
  const feature = getCommunityChatFeatureState(env);
  if (!feature.messagingEnabled) {
    throw chatError(
      'COMMUNITY_CHAT_MESSAGING_CLOSED',
      403,
      '聊天室当前正在维护',
      'Community chat is currently under maintenance',
    );
  }
  if (feature.accessMode !== 'public') {
    return assertCommunityChatMessagingAccess({ user, env, db });
  }
  if (!isRegistered(user) || user.role === 'root') {
    return { feature, memberRole: user?.role === 'root' ? 'admin' : 'visitor' };
  }
  const member = await queryFirst(db, `SELECT role, status FROM community_chat_members WHERE user_id = ? LIMIT 1`, [
    user.id,
  ]);
  if (member?.status === 'banned') {
    throw chatError('COMMUNITY_CHAT_RESTRICTED', 403, '当前账号的社区访问已受限', 'Community access is restricted');
  }
  return {
    feature,
    memberRole: member?.status === 'active' && member?.role === 'moderator' ? 'moderator' : 'member',
  };
}

export async function requestCommunityChatAccess({ user, message = '', env = process.env, db = pool }) {
  const feature = getCommunityChatFeatureState(env);
  if (!isRegistered(user)) {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
  if (!feature.waitlistEnabled) {
    throw chatError('WAITLIST_CLOSED', 403, '聊天室内测申请暂未开放', 'The chat pilot waitlist is not open yet');
  }

  const requestMessage = normalizeText(message, 500, '申请说明');
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [memberRows] = await connection.query(
      `SELECT status FROM community_chat_members WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [user.id],
    );
    if (memberRows[0] && ['invited', 'active'].includes(memberRows[0].status)) {
      throw chatError('ALREADY_INVITED', 409, '你已经获得聊天室访问资格', 'You already have chat access');
    }

    const [requestRows] = await connection.query(
      `SELECT id, status FROM community_chat_access_requests WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [user.id],
    );
    const existing = requestRows[0];
    if (existing?.status === 'pending') {
      await connection.commit();
      return { id: existing.id, status: 'pending', alreadyPending: true };
    }

    const requestId = existing?.id || generateUUID();
    if (existing) {
      await connection.query(
        `UPDATE community_chat_access_requests
            SET status = 'pending', request_message = ?, reviewed_by = NULL, review_note = '', reviewed_at = NULL
          WHERE id = ?`,
        [requestMessage, requestId],
      );
    } else {
      await connection.query(
        `INSERT INTO community_chat_access_requests (id, user_id, status, request_message)
         VALUES (?, ?, 'pending', ?)`,
        [requestId, user.id, requestMessage],
      );
    }
    await connection.query(
      `INSERT INTO community_chat_access_audit (actor_user_id, target_user_id, action, reason)
       VALUES (?, ?, 'access_requested', '')`,
      [user.id, user.id],
    );
    await connection.commit();
    return { id: requestId, status: 'pending', alreadyPending: false };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function acceptCommunityChatRules({ user, rulesVersion, env = process.env, db = pool }) {
  const feature = getCommunityChatFeatureState(env);
  if (!isRegistered(user)) {
    throw chatError('LOGIN_REQUIRED', 403, '请先注册或登录', 'Please register or sign in first');
  }
  if (feature.accessMode !== 'invite_only') {
    throw chatError('COMMUNITY_CHAT_CLOSED', 403, '聊天室当前未开放', 'Community chat is currently closed');
  }
  if (String(rulesVersion || '') !== feature.rulesVersion) {
    throw chatError(
      'RULES_VERSION_OUTDATED',
      409,
      '社区规则已经更新，请刷新后重新确认',
      'The community rules changed. Refresh and review them again.',
    );
  }
  if (user.role === 'root') return { status: 'active', rulesVersion: feature.rulesVersion };

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [memberRows] = await connection.query(
      `SELECT status FROM community_chat_members WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [user.id],
    );
    const member = memberRows[0];
    if (!member || !['invited', 'active'].includes(member.status)) {
      throw chatError('INVITE_REQUIRED', 403, '当前账号尚未获得聊天室邀请', 'This account has not been invited');
    }

    await connection.query(
      `UPDATE community_chat_members
          SET status = 'active', rules_version = ?, rules_accepted_at = NOW(),
              joined_at = COALESCE(joined_at, NOW()), revoked_at = NULL
        WHERE user_id = ?`,
      [feature.rulesVersion, user.id],
    );
    await connection.query(`INSERT IGNORE INTO community_chat_user_settings (user_id) VALUES (?)`, [user.id]);
    await connection.query(
      `INSERT INTO community_chat_access_audit (actor_user_id, target_user_id, action, reason, metadata)
       VALUES (?, ?, 'rules_accepted', '', JSON_OBJECT('rulesVersion', ?))`,
      [user.id, user.id, feature.rulesVersion],
    );
    await connection.commit();
    return { status: 'active', rulesVersion: feature.rulesVersion };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function listCommunityChatRooms({ user, locale = 'zh-CN', env = process.env, db = pool }) {
  const access = await getCommunityChatAccess({ user, env, db });
  if (!access.canEnter) {
    throw chatError('INVITE_REQUIRED', 403, '当前账号还不能查看聊天室频道', 'This account cannot view chat rooms yet');
  }

  const nameColumn = locale === 'en-US' ? 'name_en' : 'name_zh';
  const descriptionColumn = locale === 'en-US' ? 'description_en' : 'description_zh';
  const unreadEnabled = access.messagingEnabled && access.authenticated && access.notificationsEnabled;
  const notificationLevel = normalizeCommunityChatNotificationLevel(access.notificationLevel);
  const unreadJoin = unreadEnabled
    ? `LEFT JOIN (
         SELECT message.room_id, COUNT(*) AS unreadCount
           FROM community_chat_messages message
           LEFT JOIN user sender ON sender.id = message.user_id
           LEFT JOIN community_chat_members sender_membership ON sender_membership.user_id = message.user_id
           LEFT JOIN community_chat_messages reply ON reply.id = message.reply_to_id
           LEFT JOIN community_chat_reads reading
             ON reading.room_id = message.room_id AND reading.user_id = ?
          WHERE message.status = 'active'
            AND message.user_id <> ?
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_blocks blocked
               WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
            )
            AND NOT EXISTS (
              SELECT 1 FROM community_chat_message_deletions deletion
               WHERE deletion.user_id = ? AND deletion.message_id = message.id
            )
            AND message.id > COALESCE(reading.last_read_message_id, 0)
            AND (
              ? = 'all'
              OR (
                ? IN ('official', 'mentions')
                AND (
                  sender.role = 'root'
                  OR (sender_membership.role = 'moderator' AND sender_membership.status = 'active')
                )
              )
              OR (
                ? IN ('mentions_only', 'mentions')
                AND (
                  reply.user_id = ?
                  OR EXISTS (
                    SELECT 1
                      FROM community_chat_message_mentions mention
                     WHERE mention.message_id = message.id
                      AND mention.mentioned_user_id = ?
                  )
                )
                AND (
                  ? <> 'mentions_only'
                  OR NOT (
                    sender.role = 'root'
                    OR (sender_membership.role = 'moderator' AND sender_membership.status = 'active')
                  )
                )
              )
            )
          GROUP BY message.room_id
       ) unread ON unread.room_id = room.id`
    : '';
  const [rows] = await db.query(
    `SELECT room.slug, room.${nameColumn} AS name, room.${descriptionColumn} AS description,
            room.type, room.status, room.default_notification_level AS notificationLevel,
            room.slow_mode_seconds AS slowModeSeconds, room.sort_order AS sortOrder,
            ${unreadEnabled ? 'COALESCE(unread.unreadCount, 0)' : '0'} AS unreadCount
       FROM community_chat_rooms room
       ${unreadJoin}
      WHERE room.status = 'active' AND room.slug = ?
      ORDER BY room.sort_order ASC, room.id ASC`,
    unreadEnabled
      ? [
          user.id,
          user.id,
          user.id,
          user.id,
          notificationLevel,
          notificationLevel,
          notificationLevel,
          user.id,
          user.id,
          notificationLevel,
          COMMUNITY_CHAT_PRIMARY_ROOM_SLUG,
        ]
      : [COMMUNITY_CHAT_PRIMARY_ROOM_SLUG],
  );

  return {
    access,
    messagingEnabled: access.messagingEnabled,
    items: rows.map((room) => ({ ...room, unreadCount: Number(room.unreadCount || 0), mentionCount: 0 })),
  };
}

function assertRoot(user) {
  if (!user?.id || user.role !== 'root') {
    throw chatError('ROOT_REQUIRED', 403, '没有操作权限', 'You do not have permission');
  }
}

export async function listCommunityChatAccessRequests({
  user,
  status = 'pending',
  page = 1,
  pageSize = 30,
  db = pool,
}) {
  assertRoot(user);
  const normalizedStatus = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
  const normalizedPage = Math.max(1, Math.floor(Number(page) || 1));
  const normalizedPageSize = Math.min(100, Math.max(1, Math.floor(Number(pageSize) || 30)));
  const offset = (normalizedPage - 1) * normalizedPageSize;

  const [[items], [countRows]] = await Promise.all([
    db.query(
      `SELECT request.id, request.user_id AS userId, request.status, request.request_message AS requestMessage,
              request.review_note AS reviewNote, request.reviewed_by AS reviewedBy,
              request.reviewed_at AS reviewedAt, request.create_time AS createTime,
              request.update_time AS updateTime, COALESCE(account.alias, '') AS userAlias,
              COALESCE(account.email, '') AS userEmail, member.role AS memberRole,
              member.status AS memberStatus, member.rules_version AS memberRulesVersion,
              member.rules_accepted_at AS rulesAcceptedAt, member.joined_at AS joinedAt,
              member.revoked_at AS revokedAt
         FROM community_chat_access_requests request
         LEFT JOIN user account ON account.id = request.user_id
         LEFT JOIN community_chat_members member ON member.user_id = request.user_id
        WHERE request.status = ?
        ORDER BY request.create_time ASC, request.id ASC
        LIMIT ? OFFSET ?`,
      [normalizedStatus, normalizedPageSize, offset],
    ),
    db.query(`SELECT COUNT(*) AS total FROM community_chat_access_requests WHERE status = ?`, [normalizedStatus]),
  ]);

  return {
    items,
    total: Number(countRows[0]?.total || 0),
    page: normalizedPage,
    pageSize: normalizedPageSize,
    status: normalizedStatus,
  };
}

export async function reviewCommunityChatAccessRequest({ user, targetUserId, action, note = '', db = pool }) {
  assertRoot(user);
  const normalizedTargetUserId = normalizeText(targetUserId, 255, '用户 ID');
  if (!normalizedTargetUserId) {
    throw chatError('INVALID_INPUT', 400, '缺少用户 ID', 'User ID is required');
  }
  if (!['approve', 'reject'].includes(action)) {
    throw chatError('INVALID_REVIEW_ACTION', 400, '审核操作无效', 'Invalid review action');
  }
  const reviewNote = normalizeText(note, 500, '审核说明');
  if (action === 'reject' && !reviewNote) {
    throw chatError('REVIEW_NOTE_REQUIRED', 400, '拒绝申请时必须填写原因', 'A rejection reason is required');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [accountRows] = await connection.query(
      `SELECT id, role, del_flag AS delFlag FROM user WHERE id = ? LIMIT 1 FOR UPDATE`,
      [normalizedTargetUserId],
    );
    const account = accountRows[0];
    if (!account || account.role === 'visitor' || String(account.delFlag) === '1') {
      throw chatError('TARGET_USER_UNAVAILABLE', 404, '申请账号不存在或当前不可用', 'The applicant is unavailable');
    }

    const [requestRows] = await connection.query(
      `SELECT id, status FROM community_chat_access_requests WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [normalizedTargetUserId],
    );
    const request = requestRows[0];
    if (!request) {
      throw chatError('ACCESS_REQUEST_NOT_FOUND', 404, '未找到该用户的内测申请', 'Access request not found');
    }
    if (request.status !== 'pending') {
      throw chatError(
        'ACCESS_REQUEST_REVIEWED',
        409,
        '该申请已经处理，请刷新列表',
        'This request was already reviewed',
      );
    }

    const [memberRows] = await connection.query(
      `SELECT status FROM community_chat_members WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [normalizedTargetUserId],
    );
    if (action === 'approve' && memberRows[0]?.status === 'banned') {
      throw chatError(
        'COMMUNITY_MEMBER_BANNED',
        409,
        '该账号处于社区封禁状态，不能通过内测申请直接恢复',
        'This account is community-banned and cannot be restored through access review',
      );
    }

    const requestStatus = action === 'approve' ? 'approved' : 'rejected';
    await connection.query(
      `UPDATE community_chat_access_requests
          SET status = ?, reviewed_by = ?, review_note = ?, reviewed_at = NOW()
        WHERE id = ?`,
      [requestStatus, user.id, reviewNote, request.id],
    );

    if (action === 'approve') {
      await connection.query(
        `INSERT INTO community_chat_members (user_id, role, status, invited_by)
         VALUES (?, 'member', 'invited', ?)
         ON DUPLICATE KEY UPDATE
           status = 'invited', invited_by = VALUES(invited_by), rules_version = NULL,
           rules_accepted_at = NULL, revoked_at = NULL`,
        [normalizedTargetUserId, user.id],
      );
      await connection.query(`INSERT IGNORE INTO community_chat_user_settings (user_id) VALUES (?)`, [
        normalizedTargetUserId,
      ]);
    }

    await connection.query(
      `INSERT INTO community_chat_access_audit (actor_user_id, target_user_id, action, reason)
       VALUES (?, ?, ?, ?)`,
      [user.id, normalizedTargetUserId, action === 'approve' ? 'access_approved' : 'access_rejected', reviewNote],
    );
    await connection.commit();
    return { userId: normalizedTargetUserId, status: requestStatus };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function revokeCommunityChatMember({ user, targetUserId, reason = '', env = process.env, db = pool }) {
  assertRoot(user);
  const normalizedTargetUserId = normalizeText(targetUserId, 255, '用户 ID');
  if (!normalizedTargetUserId || normalizedTargetUserId === user.id) {
    throw chatError('INVALID_TARGET', 400, '不能撤销当前管理员自己的访问资格', 'You cannot revoke your own access');
  }
  const normalizedReason = normalizeText(reason, 500, '撤销原因');
  if (!normalizedReason) {
    throw chatError('REVOKE_REASON_REQUIRED', 400, '撤销资格时必须填写原因', 'A revocation reason is required');
  }
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [memberRows] = await connection.query(
      `SELECT status FROM community_chat_members WHERE user_id = ? LIMIT 1 FOR UPDATE`,
      [normalizedTargetUserId],
    );
    if (!memberRows[0]) {
      throw chatError('MEMBER_NOT_FOUND', 404, '未找到该聊天室成员', 'Community member not found');
    }
    await connection.query(
      `UPDATE community_chat_members
          SET status = 'revoked', rules_version = NULL, rules_accepted_at = NULL, revoked_at = NOW()
        WHERE user_id = ?`,
      [normalizedTargetUserId],
    );
    await connection.query(
      `INSERT INTO community_chat_access_audit (actor_user_id, target_user_id, action, reason)
       VALUES (?, ?, 'access_revoked', ?)`,
      [user.id, normalizedTargetUserId, normalizedReason],
    );
    await connection.commit();
    publishCommunityChatRealtimeEvent(
      'access.changed',
      { reason: 'access_revoked', disconnect: getCommunityChatFeatureState(env).accessMode === 'invite_only' },
      { targetUserId: normalizedTargetUserId },
    );
    return { userId: normalizedTargetUserId, status: 'revoked' };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getCommunityChatRuntimePolicyForAdmin({ user, env = process.env, db = pool }) {
  assertRoot(user);
  return getCommunityChatRuntimePolicy({ env, db });
}

export async function updateCommunityChatRuntimePolicy({
  user,
  postingEnabled,
  reason = '',
  env = process.env,
  db = pool,
}) {
  assertRoot(user);
  if (typeof postingEnabled !== 'boolean') {
    throw chatError('INVALID_RUNTIME_POLICY', 400, '请选择有效的聊天室运行状态', 'Select a valid chat runtime state');
  }
  const normalizedReason = normalizeText(reason, 500, '切换原因');
  if (!normalizedReason) {
    throw chatError(
      'RUNTIME_POLICY_REASON_REQUIRED',
      400,
      '切换聊天室运行状态时必须填写原因',
      'A reason is required when changing the chat runtime state',
    );
  }

  const feature = getCommunityChatFeatureState(env);
  if (postingEnabled && feature.emergencyReadOnly) {
    throw chatError(
      'COMMUNITY_CHAT_ENVIRONMENT_READ_ONLY',
      423,
      '环境级紧急只读仍然生效，请先由运维解除后再恢复发言',
      'The environment-level read-only lock is still active. Clear it before restoring posting.',
    );
  }

  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const current = await getCommunityChatRuntimePolicy({ env, db: connection, lock: true });
    if (current.databasePostingEnabled === postingEnabled) {
      await connection.commit();
      return { ...current, changed: false };
    }

    await connection.query(
      `INSERT INTO community_chat_runtime_policy (id, posting_enabled, updated_by)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE
         posting_enabled = VALUES(posting_enabled), updated_by = VALUES(updated_by), update_time = CURRENT_TIMESTAMP`,
      [COMMUNITY_CHAT_RUNTIME_POLICY_ID, postingEnabled ? 1 : 0, user.id],
    );
    await connection.query(
      `INSERT INTO community_chat_moderation_actions
         (id, report_id, actor_user_id, target_user_id, message_id, action, reason, metadata)
       VALUES (?, NULL, ?, ?, NULL, ?, ?, ?)`,
      [
        generateUUID(),
        user.id,
        user.id,
        postingEnabled ? 'emergency_read_only_disabled' : 'emergency_read_only_enabled',
        normalizedReason,
        JSON.stringify({
          previousPostingEnabled: current.databasePostingEnabled,
          postingEnabled,
          environmentReadOnly: feature.emergencyReadOnly,
        }),
      ],
    );
    await connection.commit();
    const updated = {
      ...resolveRuntimePolicy(feature, {
        postingEnabled: postingEnabled ? 1 : 0,
        updatedAt: new Date().toISOString(),
      }),
      changed: true,
    };
    publishCommunityChatRealtimeEvent('runtime.changed', {
      postingEnabled: updated.postingEnabled,
      emergencyReadOnly: updated.emergencyReadOnly,
    });
    return updated;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export const __test__ = { normalizeText, isRegistered, resolveRuntimePolicy };
