import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  identity: {
    actorUserId: 'root-1',
    subjectUserId: 'user-1',
    adminContextMode: 'maintain',
    adminContextId: 'context-1',
  },
  resolveIdentity: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  apply: vi.fn(),
  revalidate: vi.fn(),
  retry: vi.fn(),
  undo: vi.fn(),
}));

vi.mock('../util/common.js', () => ({
  resultData: (data = null, status = 200, msg = '') => ({ data, status, msg }),
}));

vi.mock('../util/agent/logSafety.js', () => ({ stableAgentErrorCode: () => 'AI_CHANGE_SET_FAILED' }));

vi.mock('../util/aiConversationService.js', () => ({
  resolveAiConversationIdentity: mocks.resolveIdentity,
}));

vi.mock('../util/aiChangeSetService.js', () => ({
  createAiChangeSet: mocks.create,
  listAiChangeSets: mocks.list,
  getAiChangeSet: mocks.get,
  updateAiChangeSet: mocks.update,
  applyAiChangeSet: mocks.apply,
  revalidateAiChangeSetRetry: mocks.revalidate,
  retryAiChangeSet: mocks.retry,
  undoAiChangeSet: mocks.undo,
}));

const { applyChangeSet, revalidateChangeSetRetry, retryChangeSet } = await import('./aiChangeSetHandle.js');

function response() {
  const res = {};
  res.status = vi.fn().mockReturnValue(res);
  res.send = vi.fn().mockReturnValue(res);
  return res;
}

describe('aiChangeSetHandle atomic retry', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveIdentity.mockReturnValue(mocks.identity);
    mocks.apply.mockResolvedValue({ id: 'set-1', status: 'applied' });
    mocks.revalidate.mockResolvedValue({ id: 'set-1', status: 'draft', retry: { state: 'ready' } });
    mocks.retry.mockResolvedValue({ id: 'set-1', status: 'applied' });
  });

  it('maps initial apply, authoritative revalidation and revision-bound retry without accepting owner fields', async () => {
    const req = {
      body: {
        changeSetId: 'set-1',
        selectedItemIds: ['item-1'],
        previewRevision: 7,
        actorUserId: 'attacker',
      },
      adminContext: { id: 'context-1', mode: 'maintain' },
    };

    await applyChangeSet(req, response());
    await revalidateChangeSetRetry(req, response());
    await retryChangeSet(req, response());

    expect(mocks.apply).toHaveBeenCalledWith(mocks.identity, 'set-1', ['item-1']);
    expect(mocks.revalidate).toHaveBeenCalledWith(mocks.identity, 'set-1');
    expect(mocks.retry).toHaveBeenCalledWith(mocks.identity, 'set-1', 7);
    expect(mocks.resolveIdentity).toHaveBeenCalledTimes(3);
  });

  it.each([applyChangeSet, revalidateChangeSetRetry, retryChangeSet])(
    'blocks readonly admin context before every resource-affecting retry handler',
    async (handler) => {
      const res = response();
      await handler(
        {
          body: { changeSetId: 'set-1', selectedItemIds: ['item-1'], previewRevision: 7 },
          adminContext: { id: 'context-1', mode: 'readonly' },
        },
        res,
      );

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.send).toHaveBeenCalledWith(
        expect.objectContaining({ data: { code: 'ADMIN_PREVIEW_READONLY' }, status: 403 }),
      );
    },
  );

  it('folds infrastructure failures to a stable public code and never returns raw details', async () => {
    mocks.retry.mockRejectedValue(
      Object.assign(new Error('database password=do-not-return'), { code: 'ER_PARSE_ERROR', status: 500 }),
    );
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = response();

    await retryChangeSet(
      {
        body: { changeSetId: 'set-1', previewRevision: 7 },
        adminContext: { id: 'context-1', mode: 'maintain' },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'AI_CHANGE_SET_FAILED' }, status: 500 }),
    );
    expect(JSON.stringify(res.send.mock.calls)).not.toContain('do-not-return');
    expect(JSON.stringify(logger.mock.calls)).not.toContain('do-not-return');
    logger.mockRestore();
  });

  it('preserves an explicitly public fail-closed schema code at 503', async () => {
    mocks.retry.mockRejectedValue(
      Object.assign(new Error('AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE: 请先完成数据库迁移'), {
        code: 'AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE',
        status: 503,
        isAiChangeError: true,
      }),
    );
    const logger = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const res = response();

    await retryChangeSet(
      {
        body: { changeSetId: 'set-1', previewRevision: 7 },
        adminContext: { id: 'context-1', mode: 'maintain' },
      },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.send).toHaveBeenCalledWith(
      expect.objectContaining({ data: { code: 'AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE' }, status: 503 }),
    );
    logger.mockRestore();
  });
});
