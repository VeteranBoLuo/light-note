import { expect, it, vi } from 'vitest';
import { summarizePendingOrganizeReview } from './organizeReviewSummary.js';
it('新版跨任务待审核统计绑定账号并定位到包含建议的资源类型', async () => {
  const query = vi
    .fn()
    .mockResolvedValueOnce([[{ total: 3, revision: 'abc' }]])
    .mockResolvedValueOnce([[{ runId: 'older-run', resourceType: 'note' }]]);
  const result = await summarizePendingOrganizeReview({ query }, 'owner');
  expect(result).toEqual({
    total: 3,
    revision: 'abc',
    route: '/organize?issue=ai_suggestions&review=pending&runId=older-run&resourceType=note',
  });
  for (const [sql, params] of query.mock.calls) {
    expect(params).toEqual(['owner']);
    expect(sql).toContain('ar.del_flag=0');
    expect(sql).toContain("r.status<>'preview'");
    expect(sql).not.toContain('organize_ai_tag_suggestions');
  }
});
it('没有待审核结果时不生成任务定位', async () => {
  const query = vi.fn().mockResolvedValue([[{ total: 0, revision: '0:0' }]]);
  expect(await summarizePendingOrganizeReview({ query }, 'owner')).toEqual({ total: 0, revision: '0:0' });
  expect(query).toHaveBeenCalledTimes(1);
});
