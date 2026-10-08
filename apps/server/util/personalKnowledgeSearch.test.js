import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const dbMock = vi.hoisted(() => ({ getConnection: vi.fn(), query: vi.fn() }));

vi.mock('../db/index.js', () => ({ default: dbMock }));

import { __testing, invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';
import { indexClient } from './personalSearchIndexClient.js';
afterAll(() => indexClient.close());

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

  it('large asynchronous builds yield to timers and preserve synchronous search ranking', async () => {
    const documents = Array.from({ length: 600 }, (_, i) =>
      __testing.chunkResource({
        userId: 'large',
        resourceType: 'note',
        resourceId: String(i),
        version: 'v1',
        title: i === 599 ? '霜叶协议 finale' : `普通笔记 ${i}`,
        content: '共同背景。'.repeat(100) + (i === 599 ? '霜叶协议最终证据 finale' : ''),
        contentType: 'markdown',
      }),
    ).flat();
    let timerRan = false;
    const timer = setTimeout(() => {
      timerRan = true;
    }, 0);
    const pending = __testing.buildBundleAsync(documents);
    expect(timerRan).toBe(false);
    const asynchronous = await pending;
    clearTimeout(timer);
    expect(timerRan).toBe(true);
    const synchronous = __testing.buildBundle(documents);
    const options = { combineWith: 'OR', boost: { title: 5, content: 1 } };
    expect(await asynchronous.index.search('霜叶协议 finale', options)).toEqual(
      synchronous.index.search('霜叶协议 finale', options),
    );
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

  it('权威资源复核会删除已移除命中', async () => {
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

describe('private search weighted cache retention', () => {
  beforeEach(async () => {
    await invalidatePersonalKnowledgeCache();
  });

  function fixture(id, content = 'alpha evidence') {
    return __testing.chunkResource({
      userId: 'budget',
      resourceType: 'note',
      resourceId: id,
      version: 'v1',
      title: 'Evidence',
      content,
      contentType: 'markdown',
    });
  }

  it('accounts stored content and vocabulary without query-dependent weight changes', async () => {
    const documents = fixture('a');
    const bundle = __testing.buildBundle(documents);
    const asynchronous = await __testing.buildBundleAsync(documents);
    const weight = bundle.estimatedMemoryBytes;
    expect(weight).toBeGreaterThan(JSON.stringify(documents).length * 2);
    expect(asynchronous.estimatedMemoryBytes).toBe(weight);
    bundle.index.search('alpha extra query vocabulary');
    expect(bundle.estimatedMemoryBytes).toBe(weight);
    const diverse = __testing.buildBundle(fixture('a', Array.from({ length: 100 }, (_, i) => `term${i}`).join(' ')));
    expect(diverse.estimatedMemoryBytes).toBeGreaterThan(weight);
  });

  it('evicts oldest retained accounts by aggregate weight, not just account count', () => {
    const a = __testing.buildBundle(fixture('a'));
    const b = __testing.buildBundle(fixture('b'));
    const c = __testing.buildBundle(fixture('c'));
    const budget = a.estimatedMemoryBytes + b.estimatedMemoryBytes;
    __testing.retainBundle('a', a, budget);
    __testing.retainBundle('b', b, budget);
    // Refresh recency using the same operation as a cache hit, without changing TTL.
    const builtAt = a.builtAt;
    __testing.cache.delete('a');
    __testing.cache.set('a', a);
    __testing.retainBundle('c', c, budget);
    expect([...__testing.cache.keys()]).toEqual(['a', 'c']);
    expect(a.builtAt).toBe(builtAt);
    // Eviction only releases cache ownership; a request already using b still works.
    expect(b.index.search('alpha')[0].resourceId).toBe('b');
  });

  it('serves oversized bundles completely without flushing other accounts', async () => {
    const small = __testing.buildBundle(fixture('s'));
    const large = __testing.buildBundle(fixture('l', 'alpha '.repeat(100) + 'uniqueending'));
    const budget = small.estimatedMemoryBytes;
    __testing.retainBundle('s', small, budget);
    __testing.retainBundle('l', large, budget);
    expect([...__testing.cache.keys()]).toEqual(['s']);
    expect(large.index.search('uniqueending')[0].resourceId).toBe('l');
    await invalidatePersonalKnowledgeCache('s', { persist: false });
    __testing.retainBundle('s', small, budget);
    expect(__testing.cache.size).toBe(1);
    await invalidatePersonalKnowledgeCache();
    expect(__testing.cache.size).toBe(0);
  });
});
