import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ search: vi.fn() }));

vi.mock('../../../db/index.js', () => ({ default: {} }));
vi.mock('../../personalKnowledgeSearch.js', () => ({ searchPersonalKnowledge: mocks.search }));

import tool from './search_content.js';

describe('search_content evidence contract', () => {
  beforeEach(() => mocks.search.mockReset());
  it('returns claim-level evidence and discloses incomplete coverage', () => {
    const raw = {
      query: '结论',
      hits: [
        {
          sourceId: 'file:1',
          evidenceRef: 'ev_1',
          citationKey: '1',
          type: 'file',
          id: '1',
          title: 'report.pdf',
          excerpt: '支持结论的原文',
          locator: { type: 'page', value: '12' },
          target: { type: 'cloud-file', id: '1' },
          resourceVersion: 'v1',
          coverage: { coverageRatio: 0.75, truncated: true },
        },
      ],
    };
    const sources = tool.toSources(raw);
    expect(sources[0]).toMatchObject({ sourceId: 'file:1', evidenceRef: 'ev_1', locator: { value: '12' } });
    expect(tool.transform(raw)).toContain('[evidence:ev_1]');
    expect(tool.transform(raw)).toContain('覆盖约 75%');
    expect(tool.summarize(raw)).toContain('覆盖不完整');
  });

  it('uses the server-enforced selected-resource allowlist instead of model supplied resource ids', async () => {
    mocks.search.mockResolvedValue({ query: 'scope', hits: [], indexedChunks: 0 });
    await tool.execute(
      { keyword: 'scope', resourceIds: [{ type: 'note', id: 'outside' }] },
      {
        userId: 'user-1',
        agentContentScope: { mode: 'selected', resourceIds: [{ type: 'note', id: 'owned-selected' }] },
      },
    );
    expect(mocks.search).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scope: expect.objectContaining({ resourceIds: [{ type: 'note', id: 'owned-selected' }] }),
      }),
    );
  });

  it('未选材料时不收窄,按全库检索(产品决策:空选择=整个知识空间,而非空 allowlist 过滤成零结果)', async () => {
    mocks.search.mockResolvedValue({ query: 'scope', hits: [], indexedChunks: 0 });
    await tool.execute(
      { keyword: 'scope' },
      { userId: 'user-1', agentContentScope: { mode: 'selected', resourceIds: [] } },
    );
    // 不再下发空 allowlist;resourceIds 未收窄 → personalKnowledgeSearch 检索全部
    expect(mocks.search.mock.calls[0][0].scope.resourceIds).toBeUndefined();
  });
});
