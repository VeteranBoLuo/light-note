import { ensureNotVisitor, ensureUserOrAdminPolicy } from '../util/auth.js';
import { L, resultData } from '../util/common.js';
import { stableAgentErrorCode } from '../util/agent/logSafety.js';
import {
  actOnDailyReviewItem,
  actOnDailyReviewToday,
  DailyReviewError,
  ensureDailyReviewToday,
  getDailyReviewToday,
  visitorDailyReview,
} from '../util/services/dailyReviewService.js';

function dailyReviewErrorMessage(req, code) {
  const messages = {
    DAILY_REVIEW_ACTION_INVALID: L(req, '回顾动作无效', 'Invalid review action'),
    DAILY_REVIEW_SESSION_ACTION_INVALID: L(req, '今日回顾动作无效', 'Invalid daily review action'),
    DAILY_REVIEW_ITEM_REQUIRED: L(req, '缺少回顾条目', 'Review item is required'),
    DAILY_REVIEW_ITEM_NOT_FOUND: L(req, '今日回顾条目不存在', "Today's review item was not found"),
    DAILY_REVIEW_SESSION_NOT_FOUND: L(req, '今日回顾尚未生成', "Today's review has not been generated"),
    DAILY_REVIEW_RESOURCE_UNAVAILABLE: L(req, '这条内容已不可用', 'This content is no longer available'),
    DAILY_REVIEW_REASON_TAG_UNAVAILABLE: L(req, '关联标签已不可用', 'The related tag is no longer available'),
    DAILY_REVIEW_ITEM_ALREADY_PROCESSED: L(req, '这条内容已经处理', 'This item has already been processed'),
    DAILY_REVIEW_ITEM_STATE_CHANGED: L(
      req,
      '回顾状态已变化，请刷新后重试',
      'Review state changed. Refresh and try again.',
    ),
    DAILY_REVIEW_TODAY_SKIPPED: L(req, '今天的回顾已收起，请先恢复', "Today's review is hidden. Resume it first."),
    DAILY_REVIEW_CONCURRENT_STATE_LOST: L(req, '今日回顾生成冲突，请重试', 'Review generation conflicted. Try again.'),
  };
  return messages[code] || L(req, '每日回顾操作失败', 'Daily review operation failed');
}

function sendDailyReviewError(req, res, error, scene) {
  if (error instanceof DailyReviewError) {
    return res.send(resultData({ code: error.code }, error.status, dailyReviewErrorMessage(req, error.code)));
  }
  console.error('[daily-review] %s failed code=%s', scene, stableAgentErrorCode(error));
  return res.send(
    resultData(
      { code: 'DAILY_REVIEW_UNAVAILABLE' },
      500,
      L(req, '每日回顾暂时不可用，请稍后重试', 'Daily review is temporarily unavailable. Try again later.'),
    ),
  );
}

export async function getToday(req, res) {
  if (!req.user?.id || req.user.role === 'visitor') return res.send(resultData(visitorDailyReview()));
  if (!ensureUserOrAdminPolicy(req, res, ['read'])) return;
  try {
    return res.send(resultData(await getDailyReviewToday(req.user.id)));
  } catch (error) {
    return sendDailyReviewError(req, res, error, 'get-today');
  }
}

export async function ensureToday(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    return res.send(resultData(await ensureDailyReviewToday(req.user.id)));
  } catch (error) {
    return sendDailyReviewError(req, res, error, 'ensure-today');
  }
}

export async function actOnItem(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    return res.send(resultData(await actOnDailyReviewItem(req.user.id, req.params?.id, req.body?.action)));
  } catch (error) {
    return sendDailyReviewError(req, res, error, 'item-action');
  }
}

export async function actOnToday(req, res) {
  if (!ensureNotVisitor(req, res)) return;
  try {
    return res.send(resultData(await actOnDailyReviewToday(req.user.id, req.body?.action)));
  } catch (error) {
    return sendDailyReviewError(req, res, error, 'today-action');
  }
}
