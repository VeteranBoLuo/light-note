import { describe, expect, it, vi } from 'vitest';
import searchAnswer from './searchAnswer.js';

const context = Object.freeze({
  identity: Object.freeze({ subjectUserId: 'user-1' }),
  resourceRefs: Object.freeze([{ type: 'note', id: 'note-1', version: 'version-1' }]),
});

describe('search.answer', () => {
  it('始终把明确选择的资源作为 allowlist 交给检索层', async () => {
    const searchPersonalKnowledge = vi.fn().mockResolvedValue({
      hits: [
        {
          sourceId: 'note:note-1',
          evidenceRef: 'ev-1',
          type: 'note',
          id: 'note-1',
          resourceVersion: 'version-1',
          title: '笔记',
          excerpt: '正文',
          locator: { value: '正文' },
          coverage: { complete: true },
        },
      ],
    });

    const prepared = await searchAnswer.prepare({
      input: { question: '它写了什么？', resourceTypes: ['note'] },
      context,
      dependencies: { searchPersonalKnowledge },
    });

    expect(searchPersonalKnowledge).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        scope: { types: ['note'], resourceIds: [{ type: 'note', id: 'note-1' }] },
      }),
    );
    expect(prepared.sources).toHaveLength(1);
    expect(prepared.messages[0].content).toContain('只能依据本轮证据');
  });

  it('零证据时确定性结束且不调用模型', async () => {
    const prepared = await searchAnswer.prepare({
      input: { question: '没有命中的问题', resourceTypes: [] },
      context: { ...context, resourceRefs: [] },
      dependencies: { searchPersonalKnowledge: vi.fn().mockResolvedValue({ hits: [] }) },
    });
    expect(prepared.modelCalled).toBe(false);
    expect(prepared.result.content).toContain('没有检索到');
  });
});
