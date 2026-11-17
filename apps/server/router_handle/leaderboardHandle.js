import { L, resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import { canViewLeaderboard, getLeaderboardConfig, LEADERBOARD_TYPES, leaderboardOpen } from '../util/leaderboardPolicy.js';
import { isPointsAudienceAccount } from '../util/pointsAudienceEligibility.js';
import { sendProfileAvatar } from '../util/profileAvatarResponse.js';
import { readLeaderboard, readLeaderboardAvatar } from '../util/services/leaderboardRead.js';

function available(req, res, config, now) {
  res.set('Cache-Control', 'private, no-store');
  if (!canViewLeaderboard(req)) {
    res.status(403).send(resultData({ code: 'LEADERBOARD_ACCOUNT_UNAVAILABLE' }, 403,
      L(req, '当前账号暂不能查看排行榜', 'This account cannot view the leaderboard')));
    return false;
  }
  if (!leaderboardOpen(config, now)) {
    res.status(404).send(resultData({ code: 'LEADERBOARD_NOT_OPEN' }, 404,
      L(req, '排行榜暂未开放', 'The leaderboard is not open yet')));
    return false;
  }
  return true;
}

function failed(req, res, error) {
  console.error('[leaderboard] request failed code=%s', stableAgentErrorCode(error));
  return res.status(500).send(resultData({ code: 'LEADERBOARD_LOAD_FAILED' }, 500,
    L(req, '榜单加载失败，请重试', 'Could not load the leaderboard. Try again.')));
}

export async function getLeaderboard(req, res) {
  try {
    const config = getLeaderboardConfig();
    const now = new Date();
    if (!available(req, res, config, now)) return;
    const board = req.query.board ?? 'week';
    const period = req.query.period ?? 'current';
    if (!LEADERBOARD_TYPES.includes(board) || (period !== 'current' && (period !== 'previous' || board !== 'week'))) {
      return res.status(400).send(resultData({ code: 'LEADERBOARD_FILTER_INVALID' }, 400,
        L(req, '榜单或期次无效', 'Invalid leaderboard or period')));
    }
    const participantId = isPointsAudienceAccount(req.user) ? req.user.id : null;
    return res.send(resultData(await readLeaderboard(participantId, board, period === 'previous', { config, now })));
  } catch (error) {
    return failed(req, res, error);
  }
}

export async function getLeaderboardAvatar(req, res) {
  try {
    if (!available(req, res, getLeaderboardConfig(), new Date())) return;
    const source = await readLeaderboardAvatar(req.params.communityId);
    return sendProfileAvatar(req, res, source, { notFoundCode: 'LEADERBOARD_AVATAR_UNAVAILABLE', cacheControl: 'private, no-cache' });
  } catch (error) {
    return failed(req, res, error);
  }
}
