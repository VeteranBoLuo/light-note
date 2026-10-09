import { describe, expect, it } from 'vitest';
import { pureTextReviewEligible, reviewEnabled, reviewDailyBudget } from './reviewPolicy.js';
import { currentReviewTarget } from './reviewWorker.js';
describe('pure-text review boundary', () => {
  it.each(['普通文字', '**强调**和列表\n- 内容', '[参考](https://example.com)', '`<img>` 是代码', '😀'.repeat(4000)])(
    'accepts complete textual content',
    (body) => {
      expect(pureTextReviewEligible({ body })).toBe(true);
    },
  );
  it.each([
    '![图片](https://example.com/a.png)',
    '<img src="a">',
    '<iframe src="a"></iframe>',
    '[文件](attachment:123)',
    '![x][img]\n\n[img]: https://example.com/a.png',
    'a'.repeat(4001),
    '',
  ])('rejects incomplete/media/non-web content', (body) => {
    expect(pureTextReviewEligible({ body })).toBe(false);
  });
  it('rejects resource snapshots and images regardless of ordinary prose', () => {
    expect(pureTextReviewEligible({ body: '正常', resources: ['id'] })).toBe(false);
    expect(pureTextReviewEligible({ body: '正常', images: ['id'] })).toBe(false);
  });
  it('defaults off and rejects malformed budgets', () => {
    expect(reviewEnabled({})).toBe(false);
    expect(reviewDailyBudget({})).toBe(300000);
    for (const value of ['oops', '-1', '1.5'])
      expect(reviewDailyBudget({ COMMUNITY_AI_REVIEW_DAILY_BUDGET_TOKENS: value })).toBe(0);
  });
  it('does not let a superseded or withdrawn revision publish', () => {
    const post = { pending_revision_id: 1, revision_status: 'pending_review', status: 'pending_review' };
    expect(currentReviewTarget(post, { revision_id: 1 })).toBe(true);
    expect(currentReviewTarget(post, { revision_id: 2 })).toBe(false);
    for (const status of ['withdrawn', 'removed', 'deleted'])
      expect(currentReviewTarget({ ...post, status }, { revision_id: 1 })).toBe(false);
  });
});
