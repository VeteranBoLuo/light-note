import { beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({ getConnection: vi.fn(), query: vi.fn() }));

vi.mock('../db/index.js', () => ({ default: dbMock }));

import { __testing, invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

describe('personal knowledge lexical index', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('indexes later sections instead of silently keeping only the document prefix', () => {
    const prefix = Array.from({ length: 80 }, (_, index) => `前置说明 ${index}，这是普通背景内容。`).join('\n');
    const documents = __testing.chunkResource({
      userId: 'user-1',
      resourceType: 'note',
      resourceId: 'note-1',
      version: 'v1',
      title: '长文档',
      content: `${prefix}\n## 最终结论\n稀有代号“霜叶协议”只出现在文档最后一节。`,
      contentType: 'markdown',
      target: { type: 'note-detail', id: 'note-1' },
    });
    const bundle = __testing.buildBundle(documents);
    const results = bundle.index.search('霜叶协议', { combineWith: 'AND' });
    expect(documents.length).toBeGreaterThan(1);
    expect(results[0]).toMatchObject({ resourceId: 'note-1', sectionTitle: '最终结论' });
  });

  it('tokenizes Chinese bigrams and English words for bilingual retrieval', () => {
    const terms = __testing.tokenize('Light Note 支持知识检索');
    expect(terms).toContain('light');
    expect(terms).toContain('知识');
    expect(terms).toContain('检索');
  });

  it('extracts evidence around the matching passage', () => {
    const excerpt = __testing.excerptAround(`${'开头'.repeat(500)}关键证据在这里${'结尾'.repeat(500)}`, '关键证据', 30);
    expect(excerpt).toContain('关键证据在这里');
    expect(excerpt.startsWith('…')).toBe(true);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('treats an explicit empty resource allowlist as deny-all', () => {
    const scope = __testing.normalizeScope({ resourceIds: [] });
    expect(scope.resourceIds).toBeInstanceOf(Set);
    expect(scope.resourceIds.size).toBe(0);
  });

  it('weights an owned resource tag as searchable context', () => {
    const tagged = __testing.chunkResource({
      userId: 'user-1',
      resourceType: 'note',
      resourceId: 'note-tagged',
      version: 'v1',
      title: '普通笔记',
      content: '这是一段不包含查询词的正文。',
      contentType: 'markdown',
      target: { type: 'note-detail', id: 'note-tagged' },
      tagNames: ['北极星计划'],
    });
    const untagged = __testing.chunkResource({
      userId: 'user-1',
      resourceType: 'note',
      resourceId: 'note-untagged',
      version: 'v1',
      title: '另一篇笔记',
      content: '普通正文。',
      contentType: 'markdown',
      target: { type: 'note-detail', id: 'note-untagged' },
    });

    const results = __testing.buildBundle([...untagged, ...tagged]).index.search('北极星计划', {
      boost: { title: 5, tags: 3.5, sectionTitle: 2.5, content: 1 },
      combineWith: 'OR',
    });

    expect(results[0]).toMatchObject({ resourceId: 'note-tagged', tags: '北极星计划' });
  });

  it('physically removes inactive private chunks after a successful rebuild', async () => {
    const query = vi.fn().mockResolvedValue([{}]);
    const connection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      query,
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
    };
    dbMock.getConnection.mockResolvedValue(connection);

    await __testing.persistChunks('user-1', []);

    expect(query).toHaveBeenNthCalledWith(1, 'UPDATE ai_content_chunks SET active = 0 WHERE subject_user_id = ?', [
      'user-1',
    ]);
    expect(query).toHaveBeenNthCalledWith(2, 'DELETE FROM ai_content_chunks WHERE subject_user_id = ? AND active = 0', [
      'user-1',
    ]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(connection.release).toHaveBeenCalledOnce();
  });

  it('业务写入失效发生在持久化途中时回滚旧快照，不把旧正文重新写回', async () => {
    const connection = {
      beginTransaction: vi.fn(async () => invalidatePersonalKnowledgeCache('user-race')),
      query: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
    };
    dbMock.getConnection.mockResolvedValue(connection);

    const result = await __testing.persistChunks('user-race', [], 0);

    expect(result).toEqual({ persisted: false, stale: true });
    expect(connection.query).not.toHaveBeenCalled();
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.commit).not.toHaveBeenCalled();
  });

  it('资源变更可直接物理清除该用户的持久分块镜像，缺表时安全跳过', async () => {
    dbMock.query.mockResolvedValueOnce([{ affectedRows: 4 }]);
    await expect(__testing.purgePersonalKnowledgeChunks('user-1', dbMock)).resolves.toEqual({
      deleted: 4,
      skipped: false,
    });
    expect(dbMock.query).toHaveBeenCalledWith('DELETE FROM ai_content_chunks WHERE subject_user_id = ?', ['user-1']);

    dbMock.query.mockRejectedValueOnce(Object.assign(new Error('missing'), { code: 'ER_NO_SUCH_TABLE' }));
    await expect(__testing.purgePersonalKnowledgeChunks('user-1', dbMock)).resolves.toEqual({
      deleted: 0,
      skipped: true,
    });
  });

  it('跨实例失效在同一事务递增数据库代际并清空旧私密分块', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([{ affectedRows: 7 }]),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(__testing.advancePersistentGenerationAndPurge('user-shared', database)).resolves.toEqual({
      generationAdvanced: true,
      deleted: 7,
      skipped: false,
    });

    expect(connection.query.mock.calls[0][0]).toContain('INSERT INTO ai_content_generations');
    expect(connection.query.mock.calls[0][0]).toContain('generation = generation + 1');
    expect(connection.query.mock.calls[1]).toEqual([
      'DELETE FROM ai_content_chunks WHERE subject_user_id = ?',
      ['user-shared'],
    ]);
    expect(connection.commit).toHaveBeenCalledOnce();
    expect(connection.rollback).not.toHaveBeenCalled();
  });

  it('旧实例在持久化前发现数据库代际已变化会回滚，且权威资源复核会删除已移除命中', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi
        .fn()
        .mockResolvedValueOnce([{ affectedRows: 1 }])
        .mockResolvedValueOnce([[{ generation: 2 }]]),
    };
    dbMock.getConnection.mockResolvedValue(connection);
    const staleDocuments = __testing.chunkResource({
      userId: 'user-race-db',
      resourceType: 'note',
      resourceId: 'deleted-note',
      version: '2026-07-19T00:00:00.000Z',
      title: '已删除笔记',
      content: '不应重新持久化的私密正文',
      contentType: 'markdown',
      target: { type: 'note-detail', id: 'deleted-note' },
    });

    await expect(__testing.persistChunks('user-race-db', staleDocuments, 0, 1)).resolves.toEqual({
      persisted: false,
      stale: true,
    });
    expect(connection.rollback).toHaveBeenCalledOnce();
    expect(connection.query.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO ai_content_chunks'))).toBe(
      false,
    );

    dbMock.query.mockResolvedValueOnce([[]]);
    await expect(
      __testing.validateAuthoritativeHits('user-race-db', [
        {
          type: 'note',
          id: 'deleted-note',
          resourceVersion: '2026-07-19T00:00:00.000Z',
        },
      ]),
    ).resolves.toEqual([]);
    expect(dbMock.query.mock.calls.at(-1)[0]).toContain('create_by = ? AND del_flag = 0');
  });
});
