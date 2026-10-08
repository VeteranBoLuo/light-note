import { randomUUID } from 'node:crypto';
import mysql from 'mysql2/promise';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const mockDb = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../db/index.js', () => ({ default: mockDb }));
import { __testing } from './personalKnowledgeSearch.js';
import { readPersonalSearchSource } from './personalSearchSourceReader.js';
const socketPath = process.env.LIGHTNOTE_TEST_MYSQL_SOCKET;

describe.skipIf(!socketPath)('private search file keyset reads (isolated MySQL)', () => {
  const schema = `search_read_${randomUUID().replaceAll('-', '')}`;
  let admin,
    database,
    created = false;
  beforeAll(async () => {
    if (!socketPath.startsWith('/tmp/') && !socketPath.startsWith('/private/tmp/'))
      throw new Error('Temporary socket required');
    admin = await mysql.createConnection({ socketPath, user: 'root' });
    const [[server]] = await admin.query('SELECT @@skip_networking AS disabled');
    if (Number(server.disabled) !== 1) throw new Error('Isolated MySQL required');
    await admin.query(`CREATE DATABASE ${schema} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    created = true;
    database = await mysql.createConnection({ socketPath, user: 'root', database: schema });
    await database.query(`CREATE TABLE files (
      id BIGINT PRIMARY KEY, file_name VARCHAR(255), create_time DATETIME,
      create_by VARCHAR(36), del_flag INT, INDEX owner (create_by, del_flag))`);
    await database.query(`CREATE TABLE ai_document_sources (
      id VARCHAR(36) PRIMARY KEY, file_id BIGINT, user_id VARCHAR(36), status VARCHAR(20),
      extracted_chars INT, chunk_count INT, coverage_metadata JSON,
      UNIQUE KEY owner_file (user_id, file_id))`);
    await database.query(`CREATE TABLE ai_document_chunks (
      source_id VARCHAR(36), chunk_index INT, content MEDIUMTEXT, locator_type VARCHAR(20),
      locator_value VARCHAR(160), content_hash CHAR(64), PRIMARY KEY (source_id, chunk_index))`);
    const ids = ['1', '2', '3', '4', '9007199254740993'];
    for (const [index, id] of ids.entries()) {
      const owner = index === 1 ? 'foreign' : 'owner';
      await database.query('INSERT INTO files VALUES (?, ?, NOW(), ?, ?)', [
        id,
        `file ${id}`,
        owner,
        index === 2 ? 1 : 0,
      ]);
      await database.query('INSERT INTO ai_document_sources VALUES (?, ?, ?, ?, 1000, 140, NULL)', [
        `s${index}`,
        id,
        owner,
        index === 3 ? 'parsing' : 'ready',
      ]);
      await database.query('INSERT INTO ai_document_chunks (source_id, chunk_index, content) VALUES ?', [
        Array.from({ length: 140 }, (_, i) => [`s${index}`, i, `evidence ${id} ${i}`]),
      ]);
    }
    await database.query(`CREATE TABLE note (id VARCHAR(36) PRIMARY KEY, title VARCHAR(255), content MEDIUMTEXT,
      type VARCHAR(20), update_time DATETIME, create_by VARCHAR(36), del_flag INT)`);
    await database.query(`CREATE TABLE bookmark (id BIGINT PRIMARY KEY, name VARCHAR(255), url VARCHAR(255),
      description TEXT, create_time DATETIME, user_id VARCHAR(36), del_flag INT)`);
    await database.query(`CREATE TABLE bookmark_snapshot (bookmark_id BIGINT PRIMARY KEY, summary TEXT,
      content MEDIUMTEXT, update_time DATETIME)`);
    await database.query(`CREATE TABLE todo_items (id VARCHAR(36) PRIMARY KEY, title VARCHAR(255), description TEXT,
      checklist JSON, status VARCHAR(20), due_at DATETIME, update_time DATETIME, user_id VARCHAR(36), del_flag INT)`);
    await database.query(`CREATE TABLE tag (id INT PRIMARY KEY, user_id VARCHAR(36), del_flag INT, name VARCHAR(255))`);
    await database.query(`CREATE TABLE resource_tag_relations (resource_type VARCHAR(20), resource_id VARCHAR(36),
      user_id VARCHAR(36), tag_id INT)`);
    await database.query(`INSERT INTO note VALUES ?`, [
      [
        ['n1', 'first', 'alpha evidence', 'markdown', '2026-09-02', 'owner', 0],
        ['n2', 'drawing title', 'private scene JSON', 'drawing', '2026-09-01', 'owner', 0],
        ['n3', 'foreign', 'hidden evidence', 'markdown', '2026-09-01', 'foreign', 0],
        ['n4', 'deleted', 'deleted evidence', 'markdown', '2026-09-01', 'owner', 1],
      ],
    ]);
    await database.query(`INSERT INTO bookmark VALUES
      (10, 'bookmark', 'https://example.invalid', 'description', '2026-09-01', 'owner', 0)`);
    await database.query(`INSERT INTO bookmark_snapshot VALUES (10, 'summary', 'snapshot evidence', '2026-09-02')`);
    await database.query(`INSERT INTO todo_items VALUES
      ('t1', 'todo', 'description', '[{"text":"check evidence"}]', 'pending', NULL, '2026-09-01', 'owner', 0)`);
    await database.query(`INSERT INTO tag VALUES
      (1, 'owner', 0, ' alpha '), (2, 'owner', 0, '<b>beta</b>'),
      (3, 'foreign', 0, 'foreign tag'), (4, 'owner', 1, 'deleted tag')`);
    await database.query(`INSERT INTO resource_tag_relations VALUES
      ('note','n1','owner',1), ('note','n1','owner',2), ('note','n1','owner',3), ('note','n1','owner',4),
      ('bookmark','10','owner',2), ('file','1','owner',2), ('note','outside-index','owner',1)`);
    mockDb.query.mockImplementation((sql, params) => database.query(sql, params));
  });
  afterAll(async () => {
    await database?.end();
    if (created) await admin.query(`DROP DATABASE ${schema}`);
    await admin?.end();
  });

  it('matches full ordered SQL while excluding other owners, deleted files and unready sources', async () => {
    const [expected] = await database.query(`SELECT CAST(f.id AS CHAR) AS file_id, dc.chunk_index, dc.content
      FROM files f JOIN ai_document_sources ds ON ds.file_id=f.id AND ds.user_id=f.create_by AND ds.status='ready'
      JOIN ai_document_chunks dc ON dc.source_id=ds.id
      WHERE f.create_by='owner' AND f.del_flag=0 ORDER BY f.id, dc.chunk_index`);
    const actual = [];
    const sizes = [];
    for await (const rows of __testing.loadFileChunkBatches('owner', () => 12_000 - actual.length)) {
      sizes.push(rows.length);
      actual.push(...rows);
    }
    expect(actual.map(({ file_id, chunk_index, content }) => ({ file_id, chunk_index, content }))).toEqual(expected);
    expect(sizes).toEqual([128, 128, 24]);
    expect(actual.at(-1).file_id).toBe('9007199254740993');
  });

  it('stops at remaining capacity and supports schemas without coverage metadata', async () => {
    await database.query('ALTER TABLE ai_document_sources DROP COLUMN coverage_metadata');
    const actual = [];
    const sizes = [];
    for await (const rows of __testing.loadFileChunkBatches('owner', () => 150 - actual.length)) {
      sizes.push(rows.length);
      actual.push(...rows);
    }
    expect(sizes).toEqual([128, 22]);
    expect(actual.at(-1)).toMatchObject({ file_id: '9007199254740993', chunk_index: 9, coverage_metadata: null });
  });
  it('reads note/bookmark/todo SQL with full content and drawing exclusion', async () => {
    const notes = [];
    for await (const row of readPersonalSearchSource(database, 'owner', 'note', () => true)) notes.push(row);
    expect(notes.map((row) => row.id)).toEqual(['n1', 'n2']);
    expect(notes[1].content).toBe('');
    const bookmarks = [];
    for await (const row of readPersonalSearchSource(database, 'owner', 'bookmark', () => true)) bookmarks.push(row);
    expect(bookmarks[0]).toMatchObject({ id: '10', summary: 'summary', content: 'snapshot evidence' });
    const todos = [];
    for await (const row of readPersonalSearchSource(database, 'owner', 'todo', () => true)) todos.push(row);
    expect(todos[0]).toMatchObject({ id: 't1', checklist: [{ text: 'check evidence' }] });
  });

  it('hydrates only indexed resource tags and preserves per-source normalization', async () => {
    mockDb.query.mockClear();
    const documents = await __testing.loadDocuments('owner');
    const note = documents.find((doc) => doc.resourceType === 'note' && doc.resourceId === 'n1');
    const bookmark = documents.find((doc) => doc.resourceType === 'bookmark');
    const file = documents.find((doc) => doc.resourceType === 'file' && doc.resourceId === '1');
    expect(note.tags.split(' ').sort()).toEqual(['alpha', 'beta']);
    expect(bookmark.tags).toBe('beta');
    expect(file.tags).toBe('<b>beta</b>');
    expect(documents.some((doc) => doc.content.includes('check evidence'))).toBe(true);
    const tagCalls = mockDb.query.mock.calls.filter(([sql]) => sql.includes('FROM resource_tag_relations'));
    expect(tagCalls).toHaveLength(3);
    expect(tagCalls.flatMap(([, params]) => params)).not.toContain('outside-index');
    expect(tagCalls.every(([, params]) => params.length <= 66)).toBe(true);
  });

  it('reads an oversized note alone and retains its tail without transferring other bodies with it', async () => {
    const large = 'large evidence '.repeat(90_000) + 'unique-tail';
    await database.query('INSERT INTO note VALUES (?, ?, ?, ?, ?, ?, ?)', [
      'large',
      'large',
      large,
      'markdown',
      '2026-09-03',
      'owner',
      0,
    ]);
    const calls = [];
    const measured = {
      query: async (sql, params) => {
        const result = await database.query(sql, params);
        if (sql.includes('AND id IN')) calls.push(params.slice(1));
        return result;
      },
    };
    const notes = [];
    for await (const row of readPersonalSearchSource(measured, 'owner', 'note', () => true)) notes.push(row);
    expect(calls).toEqual([['large'], ['n1', 'n2']]);
    expect(notes[0].content).toBe(large);
    await database.query("DELETE FROM note WHERE id = 'large'");
  });

  it('bounds body batches by bytes while preserving oversized chunks and the complete order', async () => {
    const contents = [
      '中文'.repeat(110000),
      'evidence '.repeat(80000),
      'large '.repeat(300000) + 'tail',
      'last evidence',
    ];
    await database.query("INSERT INTO files VALUES (99, 'byte file', NOW(), 'byte-owner', 0)");
    // The legacy coverage test removes that optional column earlier in this suite.
    await database.query(
      "INSERT INTO ai_document_sources (id,file_id,user_id,status) VALUES ('byte-source',99,'byte-owner','ready')",
    );
    await database.query('INSERT INTO ai_document_chunks (source_id,chunk_index,content) VALUES ?', [
      contents.map((content, index) => ['byte-source', index, content]),
    ]);
    const bodyBytes = [],
      actual = [];
    mockDb.query.mockImplementation(async (sql, params) => {
      const result = await database.query(sql, params);
      if (sql.includes('JOIN ai_document_chunks')) {
        if (sql.includes('body_bytes')) {
          expect(result[0].every((row) => !('content' in row) && !('coverage_metadata' in row))).toBe(true);
        } else {
          bodyBytes.push(result[0].reduce((sum, row) => sum + Buffer.byteLength(row.content), 0));
        }
      }
      return result;
    });
    try {
      for await (const rows of __testing.loadFileChunkBatches('byte-owner', () => 100 - actual.length))
        actual.push(...rows);
      expect(actual.map((row) => row.content)).toEqual(contents);
      expect(bodyBytes).toEqual(contents.map((content) => Buffer.byteLength(content)));
      expect(bodyBytes.filter((bytes) => bytes > 1024 * 1024)).toEqual([Buffer.byteLength(contents[2])]);
      console.info(
        'file body batch bytes',
        JSON.stringify({ oldBatch: bodyBytes.reduce((a, b) => a + b, 0), batches: bodyBytes }),
      );
    } finally {
      mockDb.query.mockImplementation((sql, params) => database.query(sql, params));
      await database.query("DELETE FROM ai_document_chunks WHERE source_id='byte-source'");
      await database.query("DELETE FROM ai_document_sources WHERE id='byte-source'");
      await database.query('DELETE FROM files WHERE id=99');
    }
  });

  it('rechecks ownership and ready state after metadata and advances past removed chunks', async () => {
    let changed = false;
    mockDb.query.mockImplementation(async (sql, params) => {
      const result = await database.query(sql, params);
      if (!changed && sql.includes('body_bytes') && sql.includes('JOIN ai_document_chunks')) {
        changed = true;
        await database.query("UPDATE ai_document_sources SET status='parsing' WHERE id='s0'");
      }
      return result;
    });
    try {
      const actual = [];
      for await (const rows of __testing.loadFileChunkBatches('owner', () => 150 - actual.length)) actual.push(...rows);
      expect(actual).toHaveLength(140);
      expect(actual.every((row) => row.file_id === '9007199254740993')).toBe(true);
      expect(actual.map((row) => row.chunk_index)).toEqual(Array.from({ length: 140 }, (_, i) => i));
    } finally {
      mockDb.query.mockImplementation((sql, params) => database.query(sql, params));
      await database.query("UPDATE ai_document_sources SET status='ready' WHERE id='s0'");
    }
  });
});
