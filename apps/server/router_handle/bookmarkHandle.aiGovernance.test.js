import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  poolGetConnection: vi.fn(),
  connectionQuery: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
  insertData: vi.fn(),
  insertResourceTagRelations: vi.fn(),
  archiveAndSummarizeBookmark: vi.fn(),
  summarizeBookmark: vi.fn(),
  suggestTagsFromText: vi.fn(),
  suggestBookmarkMeta: vi.fn(),
  runAiExecution: vi.fn(),
}));

vi.mock('../db/index.js', () => ({
  default: { query: mocks.poolQuery, getConnection: mocks.poolGetConnection },
}));
vi.mock('../util/common.js', () => ({
  resultData: (data, status = 200, message = '') => ({ data, status, message }),
  snakeCaseKeys: (value) => value,
  mergeExistingProperties: (value) => value,
  insertData: mocks.insertData,
}));
vi.mock('../util/resourceTags.js', () => ({
  RESOURCE_TYPE: { NOTE: 'note', BOOKMARK: 'bookmark' },
  insertResourceTagRelations: mocks.insertResourceTagRelations,
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
  archiveAndSummarizeBookmark: mocks.archiveAndSummarizeBookmark,
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

const { doArchiveAndSummarizeBookmark, doOrganizeApply, doOrganizeQuote, doOrganizeRun, doSummarizeBookmark } =
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

  it('应用笔记建议时最多补到三个标签，且不会创建超出关联名额的新标签', async () => {
    mocks.connectionQuery.mockImplementation(async (sql) => {
      if (sql.includes('SELECT id, name FROM tag')) {
        return [
          [
            { id: 'tag-1', name: '标签一' },
            { id: 'tag-2', name: '标签二' },
          ],
        ];
      }
      if (sql.includes('SELECT id FROM note')) return [[{ id: 'note-1' }]];
      if (sql.includes('SELECT tag_id FROM resource_tag_relations')) {
        return [[{ tag_id: 'current-1' }, { tag_id: 'current-2' }]];
      }
      throw new Error(`unexpected query: ${sql}`);
    });
    const req = {
      body: {
        resourceType: 'note',
        items: [
          {
            id: 'note-1',
            tagIds: ['tag-1', 'tag-2'],
            newTagNames: ['不应创建'],
          },
        ],
      },
      user: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeApply(req, res);

    expect(mocks.insertResourceTagRelations).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        tagIds: ['tag-1'],
        resourceType: 'note',
        resourceId: 'note-1',
        source: 'ai',
      }),
    );
    expect(mocks.connectionQuery.mock.calls.some(([sql]) => sql.includes('INSERT INTO tag'))).toBe(false);
    expect(res.payload).toMatchObject({ status: 200, data: { applied: 1 } });
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

  it('网页存档合并动作通过单一根执行，并在只读上下文禁止归档与缓存', async () => {
    mocks.archiveAndSummarizeBookmark.mockResolvedValue({ ok: true, summary: '临时摘要', archiveOk: false });
    const req = {
      body: { id: 'bookmark-1' },
      user: { id: 'subject-1', role: 'user' },
      billingUser: { id: 'root-1', role: 'root' },
      adminContext: { id: 'ctx-1', mode: 'readonly' },
      adminCapability: { policy: 'ai_use', resourceType: 'bookmark' },
    };
    const res = response();

    await doArchiveAndSummarizeBookmark(req, res);

    expect(mocks.archiveAndSummarizeBookmark).toHaveBeenCalledWith(
      'subject-1',
      'bookmark-1',
      expect.objectContaining({
        persist: false,
        signal: expect.any(AbortSignal),
        trace: expect.objectContaining({ taskType: 'bookmark_archive_summary' }),
      }),
    );
    expect(mocks.runAiExecution).toHaveBeenCalledWith(
      expect.objectContaining({ taskType: 'bookmark_archive_summary', skillId: 'bookmark.summarize_page' }),
      expect.any(Function),
    );
    expect(res.payload).toMatchObject({ status: 200, data: { summary: '临时摘要' } });
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

  it('批量整理只建立一个根执行，额度不足时以 429 保留已经完成的建议', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ id: 'tag-1', name: '已有标签' }]]).mockResolvedValueOnce([
      [
        { id: 'note-1', title: '笔记一', content: '正文一' },
        { id: 'note-2', title: '笔记二', content: '正文二' },
      ],
    ]);
    mocks.suggestTagsFromText
      .mockResolvedValueOnce({ matchedTagIds: ['tag-1'], newTags: [] })
      .mockRejectedValueOnce(
        Object.assign(new Error('quota'), {
          code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
          requiredTokens: 857,
          availableTokens: 643,
        }),
      );
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
    expect(
      mocks.runAiExecution.mock.calls[0][0].resolveResultOutcome({
        quotaLimited: true,
        quotaErrorCode: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
        successfulItems: 1,
        failedItems: 0,
      }),
    ).toEqual({ status: 'quota_blocked', errorCode: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST' });
    expect(res.statusCode).toBe(429);
    expect(res.payload).toMatchObject({
      status: 429,
      data: {
        ok: false,
        code: 'AI_QUOTA_INSUFFICIENT_FOR_REQUEST',
        requiredTokens: 857,
        availableTokens: 643,
        processed: 1,
        suggestions: [expect.objectContaining({ id: 'note-1' })],
      },
    });
  });

  it('批量整理部分模型失败时保留可用建议，并把根账本分类为部分完成', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[{ id: 'tag-1', name: '已有标签' }]]).mockResolvedValueOnce([
      [
        { id: 'note-1', title: '笔记一', content: '正文一' },
        { id: 'note-2', title: '笔记二', content: '正文二' },
      ],
    ]);
    mocks.suggestTagsFromText
      .mockResolvedValueOnce({ matchedTagIds: ['tag-1'], newTags: [] })
      .mockRejectedValueOnce(new Error('provider failed'));
    const req = {
      body: { resourceType: 'note', ids: ['note-1', 'note-2'] },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeRun(req, res);

    const executionConfig = mocks.runAiExecution.mock.calls[0][0];
    expect(executionConfig.resolveResultOutcome({ successfulItems: 1, failedItems: 1 })).toEqual({
      status: 'partial',
      errorCode: 'AI_ORGANIZE_PARTIAL',
    });
    expect(res.statusCode).toBe(200);
    expect(res.payload).toMatchObject({
      status: 200,
      data: {
        ok: true,
        partial: true,
        failedItems: 1,
        processed: 1,
        suggestions: [expect.objectContaining({ id: 'note-1' })],
      },
    });
  });

  it('笔记打标签把标题、正文前段和正文中的标题提纲一起交给统一推荐器', async () => {
    mocks.poolQuery.mockResolvedValueOnce([[]]).mockResolvedValueOnce([
      [
        {
          id: 'note-outline',
          title: '长笔记',
          content: `<p>${'正文'.repeat(1300)}</p><h2>关键主题</h2><p>结论</p>`,
        },
      ],
    ]);
    mocks.suggestTagsFromText.mockResolvedValueOnce({ matchedTagIds: [], newTags: [] });
    const req = {
      body: { resourceType: 'note', ids: ['note-outline'] },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeRun(req, res);

    expect(mocks.suggestTagsFromText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining('内容提纲:关键主题'),
      }),
    );
    expect(mocks.suggestTagsFromText.mock.calls[0][0].text).toContain('正文摘录:正文');
    expect(res.payload).toMatchObject({ status: 200, data: { ok: true, suggestions: [] } });
  });

  it('批量整理全部模型失败时不谎报完成，并把根账本分类为失败', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce([[{ id: 'tag-1', name: '已有标签' }]])
      .mockResolvedValueOnce([[{ id: 'note-1', title: '笔记一', content: '正文一' }]]);
    mocks.suggestTagsFromText.mockRejectedValueOnce(new Error('provider failed'));
    const req = {
      body: { resourceType: 'note', ids: ['note-1'] },
      user: { id: 'user-1', role: 'user' },
      billingUser: { id: 'user-1', role: 'user' },
    };
    const res = response();

    await doOrganizeRun(req, res);

    const executionConfig = mocks.runAiExecution.mock.calls[0][0];
    expect(executionConfig.resolveResultOutcome({ successfulItems: 0, failedItems: 1 })).toEqual({
      status: 'failed',
      errorCode: 'AI_ORGANIZE_ALL_ITEMS_FAILED',
    });
    expect(res.statusCode).toBe(503);
    expect(res.payload).toMatchObject({
      status: 503,
      data: { ok: false, code: 'AI_ORGANIZE_ALL_ITEMS_FAILED', processed: 0, suggestions: [] },
    });
  });

  it('根执行在访问 Provider 前发现额度耗尽时返回明确 429', async () => {
    mocks.poolQuery
      .mockResolvedValueOnce([[{ id: 'tag-1', name: '已有标签' }]])
      .mockResolvedValueOnce([[{ id: 'note-1', title: '笔记一', content: '正文一' }]]);
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
