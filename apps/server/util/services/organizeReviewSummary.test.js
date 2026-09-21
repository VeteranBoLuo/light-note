import { expect, it, vi } from 'vitest';
import { summarizePendingOrganizeReview } from './organizeReviewSummary.js';
import { visibleOrganizeRunOrderSql } from './organizeSuggestionAvailability.js';

it('只统计整理页当前一轮，并将审核入口绑定同一任务', async () => {
  const query = vi.fn()
    .mockResolvedValueOnce([[{ id: 'current-run' }]])
    .mockResolvedValueOnce([[{ total: 3, revision: 'abc' }]])
    .mockResolvedValueOnce([[{ runId: 'current-run', resourceType: 'note' }]]);
  expect(await summarizePendingOrganizeReview({ query }, 'owner')).toEqual({
    total: 3,
    revision: 'current:current-run:abc',
    route: '/organize?issue=ai_suggestions&review=pending&runId=current-run&resourceType=note',
  });
  expect(query.mock.calls[0][0]).toContain(`ORDER BY ${visibleOrganizeRunOrderSql} LIMIT 1`);
  expect(query.mock.calls[0][1]).toEqual(['owner']);
  for (const [sql, params] of query.mock.calls.slice(1)) {
    expect(params).toEqual(['owner', 'current-run']);
    expect(sql).toContain('s.run_id=?');
    expect(sql).toContain('ar.del_flag=0');
    expect(sql).toContain("r.status<>'preview'");
  }
});

it('当前轮待审核为零时不回退到历史756条，也不把10项对象当作待审核', async () => {
  const query = vi.fn().mockImplementation(async (sql, params) => {
    if (sql.startsWith('SELECT id FROM')) return [[{ id: 'current-ten-items' }]];
    const currentOnly = sql.includes('s.run_id=?') && params[1] === 'current-ten-items';
    return [[{ total: currentOnly ? 0 : 756, revision: '0:0' }]];
  });
  expect(await summarizePendingOrganizeReview({ query }, 'owner')).toEqual({
    total: 0, revision: 'current:current-ten-items:0:0',
  });
  expect(query).toHaveBeenCalledTimes(2);
});

it('没有整理任务时返回零，不查询历史建议表', async () => {
  const query = vi.fn().mockResolvedValue([[]]);
  expect(await summarizePendingOrganizeReview({ query }, 'owner')).toEqual({ total: 0, revision: 'current:none' });
  expect(query).toHaveBeenCalledTimes(1);
});

it('新一轮同样没有待审核建议时仍更新事实版本', async () => {
  const summary = async (id) => summarizePendingOrganizeReview({
    query: vi.fn().mockResolvedValueOnce([[{ id }]]).mockResolvedValueOnce([[{ total: 0, revision: '0:0' }]]),
  }, 'owner');
  expect((await summary('first')).revision).not.toEqual((await summary('second')).revision);
});
