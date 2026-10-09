import { marked } from 'marked';
import { COMMUNITY_FEED_LIMITS, communityTextLength } from '@lightnote/shared/community-feed';

export const REVIEW_POLICY_VERSION = 1;
export const REVIEW_SYSTEM_ACTOR = 'system:community_review';
// Covers two complete inputs (including repair), Unicode and bounded tool output.
export const REVIEW_RESERVATION_TOKENS = 48000;
export function reviewEnabled(env = process.env) {
  return (
    env.COMMUNITY_AI_REVIEW_ENABLED === 'true' &&
    env.COMMUNITY_FEED_ENABLED === 'true' &&
    env.COMMUNITY_FEED_WRITES_ENABLED === 'true' &&
    env.COMMUNITY_FEED_WORKER_ENABLED === 'true'
  );
}
export function reviewDailyBudget(env = process.env) {
  const value = Number(env.COMMUNITY_AI_REVIEW_DAILY_BUDGET_TOKENS ?? 300000);
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
export function pureTextReviewEligible({ title = '', body, images = [], resources = [] } = {}) {
  if (
    typeof title !== 'string' ||
    typeof body !== 'string' ||
    !body.trim() ||
    communityTextLength(title) > COMMUNITY_FEED_LIMITS.title ||
    communityTextLength(body) > COMMUNITY_FEED_LIMITS.body ||
    !Array.isArray(images) ||
    images.length ||
    !Array.isArray(resources) ||
    resources.length
  )
    return false;
  try {
    let eligible = true;
    marked.walkTokens(marked.lexer(body), (token) => {
      // Raw HTML is conservatively manual, including unknown embeds. Code remains text.
      if (token.type === 'image' || token.type === 'html') eligible = false;
      if (token.type === 'link' && !/^https?:\/\//i.test(token.href || '')) eligible = false;
    });
    return eligible;
  } catch {
    return false;
  }
}
