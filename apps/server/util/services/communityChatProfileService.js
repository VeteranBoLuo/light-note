import pool from '../../db/index.js';
import { COMMUNITY_CHAT_PRIMARY_ROOM_SLUG } from '../communityChatFeature.js';
import { ACHIEVEMENTS, levelForExp, rankOf } from '../growth.js';
import { getFrameItem, titleName } from '../points.js';
import { verifyCommunityChatPresenceAvatarToken } from '../communityChat/presenceAvatarToken.js';
import {
  CommunityChatError,
  assertCommunityChatMessagingAccess,
  assertCommunityChatReadAccess,
} from './communityChatAccessService.js';

const MAX_BIO_GRAPHEMES = 60;
const MAX_FEATURED_ACHIEVEMENTS = 3;
const GROUP_ORDER = Object.freeze(['level', 'tenure', 'checkin', 'create', 'action', 'organize']);
const MESSAGE_PUBLIC_ID_PATTERN = /^[A-Za-z0-9-]+$/;
const KNOWN_ACHIEVEMENTS = new Map(ACHIEVEMENTS.map((achievement) => [achievement.key, achievement]));

const chatError = (code, status, zhMessage, enMessage) => new CommunityChatError(code, status, zhMessage, enMessage);

function normalizeMessagePublicId(value) {
  const publicId = String(value || '').trim();
  if (!publicId || publicId.length > 36 || !MESSAGE_PUBLIC_ID_PATTERN.test(publicId)) {
    throw chatError('INVALID_MESSAGE_ID', 400, '消息标识无效', 'Invalid message identifier');
  }
  return publicId;
}

function graphemeLength(value) {
  if (typeof Intl?.Segmenter === 'function') {
    return Array.from(new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(value)).length;
  }
  return Array.from(value).length;
}

function normalizeBio(value) {
  const bio = String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F]/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
  if (graphemeLength(bio) > MAX_BIO_GRAPHEMES) {
    throw chatError(
      'COMMUNITY_PROFILE_BIO_TOO_LONG',
      400,
      `社区简介不能超过 ${MAX_BIO_GRAPHEMES} 个字符`,
      `Community bio must not exceed ${MAX_BIO_GRAPHEMES} characters`,
    );
  }
  return bio;
}

function normalizeFeaturedAchievementKeys(value) {
  if (!Array.isArray(value)) {
    throw chatError('COMMUNITY_PROFILE_FEATURED_INVALID', 400, '精选成就格式无效', 'Invalid featured achievements');
  }
  const keys = value.map((item) => String(item || '').trim());
  if (keys.some((key) => !key || !KNOWN_ACHIEVEMENTS.has(key)) || new Set(keys).size !== keys.length) {
    throw chatError(
      'COMMUNITY_PROFILE_FEATURED_INVALID',
      400,
      '精选成就包含无效或重复项目',
      'Featured achievements contain invalid or duplicate entries',
    );
  }
  if (keys.length > MAX_FEATURED_ACHIEVEMENTS) {
    throw chatError(
      'COMMUNITY_PROFILE_FEATURED_LIMIT',
      400,
      `最多精选 ${MAX_FEATURED_ACHIEVEMENTS} 项成就`,
      `Choose at most ${MAX_FEATURED_ACHIEVEMENTS} featured achievements`,
    );
  }
  return keys;
}

function normalizeShowCommunityTenure(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0) return false;
  throw chatError(
    'COMMUNITY_PROFILE_TENURE_INVALID',
    400,
    '社区资历展示设置无效',
    'Invalid community tenure visibility setting',
  );
}

function normalizeBaseRevision(value) {
  const revision = Number(value);
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw chatError('COMMUNITY_PROFILE_REVISION_INVALID', 400, '资料版本无效', 'Invalid profile revision');
  }
  return revision;
}

async function queryFirst(db, sql, params = []) {
  const [rows] = await db.query(sql, params);
  return rows[0] || null;
}

