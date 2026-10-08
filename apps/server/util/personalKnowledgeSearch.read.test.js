import { beforeEach, expect, it, vi } from 'vitest';
import * as preprocessing from './personalSearchPreprocessor.js';
const db = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: db }));
import { __testing } from './personalKnowledgeSearch.js';

beforeEach(() => vi.resetAllMocks());

function fileRow(index, content = `evidence ${index}`) {
  return {
    file_id: String(1 + Math.floor(index / 100)),
    file_name: 'file',
    source_id: `s${Math.floor(index / 100)}`,
    chunk_index: index % 100,
    content,
    update_time: '2026-09-01',
  };
}

function mockSources(files, { notes = [], bookmarks = [], todos = [], failSecondFilePage = false } = {}) {
  const reads = [];
  db.query.mockImplementation(async (sql, params) => {
    if (sql.includes('JOIN ai_document_chunks')) {
      if (!sql.includes('body_bytes')) {
        const identities = new Set();
        for (let i = 1; i < params.length - 1; i += 3) identities.add(`${params[i]}:${params[i + 1]}:${params[i + 2]}`);
        return [files.filter((row) => identities.has(`${row.file_id}:${row.source_id}:${row.chunk_index}`))];
      }
      if (failSecondFilePage && reads.length) throw new Error('read failed');
      const take = params.at(-1);
      const candidates =
        params.length > 2
          ? files.filter(
              (row) =>
                BigInt(row.file_id) > BigInt(params[1]) || (row.file_id === params[1] && row.chunk_index > params[3]),
            )
          : files;
      const rows = candidates.slice(0, take);
      reads.push({ take, rows: rows.length });
      return [rows.map(({ content, ...row }) => ({ ...row, body_bytes: Buffer.byteLength(content || '') }))];
    }
    if (sql.includes('FROM note'))
      return [params.length > 1 ? notes.filter((row) => params.slice(1).includes(String(row.id))) : notes];
    if (sql.includes('FROM bookmark b'))
      return [params.length > 1 ? bookmarks.filter((row) => params.slice(1).includes(String(row.id))) : bookmarks];
    if (sql.includes('FROM todo_items'))
      return [params.length > 1 ? todos.filter((row) => params.slice(1).includes(String(row.id))) : todos];
    return [[]];
  });
  return reads;
}

it('reads only the existing 12000 chunk prefix in bounded keyset batches, including blank rows', async () => {
  const files = Array.from({ length: 12_100 }, (_, i) => fileRow(i, i < 150 ? '<p> </p>' : `evidence ${i}`));
  // Append enough non-empty rows to exceed the index capacity.
  files.push(...Array.from({ length: 100 }, (_, i) => fileRow(12_100 + i)));
  const reads = mockSources(files);
  const documents = await __testing.loadDocuments('owner');
  const expected = files.filter((row) => row.content !== '<p> </p>').slice(0, 12_000);
  expect(documents.map((doc) => `${doc.resourceId}:${doc.chunkIndex}`)).toEqual(
    expected.map((row) => `${row.file_id}:${row.chunk_index}`),
  );
  expect(documents.at(-1).content).toBe(expected.at(-1).content);
  expect(Math.max(...reads.map((read) => read.rows))).toBeLessThanOrEqual(128);
  expect(reads.reduce((total, read) => total + read.rows, 0)).toBe(12_150);
  expect(reads.at(-1).take).toBeLessThan(128);
});

it('preserves material type priority and fills remaining capacity with todos', async () => {
  mockSources([fileRow(0)], {
    notes: [{ id: 'n', title: 'note', content: 'note evidence', type: 'markdown' }],
    bookmarks: [{ id: 'b', name: 'bookmark', summary: 'bookmark evidence' }],
    todos: [{ id: 't', title: 'todo', description: 'todo evidence' }],
  });
  const documents = await __testing.loadDocuments('owner');
  expect(documents.map((doc) => doc.resourceType)).toEqual(['note', 'bookmark', 'file', 'todo']);
});

it('does not query files after earlier resources already fill the index', async () => {
  const content = 'long note evidence. '.repeat(300);
  const notes = Array.from({ length: 3000 }, (_, i) => ({ id: String(i), title: 'note', content, type: 'markdown' }));
  const reads = mockSources([fileRow(0)], { notes });
  const documents = await __testing.loadDocuments('owner');
  expect(documents).toHaveLength(12_000);
  expect(documents.every((doc) => doc.resourceType === 'note')).toBe(true);
  expect(reads).toHaveLength(0);
});

it('drops a failed file source rather than retaining a partial paginated snapshot', async () => {
  mockSources(
    Array.from({ length: 200 }, (_, i) => fileRow(i)),
    {
      failSecondFilePage: true,
      todos: [{ id: 't', title: 'todo', description: 'still available' }],
    },
  );
  const documents = await __testing.loadDocuments('owner');
  expect(documents.map((doc) => doc.resourceType)).toEqual(['todo']);
});

