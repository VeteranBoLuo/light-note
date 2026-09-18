import { capabilities } from '../communityFeed/core.js';
import pool from '../../db/index.js';
import {
  communityCapabilities,
  parseCommunityAccountPreferences,
  readCommunityPreference,
} from '../communityPreferences.js';

function fail(code, status) {
  throw Object.assign(new Error(code), { code, status });
}
function requireMember(user) {
  if (!user?.id || !['user', 'root', 'test'].includes(user.role)) fail('COMMUNITY_LOGIN_REQUIRED', 403);
}
function result(preferences, feedEnabled = false) {
  return { ...readCommunityPreference(preferences), ...communityCapabilities(feedEnabled) };
}
export async function getCommunityPreferences({ user, db = pool, env = process.env }) {
  requireMember(user);
  const [[account]] = await db.query('SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1', [user.id]);
  if (!account) fail('COMMUNITY_ACCOUNT_UNAVAILABLE', 403);
  return result(account.preferences, (await capabilities({ db, env })).feedEnabled);
}
export async function updateCommunityPreferences({ user, input, db = pool, env = process.env }) {
  requireMember(user);
  if (
    !input ||
    Array.isArray(input) ||
    typeof input !== 'object' ||
    Object.keys(input).some((key) => !['defaultView', 'expectedRevision'].includes(key)) ||
    !['chat', 'feed'].includes(input.defaultView) ||
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0
  ) {
    fail('COMMUNITY_INVALID_PREFERENCE', 400);
  }
  const caps = await capabilities({ db, env });
  if (!communityCapabilities(caps.feedEnabled).availableViews.includes(input.defaultView))
    fail('COMMUNITY_VIEW_UNAVAILABLE', 409);
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const [[account]] = await connection.query(
      'SELECT preferences FROM user WHERE id = ? AND del_flag = 0 LIMIT 1 FOR UPDATE',
      [user.id],
    );
    if (!account) fail('COMMUNITY_ACCOUNT_UNAVAILABLE', 403);
    const current = readCommunityPreference(account.preferences);
    if (current.revision !== input.expectedRevision) fail('COMMUNITY_PREFERENCE_CONFLICT', 409);
    const preferences = parseCommunityAccountPreferences(account.preferences);
    preferences.communityNavigation = { defaultView: input.defaultView, revision: current.revision + 1 };
    await connection.query('UPDATE user SET preferences = ? WHERE id = ? AND del_flag = 0', [
      JSON.stringify(preferences),
      user.id,
    ]);
    await connection.commit();
    return result(preferences, caps.feedEnabled);
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
