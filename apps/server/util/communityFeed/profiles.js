import { randomUUID } from 'node:crypto';
import pool from '../../db/index.js';
import { buildProfilePayload, loadCommunityProfileAuthor } from '../services/communityChatProfileService.js';
import {
  access,
  ensureProfile,
  expectedRevision,
  fail,
  first,
  identity,
  pairAllowed,
  parseJson,
  publicId,
  requirePair,
  strictFields,
  transaction,
} from './core.js';
import { listPosts, postDetail, pageOptions } from './posts.js';
export async function profileOptions({ user, env = process.env, db = pool }) {
  await access(db, user, { env, ownSafety: true });
  const row = await first(db, 'SELECT * FROM community_profile_options WHERE user_id=?', [user.id]);
  return {
    userPublicId: (await identity(db, user.id)).userPublicId,
    enabled: true,
    revision: Number(row?.row_revision || 0),
    interests: parseJson(row?.interests) || [],
    featuredPosts: parseJson(row?.featured_posts) || [],
    commentNotificationsEnabled: row ? Boolean(row.comment_notifications_enabled) : true,
    likeNotificationsEnabled: row ? Boolean(row.like_notifications_enabled) : true,
    mentionNotificationsEnabled: row ? Boolean(row.mention_notifications_enabled) : true,
  };
}
export async function updateProfileOptions({ user, input, env = process.env, db = pool }) {
  strictFields(input, [
    'requestId',
    'expectedRevision',
    'enabled',
    'consentVersion',
    'interests',
    'featuredPosts',
    'commentNotificationsEnabled',
    'mentionNotificationsEnabled',
    'likeNotificationsEnabled',
  ]);
  for (const field of [
    'enabled',
    'commentNotificationsEnabled',
    'mentionNotificationsEnabled',
    'likeNotificationsEnabled',
  ])
    if (input[field] !== undefined && typeof input[field] !== 'boolean') fail('COMMUNITY_INVALID_INPUT');
  return transaction(
    { user, requestId: input.requestId, action: 'updateProfileOptions', input, env, db, ownSafety: true },
    async (c) => {
      const previous = await first(c, 'SELECT * FROM community_profile_options WHERE user_id=? FOR UPDATE', [user.id]);
      expectedRevision(input.expectedRevision, previous?.row_revision || 0);
      const row = await ensureProfile(c, user.id);
      if (
        (input.interests && JSON.stringify(input.interests) !== JSON.stringify(parseJson(row.interests))) ||
        (input.featuredPosts && JSON.stringify(input.featuredPosts) !== JSON.stringify(parseJson(row.featured_posts)))
      )
        await access(c, user, { env, write: true, lock: true });
      const interests = input.interests ?? parseJson(row.interests),
        featured = input.featuredPosts ?? parseJson(row.featured_posts);
      if (
        !Array.isArray(interests) ||
        interests.length > 3 ||
        interests.some((s) => typeof s !== 'string' || !/^[a-z0-9-]{1,40}$/.test(s)) ||
        !Array.isArray(featured) ||
        featured.length > 3
      )
        fail('COMMUNITY_INVALID_INPUT');
      if (interests.length) {
        const [topics] = await c.query(
          `SELECT slug FROM community_topics WHERE enabled=1 AND slug IN (${interests.map(() => '?').join(',')})`,
          interests,
        );
        if (topics.length !== new Set(interests).size) fail('COMMUNITY_TOPIC_UNAVAILABLE', 409);
      }
      for (const id of featured) {
        publicId(id);
        if (
          !(await first(c, "SELECT id FROM community_posts WHERE public_id=? AND author_id=? AND status='published'", [
            id,
            user.id,
          ]))
        )
          fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
      }
      await identity(c, user.id);
      const revision = Number(previous?.row_revision || 0) + 1;
      await c.query(
        'UPDATE community_profile_options SET enabled=?,consent_version=?,interests=?,featured_posts=?,comment_notifications_enabled=?,mention_notifications_enabled=?,like_notifications_enabled=?,row_revision=? WHERE user_id=?',
        [
          1,
          row.consent_version,
          JSON.stringify([...new Set(interests)]),
          JSON.stringify([...new Set(featured)]),
          input.commentNotificationsEnabled ?? row.comment_notifications_enabled,
          input.mentionNotificationsEnabled ?? row.mention_notifications_enabled,
          input.likeNotificationsEnabled ?? row.like_notifications_enabled,
          revision,
          user.id,
        ],
      );
      return { revision, enabled: true };
    },
  );
}
export async function publicProfileRow(db, id, viewer, lock = false) {
  const row = await first(
    db,
    `SELECT u.id,u.role,COALESCE(NULLIF(u.alias,''),'成员') AS name,i.public_id,i.community_id,o.interests,o.featured_posts FROM community_chat_user_identities i JOIN user u ON u.id=i.user_id LEFT JOIN community_profile_options o ON o.user_id=i.user_id WHERE i.public_id=? AND u.del_flag='0' AND u.role<>'visitor' AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=u.id AND m.status='banned')${lock ? ' FOR UPDATE' : ''}`,
    [publicId(id)],
  );
  if (!row || !(await pairAllowed(db, viewer, row.id, { lock }))) fail('COMMUNITY_CONTENT_UNAVAILABLE', 404);
  return row;
}
export async function relation({ user, input, env = process.env, db = pool }) {
  strictFields(input, ['requestId', 'userPublicId', 'action', 'enabled']);
  if (!['follow', 'mute', 'block'].includes(input.action) || typeof input.enabled !== 'boolean')
    fail('COMMUNITY_INVALID_INPUT');
  return transaction(
    {
      user,
      requestId: input.requestId,
      action: 'relation',
      input,
      env,
      db,
      ownSafety: input.action !== 'follow' || !input.enabled,
    },
    async (c) => {
      const target = await first(
        c,
        "SELECT i.user_id,u.role FROM community_chat_user_identities i JOIN user u ON u.id=i.user_id WHERE i.public_id=? AND u.del_flag='0' FOR UPDATE",
        [publicId(input.userPublicId)],
      );
      if (!target || target.user_id === user.id) fail('COMMUNITY_INTERACTION_UNAVAILABLE', 404);
      if (input.action === 'block') {
        if (target.role === 'root') fail('COMMUNITY_OFFICIAL_BLOCK_FORBIDDEN', 403);
        if (input.enabled) {
          await c.query('INSERT IGNORE INTO community_chat_blocks (id,user_id,blocked_user_id) VALUES (?,?,?)', [
            randomUUID(),
            user.id,
            target.user_id,
          ]);
          await clearBlockedRelations(c, user.id, target.user_id);
        } else
          await c.query('DELETE FROM community_chat_blocks WHERE user_id=? AND blocked_user_id=?', [
            user.id,
            target.user_id,
          ]);
      } else if (input.action === 'follow') {
        if (input.enabled) {
          await identity(c, user.id);
          await publicProfileRow(c, input.userPublicId, user.id, true);
          await requirePair(c, user.id, target.user_id, { lock: true });
          await c.query('INSERT IGNORE INTO community_follows (follower_user_id,followee_user_id) VALUES (?,?)', [
            user.id,
            target.user_id,
          ]);
        } else
          await c.query('DELETE FROM community_follows WHERE follower_user_id=? AND followee_user_id=?', [
            user.id,
            target.user_id,
          ]);
      } else {
        if (input.enabled)
          await c.query('INSERT IGNORE INTO community_user_mutes (user_id,target_user_id) VALUES (?,?)', [
            user.id,
            target.user_id,
          ]);
        else
          await c.query('DELETE FROM community_user_mutes WHERE user_id=? AND target_user_id=?', [
            user.id,
            target.user_id,
          ]);
      }
      return { userPublicId: input.userPublicId, action: input.action, enabled: input.enabled };
    },
  );
}
export async function clearBlockedRelations(c, a, b) {
  // Called from the old chat block transaction too; missing P2 tables must not break chat.
  try {
    await c.query(
      'DELETE FROM community_follows WHERE (follower_user_id=? AND followee_user_id=?) OR (follower_user_id=? AND followee_user_id=?)',
      [a, b, b, a],
    );
  } catch (e) {
    if (e.code !== 'ER_NO_SUCH_TABLE') throw e;
  }
}
export async function publicProfile({ user, id, input = {}, env = process.env, db = pool }) {
  await access(db, user, { env });
  const row = await publicProfileRow(db, id, user?.id || '');
  const { profile, unlocked } = await buildProfilePayload({
    db,
    author: await loadCommunityProfileAuthor({ userId: row.id, db }),
    avatarPath: `/api/community/profiles/${id}/avatar`,
    locale: input.locale === 'en-US' ? 'en-US' : 'zh-CN',
  });
  const followed = user?.id
    ? await first(db, 'SELECT 1 AS yes FROM community_follows WHERE follower_user_id=? AND followee_user_id=?', [
        user.id,
        row.id,
      ])
    : null;
  const muted = user?.id
    ? await first(db, 'SELECT 1 AS yes FROM community_user_mutes WHERE user_id=? AND target_user_id=?', [
        user.id,
        row.id,
      ])
    : null;
  const summary = input.summary === 'true';
  const page = summary ? { items: [], nextCursor: null } : await listPosts({ user, input: { author: id }, env, db });
  const featuredPostItems = (
    await Promise.all(
      (summary ? [] : parseJson(row.featured_posts) || []).map(async (postId) => {
        try {
          const p = await postDetail({ user, id: postId, env, db });
          return p.author.userPublicId === id ? p : null;
        } catch (e) {
          if (e.status === 404) return null;
          throw e;
        }
      }),
    )
  ).filter(Boolean);
  return {
    ...profile,
    followerCount: await relationCount(db, row.id, user?.id || '', true),
    followingCount: await relationCount(db, row.id, user?.id || '', false),
    allAchievements: unlocked.map(({ key, group }) => ({ key, group })),
    featuredPostItems,
    userPublicId: id,
    communityId: row.community_id,
    interests: parseJson(row.interests) || [],
    featuredPosts: parseJson(row.featured_posts) || [],
    following: Boolean(followed),
    muted: Boolean(muted),
    isOwn: row.id === user?.id,
    posts: page,
  };
}

