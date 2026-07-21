import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: { actorUserId: 'actor-1', subjectUserId: 'subject-1', adminContextMode: 'normal' },
  resolveAiMemoryIdentity: vi.fn(),
  listAiMemories: vi.fn(),
  createAiMemoryCandidate: vi.fn(),
  confirmAiMemory: vi.fn(),
  updateAiMemory: vi.fn(),
  deleteAiMemory: vi.fn(),
  clearAiMemories: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));

vi.mock('../util/aiMemoryService.js', () => ({
  resolveAiMemoryIdentity: mocks.resolveAiMemoryIdentity,
  listAiMemories: mocks.listAiMemories,
  createAiMemoryCandidate: mocks.createAiMemoryCandidate,
  confirmAiMemory: mocks.confirmAiMemory,
  updateAiMemory: mocks.updateAiMemory,
  deleteAiMemory: mocks.deleteAiMemory,
  clearAiMemories: mocks.clearAiMemories,
}));

const { clearMemories, confirmMemory, createMemoryCandidate, listMemories, removeMemory, updateMemory } =
  await import('./aiMemoryHandle.js');

function response() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('aiMemoryHandle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAiMemoryIdentity.mockReturnValue(mocks.identity);
    mocks.listAiMemories.mockResolvedValue({ items: [], total: 0 });
    mocks.createAiMemoryCandidate.mockResolvedValue({ id: 'memory-1', status: 'candidate' });
    mocks.confirmAiMemory.mockResolvedValue({ id: 'memory-1', status: 'active' });
    mocks.updateAiMemory.mockResolvedValue({ id: 'memory-1', status: 'candidate' });
    mocks.deleteAiMemory.mockResolvedValue({ id: 'memory-1', deleted: 1 });
    mocks.clearAiMemories.mockResolvedValue({ cleared: 2 });
  });

  it('六个管理 handler 都使用统一三维身份并正确映射参数', async () => {
    const cases = [
      [listMemories, { body: { status: 'active' } }, mocks.listAiMemories, [mocks.identity, { status: 'active' }]],
      [
        createMemoryCandidate,
        { body: { content: '偏好' } },
        mocks.createAiMemoryCandidate,
        [mocks.identity, { content: '偏好' }],
      ],
      [confirmMemory, { body: { memoryId: 'memory-1' } }, mocks.confirmAiMemory, [mocks.identity, 'memory-1']],
      [
        updateMemory,
        { body: { memoryId: 'memory-1', patch: { content: '新偏好' } } },
        mocks.updateAiMemory,
        [mocks.identity, 'memory-1', { content: '新偏好' }],
      ],
      [removeMemory, { body: { memoryId: 'memory-1' } }, mocks.deleteAiMemory, [mocks.identity, 'memory-1']],
      [clearMemories, { body: {} }, mocks.clearAiMemories, [mocks.identity]],
    ];

    for (const [handler, req, service, expectedArgs] of cases) {
      const res = response();
      await handler(req, res);
      expect(service).toHaveBeenCalledWith(...expectedArgs);
      expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ status: 200 }));
    }
    expect(mocks.resolveAiMemoryIdentity).toHaveBeenCalledTimes(6);
  });

  it('createCandidate 不会隐式调用 confirm', async () => {
    const res = response();
    await createMemoryCandidate({ body: { content: '候选记忆', status: 'active' } }, res);
    expect(mocks.createAiMemoryCandidate).toHaveBeenCalledTimes(1);
    expect(mocks.confirmAiMemory).not.toHaveBeenCalled();
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { id: 'memory-1', status: 'candidate' }, status: 200 }),
    );
  });

  it('update 同时兼容 patch 包装和扁平 body', async () => {
    const res = response();
    await updateMemory({ body: { memoryId: 'memory-1', content: '扁平更新' } }, res);
    expect(mocks.updateAiMemory).toHaveBeenCalledWith(mocks.identity, 'memory-1', { content: '扁平更新' });

    await updateMemory({ body: { memoryId: 'memory-1', patch: { action: 'pause' } } }, res);
    expect(mocks.updateAiMemory).toHaveBeenLastCalledWith(mocks.identity, 'memory-1', { action: 'pause' });

    await updateMemory({ body: { memoryId: 'memory-1', status: 'active' } }, res);
    expect(mocks.updateAiMemory).toHaveBeenLastCalledWith(mocks.identity, 'memory-1', { status: 'active' });
  });

  it.each([
    [{ memoryId: 'memory-1', patch: [] }, 'AI_MEMORY_PATCH_INVALID'],
    [{ memoryId: 'memory-1', patch: { unknown: true } }, 'AI_MEMORY_PATCH_FIELD_INVALID'],
    [{ memoryId: 'memory-1', patch: { content: '包装更新' }, content: '扁平更新' }, 'AI_MEMORY_PATCH_AMBIGUOUS'],
  ])('拒绝无效或歧义的 update patch 契约', async (body, code) => {
    const res = response();
    await updateMemory({ body }, res);
    expect(mocks.updateAiMemory).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.send).toHaveBeenCalledWith(expect.objectContaining({ data: { code }, status: 400 }));
  });

  it('保留业务错误码并隐藏 500 级内部细节', async () => {
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const businessError = Object.assign(new Error('AI_MEMORY_SENSITIVE_CONTENT: 记忆包含敏感凭据'), {
      code: 'AI_MEMORY_SENSITIVE_CONTENT',
      status: 400,
    });
    mocks.createAiMemoryCandidate.mockRejectedValueOnce(businessError);
    const businessRes = response();
    await createMemoryCandidate({ body: { content: 'secret' } }, businessRes);
    expect(businessRes.status).toHaveBeenCalledWith(400);
    expect(businessRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'AI_MEMORY_SENSITIVE_CONTENT' }, msg: '记忆包含敏感凭据' }),
    );

    mocks.listAiMemories.mockRejectedValueOnce(
      Object.assign(new Error('database password leaked'), { code: 'ER_PARSE_ERROR' }),
    );
    const serverRes = response();
    await listMemories({ body: {} }, serverRes);
    expect(serverRes.status).toHaveBeenCalledWith(500);
    expect(serverRes.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'AI_MEMORY_FAILED' }, msg: 'AI 记忆服务暂时不可用，请稍后重试' }),
    );
    expect(errorLog).toHaveBeenCalledWith('[ai-memory] 请求失败:', 'AI_MEMORY_FAILED');
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('database password leaked');
    errorLog.mockRestore();
  });
});