function publicGrowthProfile(row) {
  const level = levelForExp(Number(row.authorExp || 0));
  return {
    level,
    levelName: rankOf(level).name,
    title: titleName(row.authorTitleId) || null,
  };
}

function parseFeaturedAchievements(value) {
  if (value === null || value === undefined) return null;
  let parsed = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return null;
    }
  }
  if (!Array.isArray(parsed)) return null;
  return [
    ...new Set(parsed.map((item) => String(item || '').trim()).filter((key) => KNOWN_ACHIEVEMENTS.has(key))),
  ].slice(0, MAX_FEATURED_ACHIEVEMENTS);
}

function groupOrder(group) {
  const index = GROUP_ORDER.indexOf(group);
  return index < 0 ? GROUP_ORDER.length : index;
}

function defaultFeaturedAchievements(unlockedAchievements) {
  if (!unlockedAchievements.length) return [];
  const strongestByGroup = new Map();
  for (const achievement of unlockedAchievements) {
    const current = strongestByGroup.get(achievement.group);
    if (
      !current ||
      achievement.target > current.target ||
      (achievement.target === current.target && achievement.latestId > current.latestId)
    ) {
      strongestByGroup.set(achievement.group, achievement);
    }
  }
  const diverse = [...strongestByGroup.values()].sort(
    (left, right) =>
      right.latestId - left.latestId ||
      groupOrder(left.group) - groupOrder(right.group) ||
      right.target - left.target ||
      left.key.localeCompare(right.key),
  );
  const selected = diverse.slice(0, MAX_FEATURED_ACHIEVEMENTS);
  if (selected.length < MAX_FEATURED_ACHIEVEMENTS) {
    const selectedKeys = new Set(selected.map((item) => item.key));
    const remaining = unlockedAchievements
      .filter((item) => !selectedKeys.has(item.key))
      .sort(
        (left, right) =>
          right.latestId - left.latestId ||
          right.target - left.target ||
          groupOrder(left.group) - groupOrder(right.group) ||
          left.key.localeCompare(right.key),
      );
    selected.push(...remaining.slice(0, MAX_FEATURED_ACHIEVEMENTS - selected.length));
  }
  return selected.map((item) => item.key);
}

function resolveFeaturedAchievements(unlockedAchievements, storedValue) {
  const unlockedByKey = new Map(unlockedAchievements.map((achievement) => [achievement.key, achievement]));
  const configured = parseFeaturedAchievements(storedValue);
  const keys = configured === null ? defaultFeaturedAchievements(unlockedAchievements) : configured;
  return keys
    .map((key) => unlockedByKey.get(key))
    .filter(Boolean)
    .slice(0, MAX_FEATURED_ACHIEVEMENTS);
}

async function loadUnlockedAchievements(db, userId, level) {
  // 两张历史表的字符排序规则并不一致：旧 points_log.ref 使用
  // utf8mb4_general_ci，新 user_achievements.achievement_key 使用
  // utf8mb4_unicode_ci。不要在 SQL 中 UNION 两列，否则既有数据库会因
  // ER_CANT_AGGREGATE_NCOLLATIONS 让整张社区名片读取失败。
  const [[achievementRows], [legacyRows]] = await Promise.all([
    db.query(
      `SELECT achievement_key AS ref, UNIX_TIMESTAMP(unlocked_at) AS latestId
         FROM user_achievements
        WHERE user_id = ?
        ORDER BY unlocked_at DESC, achievement_key ASC`,
      [userId],
    ),
    db.query(
      `SELECT ref, MAX(id) AS latestId
         FROM points_log
        WHERE user_id = ? AND reason IN ('achievement', 'ach_unlock') AND ref IS NOT NULL
        GROUP BY ref
        ORDER BY latestId DESC, ref ASC`,
      [userId],
    ),
  ]);
  const latestIds = new Map();
  for (const row of [...legacyRows, ...achievementRows]) {
    const key = String(row.ref || '');
    if (!KNOWN_ACHIEVEMENTS.has(key)) continue;
    latestIds.set(key, Math.max(latestIds.get(key) || 0, Number(row.latestId || 0)));
  }
  const unlockedKeys = new Set(latestIds.keys());
  for (const achievement of ACHIEVEMENTS) {
    if (achievement.group === 'level' && level >= achievement.target) unlockedKeys.add(achievement.key);
  }
  return ACHIEVEMENTS.filter((achievement) => unlockedKeys.has(achievement.key)).map((achievement) => ({
    key: achievement.key,
    group: achievement.group,
    target: Number(achievement.target || 0),
    latestId: latestIds.get(achievement.key) || 0,
  }));
}

