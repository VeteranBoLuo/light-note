import { describe, expect, it, vi } from 'vitest';

vi.mock('../db/index.js', () => ({ default: {} }));
vi.mock('./personalKnowledgeSearch.js', () => ({
  invalidatePersonalKnowledgeCache: vi.fn(async (_userId, options = {}) =>
    options.persist === false
      ? { generationAdvanced: false, deleted: 0, skipped: true }
      : { generationAdvanced: true, deleted: 0, skipped: false },
  ),
}));

import {
  __testing,
  applyAiChangeSet,
  createAiChangeSet,
  listAiChangeSets,
  revalidateAiChangeSetRetry,
  retryAiChangeSet,
  undoAiChangeSet,
  updateAiChangeSet,
} from './aiChangeSetService.js';
import { invalidatePersonalKnowledgeCache } from './personalKnowledgeSearch.js';

const identity = { actorUserId: 'actor-1', subjectUserId: 'user-1' };

function noteItem(id, beforeTitle, afterTitle, order = 0) {
  return {
    id,
    change_set_id: 'set-1',
    item_order: order,
    operation: 'update_note_metadata',
    resource_type: 'note',
    resource_id: `note-${order + 1}`,
    before_hash: __testing.stateHash({ title: beforeTitle }),
    before_json: JSON.stringify({ title: beforeTitle }),
    after_json: JSON.stringify({ title: afterTitle }),
    reason: `reason-${order + 1}`,
    status: 'pending',
  };
}

