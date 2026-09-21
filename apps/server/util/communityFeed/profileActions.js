import { access, capabilities, feature, first, pairAllowed } from './core.js';

const readinessByDatabase = new WeakMap();
const READINESS_TTL_MS = 30_000;

async function actionsAvailable(db, env) {
  // Feature switches remain immediate; only positive schema readiness is reusable.
  if (!feature(env).enabled) return false;
  let state = readinessByDatabase.get(db);
  if (!state) {
    state = { readyUntil: 0, pending: null };
    readinessByDatabase.set(db, state);
  }
  if (Date.now() < state.readyUntil) return true;
  if (!state.pending) {
    state.pending = capabilities({ env, db })
      .then((caps) => {
        state.readyUntil = caps.feedEnabled ? Date.now() + READINESS_TTL_MS : 0;
        return Boolean(caps.feedEnabled);
      })
      .finally(() => {
        state.pending = null;
      });
  }
  return state.pending;
}

// Reuse feed access rules without rebuilding achievements, counts or the public profile.
export async function communityProfileActions({ user, authorUserId, env = process.env, db }) {
  if (!(await actionsAvailable(db, env))) return null;
  try {
    await access(db, user, { env });
    const viewerId = user?.role !== 'visitor' ? user?.id || '' : '';
    if (!(await pairAllowed(db, viewerId, authorUserId))) return null;
    const followed =
      viewerId && viewerId !== authorUserId
        ? await first(db, 'SELECT 1 AS yes FROM community_follows WHERE follower_user_id=? AND followee_user_id=?', [
            viewerId,
            authorUserId,
          ])
        : null;
    return { isOwn: viewerId === authorUserId, following: Boolean(followed) };
  } catch (error) {
    if ([403, 404, 503].includes(error.status)) return null;
    throw error;
  }
}
