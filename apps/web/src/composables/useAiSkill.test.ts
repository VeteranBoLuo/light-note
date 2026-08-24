import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeAiSkill = vi.hoisted(() => vi.fn());

vi.mock('@/api/aiSkillApi', () => ({
  createAiSkillRequest: (value: Record<string, unknown>) => value,
  executeAiSkill,
}));

const { useAiSkill } = await import('./useAiSkill');

function result(threadId: string | null) {
  return {
    protocolVersion: 1,
    requestId: 'request-id',
    skillId: 'file.ask',
    skillVersion: 1,
    status: 'completed',
    threadId,
    scopeDigest: null,
    result: { kind: 'text', content: 'ok' },
    sources: [],
    coverage: null,
    availableActions: [],
    receipt: null,
    error: null,
  };
}

describe('useAiSkill', () => {
  beforeEach(() => vi.clearAllMocks());

  it('只在相同材料范围内延续 thread，切换材料后不会串用旧历史', async () => {
    executeAiSkill
      .mockResolvedValueOnce(result('thread-file-a'))
      .mockResolvedValueOnce(result('thread-file-a'))
      .mockResolvedValueOnce(result('thread-file-b'))
      .mockResolvedValueOnce(result('thread-file-a'));
    const skill = useAiSkill({ skillId: 'file.ask', surface: 'file.preview' });
    const fileA = [{ type: 'file', id: 'file-a', version: 'v1' }] as const;
    const fileB = [{ type: 'file', id: 'file-b', version: 'v1' }] as const;

    await skill.execute({ question: '第一问' }, fileA);
    await skill.execute({ question: '继续' }, fileA);
    await skill.execute({ question: '另一个文件' }, fileB);
    await skill.execute({ question: '回到第一个文件' }, fileA);

    expect(executeAiSkill.mock.calls.map(([request]) => request.threadId)).toEqual([
      null,
      'thread-file-a',
      null,
      'thread-file-a',
    ]);
  });

  it('reset 默认清空所有材料范围的短期线程', async () => {
    executeAiSkill.mockResolvedValueOnce(result('thread-file-a')).mockResolvedValueOnce(result('thread-file-a-new'));
    const skill = useAiSkill({ skillId: 'file.ask', surface: 'file.preview' });
    const refs = [{ type: 'file', id: 'file-a' }] as const;

    await skill.execute({ question: '第一问' }, refs);
    skill.reset();
    await skill.execute({ question: '重新开始' }, refs);

    expect(executeAiSkill.mock.calls.map(([request]) => request.threadId)).toEqual([null, null]);
  });
});