it('retains legacy coverage fallback and exact large bigint cursor values', async () => {
  const id = '9007199254740993';
  const rows = Array.from({ length: 128 }, (_, i) => ({ ...fileRow(i), file_id: id, chunk_index: i }));
  db.query
    .mockResolvedValueOnce([rows])
    .mockRejectedValueOnce(Object.assign(new Error('legacy schema'), { code: 'ER_BAD_FIELD_ERROR' }))
    .mockResolvedValueOnce([rows])
    .mockResolvedValueOnce([[]]);
  const batches = [];
  for await (const batch of __testing.loadFileChunkBatches('owner', () => 200)) batches.push(batch);
  expect(batches.flat()).toEqual(rows);
  expect(db.query.mock.calls[0][0]).toContain('body_bytes');
  expect(db.query.mock.calls[2][0]).toContain('NULL AS coverage_metadata');
  expect(db.query.mock.calls[3][1]).toEqual(['owner', id, id, 127, 128]);
});

it('removes earlier note batches when a later body query fails, retaining other sources', async () => {
  mockSources([], {
    notes: Array.from({ length: 51 }, (_, i) => ({
      id: String(i),
      title: 'note',
      content: 'note evidence',
      type: 'markdown',
    })),
    todos: [{ id: 'todo', description: 'todo evidence' }],
  });
  const query = db.query.getMockImplementation();
  let noteBodyCalls = 0;
  db.query.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM note') && sql.includes('AND id IN') && ++noteBodyCalls === 2)
      throw new Error('late body failure');
    return query(sql, params);
  });
  const documents = await __testing.loadDocuments('owner');
  expect(noteBodyCalls).toBe(2);
  expect(documents.map((doc) => doc.resourceType)).toEqual(['todo']);
});

it('bounds tag IDs per query and clears partial tags when a later tag batch fails', async () => {
  mockSources([], {
    notes: Array.from({ length: 65 }, (_, i) => ({
      id: String(i),
      title: 'note',
      content: 'note evidence',
      type: 'markdown',
    })),
  });
  const query = db.query.getMockImplementation();
  const batches = [];
  db.query.mockImplementation(async (sql, params) => {
    if (sql.includes('FROM resource_tag_relations')) {
      const ids = params.slice(2);
      batches.push(ids);
      if (batches.length === 2) throw new Error('late tags failure');
      return [ids.map((id) => ({ resource_id: id, name: 'tag evidence' }))];
    }
    return query(sql, params);
  });
  const documents = await __testing.loadDocuments('owner');
  expect(batches.map((ids) => ids.length)).toEqual([64, 1]);
  expect(documents).toHaveLength(65);
  expect(documents.every((doc) => doc.tags === '' && doc.content === 'note evidence')).toBe(true);
});

it('integrates isolated large-resource preprocessing without changing indexed chunks', async () => {
  const content = '# Intro\n' + 'long evidence 中文材料。'.repeat(6000) + '\n# Tail\nunique-tail';
  mockSources([], { notes: [{ id: 'large', title: 'large', content, type: 'markdown' }] });
  const documents = await __testing.loadDocuments('owner');
  expect(documents).toEqual(
    __testing.chunkResource({
      userId: 'owner',
      resourceType: 'note',
      resourceId: 'large',
      version: 'unknown',
      title: 'large',
      content,
      contentType: 'markdown',
      target: { type: 'note-detail', id: 'large', path: '/noteLibrary/large' },
    }),
  );
  expect(documents.at(-1).content).toContain('unique-tail');
});

it('preserves large file chunk evidence, hash, location and coverage after isolated cleaning', async () => {
  mockSources([
    {
      ...fileRow(0, '<script>' + 'private hidden '.repeat(20_000) + '</script><p>visible &amp; evidence</p>'),
      content_hash: 'original-source-hash',
      locator_type: 'page',
      locator_value: '12',
      coverage_metadata: JSON.stringify({ processedChars: 123, processedChunks: 1 }),
    },
  ]);
  const documents = await __testing.loadDocuments('owner');
  expect(documents).toHaveLength(1);
  expect(documents[0]).toMatchObject({
    content: 'visible & evidence',
    contentHash: 'original-source-hash',
    resourceId: '1',
    chunkIndex: 0,
    locator: { type: 'page', value: '12' },
    target: { type: 'cloud-file', id: '1', sourceId: 's0' },
    coverage: { processedChars: 123, processedChunks: 1 },
  });
});

it('propagates file preprocessing failure instead of silently losing all file evidence', async () => {
  mockSources([fileRow(0)]);
  const original = preprocessing.createPersonalSearchPreprocessor;
  const close = vi.fn();
  const failure = Object.assign(new Error('Private search text processing failed'), {
    code: 'AI_PERSONAL_SEARCH_PREPROCESS_TIMEOUT',
    status: 503,
  });
  const spy = vi.spyOn(preprocessing, 'createPersonalSearchPreprocessor').mockImplementation(() => {
    const processor = original();
    return {
      ...processor,
      fileText: async () => {
        throw failure;
      },
      close: async () => {
        close();
        await processor.close();
      },
    };
  });
  try {
    await expect(__testing.loadDocuments('owner')).rejects.toBe(failure);
    expect(close).toHaveBeenCalledOnce();
  } finally {
    spy.mockRestore();
  }
});