function publicAchievement(achievement) {
  return { key: achievement.key, group: achievement.group };
}

function tenureLabel(row, locale) {
  if (!Boolean(Number(row.showCommunityTenure ?? 1))) return null;
  const registeredAt = row.authorRegisteredAt;
  const joinedTime = registeredAt ? new Date(registeredAt).getTime() : Number.NaN;
  if (!Number.isFinite(joinedTime)) return null;
  const days = Math.max(0, Math.floor((Date.now() - joinedTime) / 86_400_000));
  const english = String(locale || '')
    .toLowerCase()
    .startsWith('en');
  if (days < 30) return english ? 'Joined Light Note within the past month' : '加入轻笺未满 1 个月';
  if (days < 365) {
    const months = Math.max(1, Math.floor(days / 30));
    return english
      ? `Joined Light Note about ${months} month${months === 1 ? '' : 's'} ago`
      : `加入轻笺约 ${months} 个月`;
  }
  const years = Math.max(1, Math.floor(days / 365));
  return english ? `Joined Light Note about ${years} year${years === 1 ? '' : 's'} ago` : `加入轻笺约 ${years} 年`;
}

function publicFrame(frameId) {
  const frame = frameId ? getFrameItem(frameId) : null;
  return frame ? { frameId: frame.id, frameRarity: frame.rarity || null } : { frameId: null, frameRarity: null };
}

async function buildProfilePayload({ db, author, avatarPath, locale }) {
  const growth = publicGrowthProfile(author);
  const unlocked = await loadUnlockedAchievements(db, author.authorUserId, growth.level);
  const featured = resolveFeaturedAchievements(unlocked, author.featuredAchievements);
  return {
    profile: {
      name: author.authorName || '',
      userPublicId: author.authorUserPublicId || '',
      communityId: author.authorCommunityId || '',
      role: author.authorRole || 'member',
      avatar: Boolean(Number(author.authorHasAvatar || 0)) ? avatarPath : '',
      ...publicFrame(author.authorFrameId),
      ...growth,
      bio: normalizeBio(author.bio || ''),
      communityTenureLabel: tenureLabel(author, locale),
      achievements: featured.map(publicAchievement),
      achievementCount: unlocked.length,
      hasMoreAchievements: unlocked.length > featured.length,
    },
    unlocked,
    featured,
  };
}

