import { describe, it, expect, vi } from 'vitest';
const resolve = vi.hoisted(() => vi.fn());
vi.mock('../../db/index.js', () => ({ default: {} }));
vi.mock('../obsClient.js', () => ({
  createDownloadSignedUrl: vi.fn(),
  putObjectBodyToObs: vi.fn(),
  deleteObjectFromObs: vi.fn(),
  getObjectMetadataFromObs: vi.fn(),
  getObjectBufferFromObs: vi.fn(),
}));
vi.mock('./sourceAdapters.js', () => ({ imageSourceAdapters: { note: { resolve, identity: () => 'identity' } } }));
import { resolveImagePreviews, hydrateImagePreviewStates, retryImagePreview, artifactState } from './service.js';
const source = { sourceType: 'note', sourceId: 'n' };
function database(artifacts, job) {
  const c = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => {
      if (sql.startsWith('SELECT j.id')) return [[job].filter(Boolean)];
      if (sql.startsWith('SELECT * FROM file_preview_artifacts')) return [artifacts];
      return [{ affectedRows: 1 }];
    }),
  };
  return { c, getConnection: async () => c, query: vi.fn(async () => [artifacts]) };
}
describe('image preview state and retries', () => {
  it('returns identical safe failure reasons in list hydration and resolve', async () => {
    const row = {
      id: 1,
      asset_id: 4,
      identity_hash: 'identity',
      strategy_version: 2,
      status: 'failed',
      error_code: 'IMAGE_SOURCE_MISSING',
      artifact_size: 999,
    };
    resolve.mockResolvedValue({ asset: { id: 4, source_version: 'current' } });
    const db = database([row]);
    const [state] = await resolveImagePreviews('u', [source], { db, readOnly: true });
    const items = [{ imagePreview: source }];
    await hydrateImagePreviewStates(items, 'u', { db });
    expect(state).toMatchObject({
      errorCode: 'IMAGE_SOURCE_MISSING',
      failureKind: 'source',
      retryable: false,
      bytes: 0,
    });
    expect(items[0].imagePreview).toEqual(
      expect.objectContaining({
        errorCode: state.errorCode,
        failureKind: state.failureKind,
        retryable: state.retryable,
        bytes: 0,
      }),
    );
  });
  it('falls back only to a ready preview selected for the same source revision', async () => {
    resolve.mockResolvedValue({ asset: { id: 4, source_version: 'revision' } });
    const db = database([
      { strategy_version: 2, status: 'processing' },
      { id: 9, strategy_version: 1, status: 'ready', artifact_object_key: 'old-preview' },
    ]);
    const [state] = await resolveImagePreviews('u', [source], {
      db,
      readOnly: true,
      sign: () => ({ url: 'safe-preview' }),
    });
    expect(state.url).toBe('safe-preview');
    expect(db.c.query).toHaveBeenCalledWith(expect.stringContaining('source_revision=?'), [4, 'revision']);
  });
  it.each([
    ['failed', 'IMAGE_STORAGE_UNAVAILABLE', 0, true],
    ['failed', 'IMAGE_SOURCE_MISSING', 0, false],
    ['failed', 'IMAGE_STORAGE_UNAVAILABLE', Date.now() + 60000, false],
    ['processing', 'IMAGE_STORAGE_UNAVAILABLE', 0, false],
    ['queued', 'IMAGE_STORAGE_UNAVAILABLE', 0, false],
  ])('respects retryability, leases and backoff (%s %s)', async (status, error_code, available_at, writes) => {
    resolve.mockResolvedValue({ asset: { id: 4, source_version: 'revision' } });
    const db = database([], { id: 1, status, error_code, available_at });
    await retryImagePreview('u', source, { db });
    expect(db.c.query.mock.calls.some(([sql]) => sql.startsWith('UPDATE file_preview_jobs'))).toBe(writes);
    if (writes) expect(db.c.query).toHaveBeenCalledWith(expect.stringContaining('INTERVAL 60 SECOND'), [1]);
  });
  it('does not write if authoritative source access is denied', async () => {
    resolve.mockRejectedValue(Object.assign(new Error('denied'), { code: 'IMAGE_PREVIEW_NOT_FOUND' }));
    const db = database([]);
    await expect(retryImagePreview('other', source, { db })).rejects.toMatchObject({ code: 'IMAGE_PREVIEW_NOT_FOUND' });
    expect(db.c.query).not.toHaveBeenCalled();
    expect(db.c.rollback).toHaveBeenCalled();
  });
  it('reads explicit long-image metadata and tolerates old or malformed metadata', () => {
    expect(artifactState({ preview_metadata_json: '{"presentation":"long_top"}' }).presentation).toBe('long_top');
    expect(artifactState({ preview_metadata_json: 'invalid' }).presentation).toBe('full');
  });
});

it('represents completed audio without artwork as a normal terminal state', async () => {
  const row = {
    id: 7,
    asset_id: 4,
    identity_hash: 'identity',
    strategy_version: 2,
    status: 'ready',
    preview_metadata_json: '{"cover":"absent"}',
  };
  resolve.mockResolvedValue({ asset: { id: 4, source_version: 'current' } });
  const db = database([row]);
  const sign = vi.fn();
  const [state] = await resolveImagePreviews('u', [source], { db, sign });
  const items = [{ imagePreview: source }];
  await hydrateImagePreviewStates(items, 'u', { db, sign });
  for (const result of [state, items[0].imagePreview])
    expect(result).toMatchObject({ status: 'unsupported', url: null, errorCode: null, retryable: false });
  expect(sign).not.toHaveBeenCalled();
  expect(db.c.query.mock.calls.some(([sql]) => sql.startsWith('INSERT'))).toBe(false);
});
