import { describe, expect, it } from 'vitest';
import type { AiMemory } from '@/api/aiWorkspaceApi';
import { memoryReviewPeers } from './aiMemoryConflicts';

function memory(patch: Partial<AiMemory>): AiMemory {
  return {
    id: 'memory-1',
    scopeType: 'global',
    scope: {},
    memoryType: 'preference',
    content: 'Prefer concise answers',
    status: 'active',
    temporary: false,
    expireAt: null,
    expired: false,
    sourceConversationId: null,
    sourceMessageId: null,
    confirmedAt: '2026-07-19T00:00:00.000Z',
    lastUsedAt: null,
    createdAt: '2026-07-19T00:00:00.000Z',
    updatedAt: '2026-07-19T00:00:00.000Z',
    ...patch,
  };
}

describe('memoryReviewPeers', () => {
  it('只返回同范围同类型且内容不同的可复核记忆', () => {
    const target = memory({});
    const related = memory({ id: 'memory-2', content: 'Prefer detailed answers', status: 'candidate' });
    const duplicate = memory({ id: 'memory-3', content: '  prefer concise   answers ' });
    const otherScope = memory({
      id: 'memory-4',
      scopeType: 'conversation',
      scope: { conversationId: 'conversation-1' },
      content: 'Prefer detailed answers',
    });
    const expired = memory({ id: 'memory-5', content: 'Prefer examples', status: 'expired' });

    expect(memoryReviewPeers(target, [target, related, duplicate, otherScope, expired])).toEqual([related]);
  });

  it('稳定比较对象字段顺序并按最近更新时间排序、限量', () => {
    const target = memory({ scopeType: 'resource', scope: { resourceType: 'note', resourceId: 'n1' } });
    const older = memory({
      id: 'memory-2',
      scopeType: 'resource',
      scope: { resourceId: 'n1', resourceType: 'note' },
      content: 'Older',
      updatedAt: '2026-07-18T00:00:00.000Z',
    });
    const newer = memory({
      id: 'memory-3',
      scopeType: 'resource',
      scope: { resourceType: 'note', resourceId: 'n1' },
      content: 'Newer',
      updatedAt: '2026-07-20T00:00:00.000Z',
    });
    expect(memoryReviewPeers(target, [older, newer], 1).map((item) => item.id)).toEqual(['memory-3']);
  });
});