async function loadVisibleMessageAuthor({ user, messagePublicId, env, db }) {
  const normalizedMessagePublicId = normalizeMessagePublicId(messagePublicId);
  await assertCommunityChatReadAccess({ user, env, db });
  const viewerUserId = user?.id && user?.role !== 'visitor' ? user.id : '';
  const viewerVisibilityClause = viewerUserId
    ? `AND NOT EXISTS (
          SELECT 1 FROM community_chat_blocks blocked
           WHERE blocked.user_id = ? AND blocked.blocked_user_id = message.user_id
        )
        AND NOT EXISTS (
          SELECT 1 FROM community_chat_message_deletions deletion
           WHERE deletion.user_id = ? AND deletion.message_id = message.id
        )`
    : '';
  const author = await queryFirst(
    db,
    `SELECT message.user_id AS authorUserId,
            account.role AS authorAccountRole,
            COALESCE(NULLIF(account.alias, ''), '') AS authorName,
            identity.public_id AS authorUserPublicId,
            identity.community_id AS authorCommunityId,
            CASE
              WHEN account.role = 'root' THEN 'official'
              WHEN membership.role = 'moderator' AND membership.status = 'active' THEN 'moderator'
              ELSE 'member'
            END AS authorRole,
            CASE
              WHEN account.head_picture LIKE 'https://%'
                OR account.head_picture LIKE 'http://%'
                OR (
                  account.head_picture LIKE 'data:image/%;base64,%'
                  AND OCTET_LENGTH(account.head_picture) <= 524288
                )
              THEN 1 ELSE 0
            END AS authorHasAvatar,
            COALESCE(growth.exp, 0) AS authorExp,
            growth.equipped_title AS authorTitleId,
            growth.equipped_frame AS authorFrameId,
            account.create_time AS authorRegisteredAt,
            profile.bio,
            profile.show_community_tenure AS showCommunityTenure,
            profile.featured_achievements AS featuredAchievements,
            COALESCE(profile.revision, 0) AS profileRevision
       FROM community_chat_messages message
       JOIN community_chat_rooms room ON room.id = message.room_id
       JOIN user account ON account.id = message.user_id AND account.del_flag = 0
       LEFT JOIN community_chat_members membership ON membership.user_id = message.user_id
       LEFT JOIN community_chat_user_identities identity ON identity.user_id = message.user_id
       LEFT JOIN user_growth growth ON growth.user_id = message.user_id
       LEFT JOIN community_chat_member_profiles profile ON profile.user_id = message.user_id
      WHERE message.public_id = ?
        AND message.status IN ('active', 'recalled')
        AND room.slug = ?
        AND room.status = 'active'
        ${viewerVisibilityClause}
      LIMIT 1`,
    [
      normalizedMessagePublicId,
      COMMUNITY_CHAT_PRIMARY_ROOM_SLUG,
      ...(viewerUserId ? [viewerUserId, viewerUserId] : []),
    ],
  );
  if (!author) {
    throw chatError(
      'COMMUNITY_CHAT_AUTHOR_PROFILE_NOT_FOUND',
      404,
      '该用户资料当前不可查看',
      'This member profile is not available',
    );
  }
  return { author, normalizedMessagePublicId };
}

async function loadOwnAuthor({ user, env, db }) {
  await assertCommunityChatMessagingAccess({ user, env, db });
  const author = await queryFirst(
    db,
    `SELECT account.id AS authorUserId,
            account.role AS authorAccountRole,
            COALESCE(NULLIF(account.alias, ''), '') AS authorName,
            identity.public_id AS authorUserPublicId,
            identity.community_id AS authorCommunityId,
            CASE
              WHEN account.role = 'root' THEN 'official'
              WHEN membership.role = 'moderator' AND membership.status = 'active' THEN 'moderator'
              ELSE 'member'
            END AS authorRole,
            CASE
              WHEN account.head_picture LIKE 'https://%'
                OR account.head_picture LIKE 'http://%'
                OR (
                  account.head_picture LIKE 'data:image/%;base64,%'
                  AND OCTET_LENGTH(account.head_picture) <= 524288
                )
              THEN 1 ELSE 0
            END AS authorHasAvatar,
            COALESCE(growth.exp, 0) AS authorExp,
            growth.equipped_title AS authorTitleId,
            growth.equipped_frame AS authorFrameId,
            account.create_time AS authorRegisteredAt,
            profile.bio,
            profile.show_community_tenure AS showCommunityTenure,
            profile.featured_achievements AS featuredAchievements,
            COALESCE(profile.revision, 0) AS profileRevision
       FROM user account
       LEFT JOIN community_chat_members membership ON membership.user_id = account.id
       LEFT JOIN community_chat_user_identities identity ON identity.user_id = account.id
       LEFT JOIN user_growth growth ON growth.user_id = account.id
       LEFT JOIN community_chat_member_profiles profile ON profile.user_id = account.id
      WHERE account.id = ? AND account.del_flag = 0
      LIMIT 1`,
    [user.id],
  );
  if (!author) {
    throw chatError('COMMUNITY_PROFILE_NOT_FOUND', 404, '社区资料当前不可用', 'Community profile is unavailable');
  }
  return author;
}

