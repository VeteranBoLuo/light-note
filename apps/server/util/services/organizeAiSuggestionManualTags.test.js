import { beforeEach, describe, expect, it, vi } from 'vitest';
const writes = vi.hoisted(() => ({ ensureTag: vi.fn(), insertResourceTagRelations: vi.fn() }));
vi.mock('./tagService.js', () => ({ ensureTag: writes.ensureTag }));
vi.mock('../resourceTags.js', () => ({ insertResourceTagRelations: writes.insertResourceTagRelations }));
import {
  acceptOrganizeAiSuggestion,
  organizeAiSuggestionServiceInternals as internals,
} from './organizeAiSuggestionService.js';

function fixture({ status = 'no_suggestion', changed = false, renamed = false } = {}) {
  const note = { id: 'n1', title: '笔记', type: 'html', content: '内容', revision: 1 };
  const suggestion = {
    id: 's1',
    batchId: 'b1',
    resourceType: 'note',
    resourceId: 'n1',
    resourceTitle: '笔记',
    status,
    sourceHash: internals.snapshotHash(
      'note',
      'n1',
      { title: note.title, content: note.content, noteType: note.type, revision: 1 },
      [],
    ),
    currentTags: '[]',
    recommendedTags: '[]',
  };
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn().mockResolvedValue(),
    release: vi.fn(),
    query: vi.fn(async (sql, params) => {
      if (sql.includes('organize_ai_tag_batches') && sql.includes('FOR UPDATE')) return [[{ id: 'b1' }]];
      if (sql.includes('organize_ai_tag_suggestions') && sql.includes('LIMIT 1 FOR UPDATE')) return [[suggestion]];
      if (sql.includes('FROM note WHERE id = ?')) return [[{ ...note, revision: changed ? 2 : 1 }]];
      if (sql.includes('SELECT id, name FROM tag')) return [[{ id: 't1', name: renamed ? '新名称' : '设计' }]];
      if (sql.includes('SELECT tag_id FROM resource_tag_relations')) return [[]];
      if (sql.includes("SET status = 'accepted'")) {
        suggestion.status = 'accepted';
        suggestion.acceptedTags = params[0];
        return [{ affectedRows: 1 }];
      }
      if (sql.includes("SET status = 'conflict'")) {
        suggestion.status = 'conflict';
        return [{ affectedRows: 1 }];
      }
      if (sql.includes('SELECT id, status FROM organize_ai_tag_suggestions'))
        return [[{ id: 's1', status: suggestion.status }]];
      if (sql.includes('UPDATE organize_ai_tag_batches')) return [{ affectedRows: 1 }];
      throw new Error(`unexpected sql: ${sql}`);
    }),
  };
  return { connection, database: { getConnection: vi.fn().mockResolvedValue(connection) } };
}
const input = { userId: 'u1', batchId: 'b1', suggestionId: 's1' };
beforeEach(() => {
  vi.clearAllMocks();
  writes.ensureTag.mockResolvedValue({ id: 't2', name: '新标签' });
});

describe('无 AI 建议的手动标签保存', () => {
  it('已有标签和新标签在同一事务内保存，标记手动来源并更新审核终态', async () => {
    const { database, connection } = fixture();
    const tags = [
      { id: 't1', name: '设计' },
      { id: null, name: '新标签' },
    ];
    await expect(acceptOrganizeAiSuggestion(database, { ...input, tags })).resolves.toMatchObject({
      status: 'accepted',
      acceptedTags: [
        { id: 't1', name: '设计' },
        { id: 't2', name: '新标签' },
      ],
    });
    expect(writes.ensureTag).toHaveBeenCalledExactlyOnceWith({ userId: 'u1', name: '新标签', connection });
    expect(writes.insertResourceTagRelations).toHaveBeenCalledWith(
      connection,
      expect.objectContaining({ source: 'manual', tagIds: ['t1', 't2'] }),
    );
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.find(([sql]) => sql.includes("SET status = 'accepted'"))[0]).toContain(
      "status IN ('pending', 'no_suggestion')",
    );
    await acceptOrganizeAiSuggestion(database, { ...input, tags });
    expect(writes.ensureTag).toHaveBeenCalledOnce();
  });
  it.each(['no_suggestion', 'ignored', 'conflict', 'queued', 'running'])(
    '%s 不得通过无参数接受写标签',
    async (status) => {
      const { database } = fixture({ status });
      await expect(acceptOrganizeAiSuggestion(database, input)).rejects.toMatchObject({
        code: 'ORGANIZE_AI_SUGGESTION_NOT_EDITABLE',
      });
      expect(writes.insertResourceTagRelations).not.toHaveBeenCalled();
    },
  );
  it.each([
    { changed: true, code: 'ORGANIZE_AI_RESOURCE_CHANGED' },
    { renamed: true, code: 'ORGANIZE_AI_RECOMMENDATION_STALE' },
  ])('资料或所选标签变化时不静默覆盖: $code', async ({ code, ...options }) => {
    const { database, connection } = fixture(options);
    await expect(
      acceptOrganizeAiSuggestion(database, { ...input, tags: [{ id: 't1', name: '设计' }] }),
    ).rejects.toMatchObject({ code });
    expect(writes.ensureTag).not.toHaveBeenCalled();
    expect(writes.insertResourceTagRelations).not.toHaveBeenCalled();
    expect(connection.commit).toHaveBeenCalledOnce();
  });
  it('标签写入失败回滚，不留下已应用状态', async () => {
    const { database, connection } = fixture();
    writes.ensureTag.mockRejectedValueOnce(new Error('write failed'));
    await expect(
      acceptOrganizeAiSuggestion(database, { ...input, tags: [{ id: null, name: '新标签' }] }),
    ).rejects.toThrow('write failed');
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
