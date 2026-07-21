import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolQuery: vi.fn(),
  summarizeBookmark: vi.fn(),
  suggestTagsFromText: vi.fn(),
  suggestBookmarkMeta: vi.fn(),
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
vi.mock('../util/auth.js', () => ({ ensureNotVisitor: () => true }));
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

const { doOrganizeRun, doSummarizeBookmark } = await import('./bookmarkHandle.js');

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
      governance: { request: req, quotaPolicy: 'user', taskType: 'bookmark_summary' },
    });
    expect(res.statusCode).toBe(429);
    expect(res.payload).toMatchObject({ status: 429, data: { reason: 'quota_exceeded' } });
  });

  it('批量整理在额度耗尽时保留已完成建议并返回明确 429', async () => {
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
        governance: { request: req, quotaPolicy: 'user', taskType: 'organize_note_tags' },
      }),
    );
    expect(res.statusCode).toBe(429);
    expect(res.payload).toMatchObject({
      status: 429,
      data: { code: 'AI_QUOTA_EXCEEDED', processed: 1, suggestions: [expect.objectContaining({ id: 'note-1' })] },
    });
  });
});