export async function getCommunityChatMessageAuthorProfile({
  user,
  messagePublicId,
  locale = 'zh-CN',
  env = process.env,
  db = pool,
}) {
  const { author, normalizedMessagePublicId } = await loadVisibleMessageAuthor({
    user,
    messagePublicId,
    env,
    db,
  });
  const { profile } = await buildProfilePayload({
    db,
    author,
    avatarPath: `/api/community-chat/messages/${encodeURIComponent(normalizedMessagePublicId)}/author-avatar`,
    locale,
  });
  return profile;
}

export async function getCommunityChatMessageAuthorAchievements({
  user,
  messagePublicId,
  env = process.env,
  db = pool,
}) {
  const { author } = await loadVisibleMessageAuthor({ user, messagePublicId, env, db });
  const growth = publicGrowthProfile(author);
  const unlocked = await loadUnlockedAchievements(db, author.authorUserId, growth.level);
  return {
    achievements: unlocked.map(publicAchievement),
    achievementCount: unlocked.length,
  };
}

export async function getCommunityChatOwnProfile({ user, locale = 'zh-CN', env = process.env, db = pool }) {
  const author = await loadOwnAuthor({ user, env, db });
  const { profile, unlocked, featured } = await buildProfilePayload({
    db,
    author,
    avatarPath: '/api/community-chat/profile/me/avatar',
    locale,
  });
  return {
    bio: profile.bio,
    showCommunityTenure: Boolean(Number(author.showCommunityTenure ?? 1)),
    featuredAchievementKeys: featured.map((achievement) => achievement.key),
    revision: Number(author.profileRevision || 0),
    usesDefaultFeaturedAchievements: author.featuredAchievements === null || author.featuredAchievements === undefined,
    availableAchievements: unlocked.map(publicAchievement),
    publicPreview: profile,
  };
}

export async function updateCommunityChatOwnProfile({
  user,
  bio,
  showCommunityTenure,
  featuredAchievementKeys,
  baseRevision,
  locale = 'zh-CN',
  env = process.env,
  db = pool,
}) {
  const normalizedBio = normalizeBio(bio);
  const normalizedShowTenure = normalizeShowCommunityTenure(showCommunityTenure);
  const normalizedFeaturedKeys = normalizeFeaturedAchievementKeys(featuredAchievementKeys);
  const normalizedRevision = normalizeBaseRevision(baseRevision);
  const ownsConnection = typeof db.getConnection === 'function';
  const connection = ownsConnection ? await db.getConnection() : db;
  let transactionStarted = false;
  try {
    if (typeof connection.beginTransaction === 'function') {
      await connection.beginTransaction();
      transactionStarted = true;
    }
    await assertCommunityChatMessagingAccess({ user, env, db: connection, lock: true });
    const current = await queryFirst(
      connection,
      `SELECT revision
         FROM community_chat_member_profiles
        WHERE user_id = ?
        LIMIT 1
        FOR UPDATE`,
      [user.id],
    );
    const currentRevision = Number(current?.revision || 0);
    if (currentRevision !== normalizedRevision) {
      throw chatError(
        'COMMUNITY_PROFILE_CONFLICT',
        409,
        '社区名片已在其他页面更新，请刷新后重试',
        'The community profile changed elsewhere. Refresh and try again',
      );
    }
    const growthRow = await queryFirst(
      connection,
      `SELECT account.role AS authorAccountRole, COALESCE(growth.exp, 0) AS authorExp
         FROM user account
         LEFT JOIN user_growth growth ON growth.user_id = account.id
        WHERE account.id = ? AND account.del_flag = 0
        LIMIT 1`,
      [user.id],
    );
    if (!growthRow) {
      throw chatError('COMMUNITY_PROFILE_NOT_FOUND', 404, '社区资料当前不可用', 'Community profile is unavailable');
    }
    const growth = publicGrowthProfile(growthRow);
    const unlocked = await loadUnlockedAchievements(connection, user.id, growth.level);
    const unlockedKeys = new Set(unlocked.map((achievement) => achievement.key));
    if (normalizedFeaturedKeys.some((key) => !unlockedKeys.has(key))) {
      throw chatError(
        'COMMUNITY_PROFILE_ACHIEVEMENT_LOCKED',
        400,
        '只能精选已经解锁的成就',
        'Only unlocked achievements can be featured',
      );
    }
    const nextRevision = currentRevision + 1;
    if (current) {
      await connection.query(
        `UPDATE community_chat_member_profiles
            SET bio = ?, show_community_tenure = ?, featured_achievements = ?, revision = ?
          WHERE user_id = ?`,
        [normalizedBio, normalizedShowTenure ? 1 : 0, JSON.stringify(normalizedFeaturedKeys), nextRevision, user.id],
      );
    } else {
      await connection.query(
        `INSERT INTO community_chat_member_profiles
          (user_id, bio, show_community_tenure, featured_achievements, revision)
         VALUES (?, ?, ?, ?, ?)`,
        [user.id, normalizedBio, normalizedShowTenure ? 1 : 0, JSON.stringify(normalizedFeaturedKeys), nextRevision],
      );
    }
    if (transactionStarted) await connection.commit();
  } catch (error) {
    if (transactionStarted) await connection.rollback();
    throw error;
  } finally {
    if (ownsConnection) connection.release();
  }
  return getCommunityChatOwnProfile({ user, locale, env, db });
}