async function relationCount(db, targetId, viewer, followers) {
  const field = followers ? 'follower_user_id' : 'followee_user_id',
    owner = followers ? 'followee_user_id' : 'follower_user_id';
  const row = await first(
    db,
    `SELECT COUNT(*) AS count FROM community_follows f JOIN user u ON u.id=f.${field} AND u.del_flag='0' AND u.role<>'visitor' JOIN community_chat_user_identities i ON i.user_id=u.id LEFT JOIN community_profile_options o ON o.user_id=u.id WHERE f.${owner}=?  AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=u.id AND m.status='banned') AND NOT EXISTS(SELECT 1 FROM community_chat_blocks b WHERE (b.user_id=? AND b.blocked_user_id=u.id) OR (b.blocked_user_id=? AND b.user_id=u.id))`,
    [targetId, viewer, viewer],
  );
  return Number(row.count);
}

export async function relationList({ user, input, env = process.env, db = pool }) {
  await access(db, user, { env });
  const target = await publicProfileRow(db, input.userPublicId, user?.id || ''),
    { limit } = pageOptions(input),
    viewer = user?.id || '';
  const followers = input.kind === 'followers';
  if (!followers && input.kind !== 'following') fail('COMMUNITY_INVALID_INPUT');
  const field = followers ? 'follower_user_id' : 'followee_user_id',
    where = followers ? 'followee_user_id' : 'follower_user_id';
  if (input.after) publicId(input.after);
  const [rows] = await db.query(
    `SELECT i.public_id AS userPublicId,i.community_id AS communityId,1 AS profileEnabled,COALESCE(NULLIF(u.alias,''),'成员') AS name FROM community_follows f JOIN user u ON u.id=f.${field} AND u.del_flag='0' JOIN community_chat_user_identities i ON i.user_id=u.id LEFT JOIN community_profile_options o ON o.user_id=u.id WHERE f.${where}=?  AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=u.id AND m.status='banned') AND NOT EXISTS(SELECT 1 FROM community_chat_blocks b WHERE (b.user_id=? AND b.blocked_user_id=u.id) OR (b.blocked_user_id=? AND b.user_id=u.id)) ${input.after ? 'AND i.public_id>?' : ''} ORDER BY i.public_id LIMIT ?`,
    [target.id, viewer, viewer, ...(input.after ? [input.after] : []), limit + 1],
  );
  return { items: rows.slice(0, limit), nextCursor: rows.length > limit ? rows[limit - 1].userPublicId : null };
}
export async function members({ user, input = {}, env = process.env, db = pool }) {
  await access(db, user, { env });
  const q = String(input.q || '').trim();
  if (!q || Array.from(q).length > 40) return { items: [] };
  const viewer = user?.id || '';
  const pattern = '%' + q.replace(/[=%_]/g, (c) => '=' + c) + '%';
  const [items] = await db.query(
    `SELECT i.public_id AS userPublicId,i.community_id AS communityId,COALESCE(NULLIF(u.alias,''),'成员') AS name FROM community_chat_user_identities i JOIN user u ON u.id=i.user_id AND u.del_flag='0' AND u.role<>'visitor' LEFT JOIN community_profile_options o ON o.user_id=u.id WHERE (CONVERT(u.alias USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '=' OR CONVERT(i.community_id USING utf8mb4) COLLATE utf8mb4_unicode_ci LIKE ? ESCAPE '=') AND NOT EXISTS(SELECT 1 FROM community_chat_members m WHERE m.user_id=u.id AND m.status='banned') AND NOT EXISTS(SELECT 1 FROM community_chat_blocks b WHERE (b.user_id=? AND b.blocked_user_id=u.id) OR (b.blocked_user_id=? AND b.user_id=u.id)) ORDER BY i.public_id LIMIT 20`,
    [pattern, pattern, viewer, viewer],
  );
  return { items };
}
