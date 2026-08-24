import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  summarizeBookmark: vi.fn(),
  suggestTagsFromText: vi.fn(),
  suggestBookmarkMeta: vi.fn(),
  runAiExecution: vi.fn(),
}));

vi.mock('../db/index.js', () => ({ default: { query: mocks.poolQuery } }));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, message = '') => ({ data, status, message }),
  snakeCaseKeys: (value) => value,
  mergeExistingProperties: (value) => value,
  insertData: vi.fn(),
}));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note', BOOKMARK: 'bookmark' },
  insertResourceTagRelations: vi.fn(),
  insertTagResourceRelations: vi.fn(),
  replaceResourceTagRelations: vi.fn(),
  replaceTagResourceRelations: vi.fn(),
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
  checkBookmarkHealth: vi.fn(),
  getHealthSummary: vi.fn(),
  markLinkNormal: vi.fn(),
  startFullCheck: vi.fn(),
  resetHealth: vi.fn(),
}));
vi.mock('../util/aiOrganize.js', () => ({
  suggestBookmarkMeta: mocks.suggestBookmarkMeta,
  suggestTagsFromText: mocks.suggestTagsFromText,
  ORGANIZE_MAX_BATCH: 20,
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

const { doOrganizeQuote, doOrganizeRun, doSummarizeBookmark } = await import('./bookmarkHandle.js');

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

    expect(mocks.summarizeBookmark).toHaveBeenCalledWith('user-1', 'bookmark-1', {
      force: false,
      persist: true,
      archiveIfMissing: true,
      trace: expect.objectContaining({ taskType: 'bookmark_summary' }),
    });
    expect(mocks.runAiExecution).toHaveBeenCalledWith(
      expect.objectContaining({ request: req, billingPolicy: 'user', skillId: 'bookmark.summarize_page' }),
      expect.any(Function),
    );
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

    expect(mocks.summarizeBookmark).toHaveBeenCalledWith('subject-1', 'bookmark-1', {
      force: true,
      persist: false,
      archiveIfMissing: false,
      trace: expect.objectContaining({ taskType: 'bookmark_summary' }),
    });
    expect(res.payload).toMatchObject({ status: 200, data: { summary: '只读摘要' } });
  });

  it.each([
    ['AI_QUOTA_EXCEEDED', 429],
    ['AI_ACCESS_RESTRICTED', 403],
  ])('书签摘要统一映射根执行错误 %s', async (code, status) => {
    mocks.runAiExecution.mockRejectedValueOnce(Object.assign(new Error('internal'), { code }));
    const req = {
      body: { id: 'bookmark-1' },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doSummarizeBookmark(req, res);

    expect(res.statusCode).toBe(status);
    expect(res.payload).toMatchObject({ status, data: { code } });
  });

  it('批量整理只建立一个根执行，单条 Provider 失败时保留其余建议', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ id: 'tag-1', name: '已有标签' }]]).mockResolvedValueOnce([
      [
        { id: 'note-1', title: '笔记一', content: '正文一' },
        { id: 'note-2', title: '笔记二', content: '正文二' },
      ],
    ]);
    mocks.suggestTagsFromText
      .mockResolvedValueOnce({ matchedTagIds: ['tag-1'], newTags: [] })
      .mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'AI_QUOTA_EXCEEDED' }));
    const req = {
      body: { resourceType: 'note', ids: ['note-1', 'note-2'] },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeRun(req, res);

    expect(mocks.suggestTagsFromText).toHaveBeenCalledWith(
      expect.objectContaining({
        trace: expect.objectContaining({ taskType: 'organize_note_tags' }),
      }),
    );
    expect(mocks.runAiExecution).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      status: 200,
      data: { processed: 1, suggestions: [expect.objectContaining({ id: 'note-1' })] },
    });
  });

  it('根执行在访问 Provider 前发现额度耗尽时返回明确 429', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ id: 'tag-1', name: '已有标签' }]]).mockResolvedValueOnce([
      [{ id: 'note-1', title: '笔记一', content: '正文一' }],
    ]);
    mocks.runAiExecution.mockRejectedValueOnce(Object.assign(new Error('quota'), { code: 'AI_QUOTA_EXCEEDED' }));
    const req = {
      body: { resourceType: 'note', ids: ['note-1'] },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeRun(req, res);

    expect(mocks.suggestTagsFromText).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(429);
    expect(res.payload).toMatchObject({ status: 429, data: { ok: false, code: 'AI_QUOTA_EXCEEDED' } });
  });

  it('所选笔记预估只查询当前用户并在进入 IN 前去重、清洗和限批', async () => {
    const expectedIds = Array.from({ length: 20 }, (_, index) => `note-${index + 1}`);
    const requestedIds = [
      ' note-1 ',
      'note-1',
      '',
      null,
      ...Array.from({ length: 24 }, (_, index) => `note-${index + 2}`),
    ];
    mocks.poolQuery.mockResolvedValueOnce([[{ id: 'note-1' }, { id: 'note-20' }]]);
    const req = {
      body: { resourceType: 'note', scope: 'selected', ids: requestedIds },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeQuote(req, res);

    expect(mocks.poolQuery).toHaveBeenCalledTimes(1);
    expect(mocks.poolQuery).toHaveBeenCalledWith(
      expect.stringContaining('WHERE create_by = ? AND del_flag = 0 AND id IN (?)'),
      ['user-1', expectedIds],
    );
    expect(res.payload).toMatchObject({
      status: 200,
      data: {
        scope: 'selected',
        candidateTotal: 2,
        batchCap: 2,
        batchIds: ['note-1', 'note-20'],
        requestIds: expectedIds,
        requestedTotal: 25,
        requestTruncated: true,
      },
    });
  });

  it('空的所选范围返回空结果，不会退化成全库未打标签查询', async () => {
    const req = {
      body: { resourceType: 'note', scope: 'selected', ids: [] },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeQuote(req, res);

    expect(mocks.poolQuery).not.toHaveBeenCalled();
    expect(res.payload).toMatchObject({
      status: 200,
      data: {
        scope: 'selected',
        candidateTotal: 0,
        batchCap: 0,
        batchIds: [],
        requestIds: [],
        requestedTotal: 0,
        requestTruncated: false,
        canRun: false,
      },
    });
  });
});