export async function getCommunityChatOwnProfileAvatar({ user, env = process.env, db = pool }) {
  await assertCommunityChatMessagingAccess({ user, env, db });
  const avatar = await queryFirst(
    db,
    `SELECT head_picture AS source
       FROM user
      WHERE id = ?
        AND del_flag = 0
        AND (
          head_picture LIKE 'https://%'
          OR head_picture LIKE 'http://%'
          OR (head_picture LIKE 'data:image/%;base64,%' AND OCTET_LENGTH(head_picture) <= 524288)
        )
      LIMIT 1`,
    [user.id],
  );
  if (!avatar?.source) {
    throw chatError('COMMUNITY_CHAT_AUTHOR_AVATAR_NOT_FOUND', 404, '头像当前不可用', 'Avatar is unavailable');
  }
  return { source: String(avatar.source) };
}

export async function getCommunityChatPresenceMemberAvatar({ user, token, env = process.env, db = pool }) {
  if (user?.role !== 'root') {
    throw chatError('COMMUNITY_CHAT_ROOT_REQUIRED', 403, '仅 Root 可查看在线成员头像', 'Root access required');
  }
  await assertCommunityChatReadAccess({ user, env, db });
  let userId = '';
  try {
    ({ userId } = verifyCommunityChatPresenceAvatarToken(token, { env }));
  } catch (error) {
    if (error?.code === 'COMMUNITY_CHAT_PRESENCE_TOKEN_UNAVAILABLE') {
      throw chatError(
        'COMMUNITY_CHAT_PRESENCE_AVATAR_UNAVAILABLE',
        503,
        '在线成员头像暂时不可用',
        'Online member avatars are temporarily unavailable',
      );
    }
    throw chatError('COMMUNITY_CHAT_AUTHOR_AVATAR_NOT_FOUND', 404, '头像当前不可用', 'Avatar is unavailable');
  }
  const avatar = await queryFirst(
    db,
    `SELECT head_picture AS source
       FROM user
      WHERE id = ?
        AND (role = 'root' OR del_flag = 0)
        AND (
          head_picture LIKE 'https://%'
          OR head_picture LIKE 'http://%'
          OR (head_picture LIKE 'data:image/%;base64,%' AND OCTET_LENGTH(head_picture) <= 524288)
        )
      LIMIT 1`,
    [userId],
  );
  if (!avatar?.source) {
    throw chatError('COMMUNITY_CHAT_AUTHOR_AVATAR_NOT_FOUND', 404, '头像当前不可用', 'Avatar is unavailable');
  }
  return { source: String(avatar.source) };
}

export const __test__ = {
  defaultFeaturedAchievements,
  normalizeBio,
  parseFeaturedAchievements,
};
