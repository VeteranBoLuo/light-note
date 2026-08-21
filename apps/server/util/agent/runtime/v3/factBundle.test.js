import { describe, expect, it } from 'vitest';
import { buildAgentFactBundle, buildPublicAgentFactBlocks, mergeAgentFactBundles } from './factBundle.js';

const capability = Object.freeze({
  id: 'note.query',
  label: '查询笔记',
  domains: ['note'],
  queryBudget: { maxInlineRefs: 50 },
  resultContract: { kind: 'entity_list', entityType: 'note' },
});

describe('Agent V3 FactBundle', () => {
  it('从统一结果契约投影精确计数、返回数和安全资源，不保存正文', () => {
    const bundle = buildAgentFactBundle({
      capability,
      toolRunId: 'tool-run-1',
      goalId: 'goal-1',
      result: {
        status: 'success',
        summary: '共 2 条笔记',
        sources: [
          { type: 'note', id: 'n1', title: '第一篇', content: '不能进入事实包' },
          { type: 'note', id: 'n2', title: '第二篇' },
        ],
        resultMetadata: {
          totalExact: true,
          totalCount: 2,
          returned: 2,
          complete: true,
          stableIdCoverage: 'complete',
          resolvedRanges: {},
        },
      },
    });

    expect(bundle.digest).toMatch(/^[0-9a-f]{64}$/u);
    expect(bundle.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'count', value: 2, exact: true }),
        expect.objectContaining({ kind: 'returned_count', value: 2, exact: true }),
        expect.objectContaining({
          kind: 'entity_list',
          value: [
            { type: 'note', id: 'n1', title: '第一篇' },
            { type: 'note', id: 'n2', title: '第二篇' },
          ],
        }),
      ]),
    );
    expect(JSON.stringify(bundle)).not.toContain('不能进入事实包');
  });

  it('partial 只记录已证明的返回量，不伪造精确总量', () => {
    const bundle = buildAgentFactBundle({
      capability,
      toolRunId: 'tool-run-2',
      result: {
        status: 'success',
        summary: '语义召回 3 条',
        sources: [],
        resultMetadata: { totalExact: false, returned: 3, partial: true, completeness: 'partial' },
      },
    });
    expect(bundle.facts.some((fact) => fact.kind === 'count')).toBe(false);
    expect(bundle.facts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: 'returned_count',
          value: 3,
          qualifiers: expect.objectContaining({ completeness: 'partial' }),
        }),
      ]),
    );
  });

  it('公开资源 URL 只接受无凭据的 http(s)，正文和危险协议不会进入事实包', () => {
    const bundle = buildAgentFactBundle({
      capability,
      toolRunId: 'tool-run-url',
      result: {
        status: 'success',
        sources: [
          { type: 'bookmark', id: 'b1', title: '安全链接', url: 'https://example.com/a_(b)' },
          { type: 'bookmark', id: 'b2', title: '带凭据', url: 'https://user:secret@example.com/private' },
          { type: 'bookmark', id: 'b3', title: '危险协议', url: 'javascript:alert(1)' },
        ],
        resultMetadata: { returned: 3, stableIdCoverage: 'complete' },
      },
    });
    const items = bundle.facts.find((fact) => fact.kind === 'entity_list').value;
    expect(items[0]).toMatchObject({ url: 'https://example.com/a_(b)' });
    expect(items[1]).not.toHaveProperty('url');
    expect(items[2]).not.toHaveProperty('url');
    expect(JSON.stringify(bundle)).not.toContain('secret');
  });

  it('合并后重新编号并只把 exact facts 投影为公开 fact block', () => {
    const first = buildAgentFactBundle({
      capability,
      toolRunId: 'tool-run-1',
      result: {
        status: 'success',
        summary: '无结果',
        sources: [],
        resultMetadata: { totalExact: true, totalCount: 0, returned: 0, complete: true },
      },
    });
    const merged = mergeAgentFactBundles([first, first]);
    expect(merged.facts.map((fact) => fact.id)).toEqual(['f1', 'f2', 'f3']);
    expect(buildPublicAgentFactBlocks(merged).every((block) => block.type === 'fact')).toBe(true);
    expect(buildPublicAgentFactBlocks(merged).some((block) => block.kind === 'tool_summary')).toBe(false);
  });
});
