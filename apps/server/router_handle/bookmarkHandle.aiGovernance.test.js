import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolGetConnection: vi.fn(),
  connectionQuery: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  summarizeBookmark: vi.fn(),
  runAiExecution: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.poolQuery, getConnection: mocks.poolGetConnection },
}));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, message = '') => ({ data, status, message }),
  snakeCaseKeys: (value) => value,
  mergeExistingProperties: (value) => value,
}));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note', BOOKMARK: 'bookmark' },
  insertTagResourceRelations: vi.fn(),
  replaceResourceTagRelations: vi.fn(),
  replaceTagResourceRelations: vi.fn(),
  validateEditableTagResources: vi.fn(),
  validateUserTags: vi.fn(),
  validateUserResources: vi.fn(),
}));
vi.mock('../util/auth.js', () => ({
  ensureNotVisitor: () => true,
  ensureUserOrAdminPolicy: () => true,
}));
vi.mock('../util/growth.js', () => ({ grantExp: vi.fn() }));
vi.mock('../util/snapshot.js', () => ({
  archiveBookmark: vi.fn(),
  getBookmarkSnapshot: vi.fn(),
  summarizeBookmark: mocks.summarizeBookmark,
}));
vi.mock('../util/linkHealth.js', () => ({
  getHealthSummary: vi.fn(),
  markLinkNormal: vi.fn(),
  startFullCheck: vi.fn(),
  resetHealth: vi.fn(),
}));
vi.mock('../util/resourceInbox.js', () => ({ attachPendingStatus: vi.fn(), removeInboxRelations: vi.fn() }));
vi.mock('../util/services/bookmarkService.js', () => ({
  createBookmark: vi.fn(),
  normalizeBookmarkUrl: (value) => value,
  shouldResetBookmarkIcon: vi.fn(),
}));
vi.mock('../util/services/tagService.js', () => ({ createTag: vi.fn() }));
vi.mock('../util/bookmarkUrl.js', () => ({
  BookmarkUrlError: class BookmarkUrlError extends Error {},
  bookmarkUrlErrorPayload: vi.fn(),
  inspectBookmarkUrl: vi.fn(),
  resolveBookmarkUrlForClient: vi.fn(),
}));
vi.mock('../util/personalKnowledgeSearch.js', () => ({ invalidatePersonalKnowledgeCache: vi.fn() }));
vi.mock('../util/aiExecution/service.js', () => ({ runAiExecution: mocks.runAiExecution }));

const { doSummarizeBookmark } =
  await import('./bookmarkHandle.js');

function response() {
  return {
    statusCode: 200,
    status(code) {
      this.statusCode = code;
      return this;
    },
    send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

describe('bookmark AI entry governance', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.runAiExecution.mockImplementation(async (_config, operation) => operation());
    mocks.poolGetConnection.mockResolvedValue({
      query: mocks.connectionQuery,
      beginTransaction: mocks.beginTransaction,
      commit: mocks.commit,
      rollback: mocks.rollback,
      release: mocks.release,
    });
  });

  it('书签摘要把真实 req 交给 Gateway，并把额度耗尽映射为 429', async () => {
    mocks.summarizeBookmark.mockResolvedValue({
      ok: false,
      reason: 'quota_exceeded',
      msg: '今日 AI 额度已用完，请明天再试',
    });
    const req = {
      body: { id: 'bookmark-1' },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doSummarizeBookmark(req, res);

    expect(mocks.summarizeBookmark).toHaveBeenCalledWith(
      'user-1',
      'bookmark-1',
      expect.objectContaining({
        force: false,
        persist: true,
        archiveIfMissing: false,
        signal: expect.any(AbortSignal),
        trace: expect.objectContaining({ taskType: 'bookmark_summary' }),
      }),
    );
    expect(mocks.runAiExecution).toHaveBeenCalledWith(
      expect.objectContaining({ request: req, billingPolicy: 'user', skillId: 'bookmark.summarize_page' }),
      expect.any(Function),
    );
    const executionConfig = mocks.runAiExecution.mock.calls[0][0];
    expect(executionConfig.resolveResultOutcome({ ok: false, reason: 'quota_exceeded' })).toEqual({
      status: 'quota_blocked',
      errorCode: 'AI_QUOTA_EXCEEDED',
    });
    expect(executionConfig.resolveResultOutcome({ ok: false, reason: 'ai_error' })).toEqual({
      status: 'failed',
      errorCode: 'AI_PROVIDER_ERROR',
    });
    expect(res.statusCode).toBe(429);
    expect(res.payload).toMatchObject({ status: 429, data: { reason: 'quota_exceeded' } });
  });

  it('管理员只读预览生成书签摘要时不写摘要缓存或补建网页归档', async () => {
    mocks.summarizeBookmark.mockResolvedValue({ ok: true, summary: '只读摘要', cached: false });
    const req = {
      body: { id: 'bookmark-1', force: true },
      user: { id: 'subject-1', role: 'user' },
      billingUser: { id: 'root-1', role: 'root' },
      adminContext: { id: 'ctx-1', mode: 'readonly' },
      adminCapability: { policy: 'ai_use', resourceType: 'bookmark' },
    };
    const res = response();

    await doSummarizeBookmark(req, res);

    expect(mocks.summarizeBookmark).toHaveBeenCalledWith(
      'subject-1',
      'bookmark-1',
      expect.objectContaining({
        force: true,
        persist: false,
        archiveIfMissing: false,
        signal: expect.any(AbortSignal),
        trace: expect.objectContaining({ taskType: 'bookmark_summary' }),
      }),
    );
    expect(res.payload).toMatchObject({ status: 200, data: { summary: '只读摘要' } });
  });
});