describe('AI Change Set safety', () => {
  it('hashes semantic JSON deterministically', () => {
    expect(__testing.stateHash({ b: 2, a: { y: 1, x: 0 } })).toBe(__testing.stateHash({ a: { x: 0, y: 1 }, b: 2 }));
  });

  it('only accepts the explicit reversible metadata shape', () => {
    expect(__testing.normalizeAfter('update_note_metadata', { title: 'New', content: 'must be ignored' })).toEqual({
      title: 'New',
    });
    expect(
      __testing.normalizeAfter('update_note_content', { title: 'New', type: 'markdown', content: '正文\n' }),
    ).toEqual({ title: 'New', type: 'markdown', content: '正文\n' });
    expect(() => __testing.normalizeAfter('delete_note', {})).toThrow(/OPERATION_UNSUPPORTED/);
    expect(() => __testing.normalizeAfter('move_file', { folderId: '../root' })).toThrow(/FOLDER_ID_INVALID/);
  });

  it('never persists a raw infrastructure error code in retry diagnostics', () => {
    expect(__testing.stableFailureCode({ code: 'ER_PARSE_ERROR', message: 'raw sql detail' })).toBe(
      'AI_CHANGE_APPLY_FAILED',
    );
    expect(__testing.stableFailureCode({ code: 'CHANGE_CONFLICT', status: 409 })).toBe('CHANGE_CONFLICT');
    expect(
      __testing.stableFailureCode({
        code: 'AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE',
        status: 503,
        isAiChangeError: true,
      }),
    ).toBe('AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE');
  });

  it('uses actor, subject, mode and exact context id as the owner and requestId domain', async () => {
    const database = { query: vi.fn().mockResolvedValue([[]]) };
    const identity = {
      actorUserId: 'root-1',
      subjectUserId: 'user-1',
      adminContextMode: 'maintain',
      adminContextId: 'context-2',
    };
    await listAiChangeSets(identity, {}, database);
    expect(database.query.mock.calls[0][1].slice(0, 4)).toEqual(['root-1', 'user-1', 'maintain', 'context-2']);
    expect(database.query.mock.calls[0][0]).toContain('admin_context_id <=> ?');
  });

  it('rejects readonly create/apply/revalidate/retry before storage access', async () => {
    const identity = {
      actorUserId: 'root-1',
      subjectUserId: 'user-1',
      adminContextMode: 'readonly',
      adminContextId: 'context-1',
    };
    const database = { query: vi.fn(), getConnection: vi.fn() };
    await expect(createAiChangeSet(identity, { items: [{}] }, database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    await expect(applyAiChangeSet(identity, 'set-1', null, database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    await expect(revalidateAiChangeSetRetry(identity, 'set-1', database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    await expect(retryAiChangeSet(identity, 'set-1', 2, database)).rejects.toMatchObject({
      code: 'ADMIN_PREVIEW_READONLY',
      status: 403,
    });
    expect(database.query).not.toHaveBeenCalled();
    expect(database.getConnection).not.toHaveBeenCalled();
  });

  it('rolls back every selected write and persists only a stable failed-batch diagnostic', async () => {
    const item1 = noteItem('item-1', 'Preview one', 'Proposed one', 0);
    const item2 = noteItem('item-2', 'Preview two', 'Proposed two', 1);
    const applyConnection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ id: 'set-1', status: 'draft', preview_revision: 3, expires_at: new Date(Date.now() + 60_000) }]];
        }
        if (sql.startsWith('SELECT * FROM ai_change_items')) {
          return [[item1, item2]];
        }
        if (sql.startsWith('SELECT title FROM note')) {
          return params[0] === 'note-1' ? [[{ title: 'Preview one' }]] : [[{ title: 'Edited after preview' }]];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    let persistedRetry;
    const diagnosticConnection = {
      beginTransaction: vi.fn().mockResolvedValue(undefined),
      commit: vi.fn().mockResolvedValue(undefined),
      rollback: vi.fn().mockResolvedValue(undefined),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ id: 'set-1', status: 'draft', preview_revision: 3 }]];
        }
        if (sql.startsWith('SELECT id FROM ai_change_items')) return [[{ id: 'item-1' }, { id: 'item-2' }]];
        if (sql.includes('SET retry_json = ?')) {
          persistedRetry = JSON.parse(params[0]);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValueOnce(applyConnection).mockResolvedValueOnce(diagnosticConnection),
    };
    await expect(applyAiChangeSet(identity, 'set-1', ['item-1', 'item-2'], database)).rejects.toMatchObject({
      code: 'CHANGE_CONFLICT',
      status: 409,
      retryRecorded: true,
    });

    expect(applyConnection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE note SET'))).toBe(true);
    expect(applyConnection.rollback).toHaveBeenCalledTimes(1);
    expect(applyConnection.commit).not.toHaveBeenCalled();
    expect(diagnosticConnection.commit).toHaveBeenCalledTimes(1);
    expect(persistedRetry).toMatchObject({
      state: 'failed',
      selectedItemIds: ['item-1', 'item-2'],
      selectedCount: 2,
      processedCount: 1,
      failedItemId: 'item-2',
      errorCode: 'CHANGE_CONFLICT',
      phase: 'item_apply',
      previewRevision: 3,
    });
    expect(JSON.stringify(persistedRetry)).not.toContain('Edited after preview');
    const failedItemUpdate = diagnosticConnection.query.mock.calls.find(([sql]) =>
      sql.includes("SET status = 'failed'"),
    );
    expect(failedItemUpdate?.[1]).toEqual(['CHANGE_CONFLICT', 'item-2', 'set-1']);
  });

  it('revalidates the frozen failed scope from authoritative state and advances the preview revision', async () => {
    const failedRetry = {
      version: 1,
      state: 'failed',
      selectedItemIds: ['item-2'],
      selectedCount: 1,
      processedCount: 0,
      failedItemId: 'item-2',
      errorCode: 'CHANGE_CONFLICT',
      phase: 'item_apply',
      failedAt: '2026-07-19T00:00:00.000Z',
      revalidatedAt: null,
      previewRevision: 3,
    };
    const item1 = noteItem('item-1', 'One', 'Next one', 0);
    const item2 = noteItem('item-2', 'Old two', 'Next two', 1);
    let nextRetry;
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [
            [
              {
                id: 'set-1',
                status: 'draft',
                preview_revision: 3,
                retry_json: JSON.stringify(failedRetry),
                expires_at: new Date(Date.now() + 60_000),
              },
            ],
          ];
        }
        if (sql.startsWith('SELECT * FROM ai_change_items')) return [[item1, item2]];
        if (sql.startsWith('SELECT title FROM note')) return [[{ title: 'Current two' }]];
        if (sql.includes('SET retry_json = ?, preview_revision = ?')) {
          nextRetry = JSON.parse(params[0]);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ id: 'set-1', status: 'draft', preview_revision: 4, retry_json: JSON.stringify(nextRetry) }]];
        }
        return [[{ ...item2, before_json: JSON.stringify({ title: 'Current two' }), status: 'pending' }]];
      }),
    };

    const result = await revalidateAiChangeSetRetry(identity, 'set-1', database);

    expect(result.previewRevision).toBe(4);
    expect(result.retry).toMatchObject({ state: 'ready', selectedItemIds: ['item-2'], previewRevision: 4 });
    expect(nextRetry).toMatchObject({ state: 'ready', failedItemId: 'item-2', errorCode: 'CHANGE_CONFLICT' });
    const refresh = connection.query.mock.calls.find(([sql]) => sql.includes('SET before_json = ?'));
    expect(JSON.parse(refresh[1][0])).toEqual({ title: 'Current two' });
    expect(refresh[1][1]).toBe(__testing.stateHash({ title: 'Current two' }));
    expect(refresh[1][2]).toBe('item-2');
    expect(
      connection.query.mock.calls.some(
        ([sql, params]) => sql.startsWith('SELECT title FROM note') && params[0] === 'note-1',
      ),
    ).toBe(false);
  });

  it('retries only the server-frozen scope and commits it as one transaction', async () => {
    const retry = {
      version: 1,
      state: 'ready',
      selectedItemIds: ['item-2'],
      selectedCount: 1,
      processedCount: 0,
      failedItemId: 'item-2',
      errorCode: 'CHANGE_CONFLICT',
      phase: 'item_apply',
      failedAt: '2026-07-19T00:00:00.000Z',
      revalidatedAt: '2026-07-19T00:01:00.000Z',
      previewRevision: 4,
    };
    const item1 = noteItem('item-1', 'One', 'Next one', 0);
    const item2 = noteItem('item-2', 'Current two', 'Next two', 1);
    let finalSelection;
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql, params) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [
            [
              {
                id: 'set-1',
                status: 'draft',
                preview_revision: 4,
                retry_json: JSON.stringify(retry),
                expires_at: new Date(Date.now() + 60_000),
              },
            ],
          ];
        }
        if (sql.startsWith('SELECT * FROM ai_change_items')) return [[item1, item2]];
        if (sql.startsWith('SELECT title FROM note')) return [[{ title: 'Current two' }]];
        if (sql.includes('UPDATE ai_change_sets') && sql.includes("SET status = 'applied'")) {
          finalSelection = JSON.parse(params[0]);
          return [{ affectedRows: 1 }];
        }
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ id: 'set-1', status: 'applied', preview_revision: 4, selection_json: '["item-2"]' }]];
        }
        return [
          [
            { ...item1, status: 'rejected' },
            { ...item2, status: 'applied' },
          ],
        ];
      }),
    };

    const result = await retryAiChangeSet(identity, 'set-1', 4, database);

    expect(result.status).toBe('applied');
    expect(finalSelection).toEqual(['item-2']);
    expect(connection.commit).toHaveBeenCalledTimes(1);
    expect(connection.rollback).not.toHaveBeenCalled();
    expect(
      connection.query.mock.calls.some(
        ([sql, params]) => sql.startsWith('SELECT title FROM note') && params[0] === 'note-1',
      ),
    ).toBe(false);
    expect(
      connection.query.mock.calls.some(([sql, params]) => sql.startsWith('UPDATE note SET') && params[2] === 'note-2'),
    ).toBe(true);
  });

  it('rejects a stale retry revision before touching any item or resource', async () => {
    const retry = {
      state: 'ready',
      selectedItemIds: ['item-1'],
      previewRevision: 4,
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [
            [
              {
                id: 'set-1',
                status: 'draft',
                preview_revision: 4,
                retry_json: JSON.stringify(retry),
                expires_at: new Date(Date.now() + 60_000),
              },
            ],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(retryAiChangeSet(identity, 'set-1', 3, database)).rejects.toMatchObject({
      code: 'CHANGE_RETRY_STALE',
      status: 409,
    });
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.query).toHaveBeenCalledTimes(1);
  });

  it('blocks ordinary apply while a failed snapshot requires authoritative revalidation', async () => {
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [
            [
              {
                id: 'set-1',
                status: 'draft',
                preview_revision: 3,
                retry_json: JSON.stringify({ state: 'failed', selectedItemIds: ['item-1'], previewRevision: 3 }),
                expires_at: new Date(Date.now() + 60_000),
              },
            ],
          ];
        }
        throw new Error(`unexpected query: ${sql}`);
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };

    await expect(applyAiChangeSet(identity, 'set-1', ['item-1'], database)).rejects.toMatchObject({
      code: 'CHANGE_RETRY_REVALIDATION_REQUIRED',
      status: 409,
    });
    expect(connection.query).toHaveBeenCalledTimes(1);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
  });

  it('invalidates a failed retry snapshot when the user edits the draft and advances its revision', async () => {
    const row = {
      id: 'set-1',
      status: 'draft',
      title: 'Old title',
      summary: null,
      preview_revision: 3,
      retry_json: JSON.stringify({ state: 'failed', selectedItemIds: ['item-1'], previewRevision: 3 }),
      expires_at: new Date(Date.now() + 60_000),
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) return [[row]];
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValue(connection),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ ...row, title: 'New title', preview_revision: 4, retry_json: null }]];
        }
        return [[noteItem('item-1', 'Before', 'After', 0)]];
      }),
    };

    const result = await updateAiChangeSet(identity, 'set-1', { title: 'New title' }, database);

    expect(result).toMatchObject({ title: 'New title', previewRevision: 4, retry: null });
    expect(connection.query.mock.calls.some(([sql]) => sql.includes('preview_revision = preview_revision + 1'))).toBe(
      true,
    );
    expect(
      connection.query.mock.calls.some(
        ([sql]) => sql.includes("status = 'pending'") && sql.includes("status = 'failed'"),
      ),
    ).toBe(true);
    expect(connection.commit).toHaveBeenCalledTimes(1);
  });

  it('fails closed and rolls back resources when persistent search generation cannot advance', async () => {
    const item = noteItem('item-1', 'Before', 'After', 0);
    const applyConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ id: 'set-1', status: 'draft', preview_revision: 2, expires_at: new Date(Date.now() + 60_000) }]];
        }
        if (sql.startsWith('SELECT * FROM ai_change_items')) return [[item]];
        if (sql.startsWith('SELECT title FROM note')) return [[{ title: 'Before' }]];
        return [{ affectedRows: 1 }];
      }),
    };
    const diagnosticConnection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) {
          return [[{ id: 'set-1', status: 'draft', preview_revision: 2 }]];
        }
        if (sql.startsWith('SELECT id FROM ai_change_items')) return [[{ id: 'item-1' }]];
        return [{ affectedRows: 1 }];
      }),
    };
    const database = {
      getConnection: vi.fn().mockResolvedValueOnce(applyConnection).mockResolvedValueOnce(diagnosticConnection),
    };
    vi.mocked(invalidatePersonalKnowledgeCache).mockResolvedValueOnce({
      generationAdvanced: false,
      deleted: 0,
      skipped: true,
    });

    await expect(applyAiChangeSet(identity, 'set-1', null, database)).rejects.toMatchObject({
      code: 'AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE',
      status: 503,
      retryRecorded: true,
    });

    expect(applyConnection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE note SET'))).toBe(true);
    expect(applyConnection.rollback).toHaveBeenCalledTimes(1);
    expect(applyConnection.commit).not.toHaveBeenCalled();
    expect(diagnosticConnection.commit).toHaveBeenCalledTimes(1);
  });

  it('keeps undo and persistent search invalidation in the same transaction', async () => {
    const before = { title: 'Before' };
    const after = { title: 'After' };
    const item = {
      ...noteItem('item-1', 'Before', 'After', 0),
      status: 'applied',
      receipt_json: JSON.stringify({ before, after, afterHash: __testing.stateHash(after) }),
    };
    const connection = {
      beginTransaction: vi.fn(),
      commit: vi.fn(),
      rollback: vi.fn(),
      release: vi.fn(),
      query: vi.fn(async (sql) => {
        if (sql.startsWith('SELECT * FROM ai_change_sets')) return [[{ id: 'set-1', status: 'applied' }]];
        if (sql.startsWith('SELECT * FROM ai_change_items')) return [[item]];
        if (sql.startsWith('SELECT title FROM note')) return [[after]];
        return [{ affectedRows: 1 }];
      }),
    };
    const database = { getConnection: vi.fn().mockResolvedValue(connection) };
    vi.mocked(invalidatePersonalKnowledgeCache).mockResolvedValueOnce({
      generationAdvanced: false,
      deleted: 0,
      skipped: true,
    });

    await expect(undoAiChangeSet(identity, 'set-1', database)).rejects.toMatchObject({
      code: 'AI_KNOWLEDGE_INVALIDATION_UNAVAILABLE',
      status: 503,
    });

    expect(connection.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE note SET'))).toBe(true);
    expect(connection.query.mock.calls.some(([sql]) => sql.includes("SET status = 'undone', undone_at"))).toBe(false);
    expect(connection.rollback).toHaveBeenCalledTimes(1);
    expect(connection.commit).not.toHaveBeenCalled();
  });
});
