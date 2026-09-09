import { beforeEach, describe, it, expect, vi } from 'vitest';
const s = vi.hoisted(() => ({ task: null, item: null, writes: [], seen: new Map(), localIds: ['task'] }));
const db = vi.hoisted(() => ({
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));
const createNote = vi.hoisted(() => vi.fn());
vi.mock('../../db/index.js', () => ({ default: { ...db, getConnection: async () => db } }));
vi.mock('../services/noteService.js', () => ({ createNote }));
vi.mock('../services/noteShareService.js', () => ({ listActiveInheritedNoteShares: async () => [] }));
vi.mock('../services/noteTreeService.js', () => ({
  loadOwnedNoteTree: async () => ({}),
  assertValidNoteParentFromSnapshot: vi.fn(),
}));
vi.mock('../imagePreview/references.js', () => ({ registerAsset: vi.fn() }));
vi.mock('../noteImages.js', () => ({ NOTE_IMAGE_DIR: '/tmp/unused-import-images' }));
vi.mock('./storage.js', () => ({
  taskDirectory: () => '/tmp/unused',
  localImportTaskIds: async () => s.localIds,
  readJson: async () => ({ content: 'Hello', images: [] }),
  importError: (code, status = 400) => Object.assign(new Error(code), { code, status }),
}));
const { processImportTask, targetFingerprint } = await import('./service.js');
beforeEach(async () => {
  vi.clearAllMocks();
  s.writes = [];
  s.localIds = ['task'];
  s.seen.clear();
  s.task = { id: 'task', owner_id: 'owner', status: 'queued', stop_requested: 0, parent_id: null, lease_token: null };
  s.item = { id: 'item', title: 'Hello', type: 'markdown' };
  db.query.mockImplementation(async (sql, args = []) => {
    if (sql.startsWith('UPDATE')) {
      s.writes.push([sql, args]);
      if (sql.startsWith('UPDATE note_import_tasks SET lease_token=?')) s.task.lease_token = args[0];
      return [{ affectedRows: 1 }];
    }
    if (sql.includes('SELECT * FROM note_import_tasks')) return [[s.task]];
    if (sql.includes('SELECT * FROM note_import_items')) return [[...(s.item ? [s.item] : [])]];
    if (sql.includes('SELECT role FROM user')) return [[{ role: 'user' }]];
    return [[]];
  });
  s.task.share_fingerprint = (await targetFingerprint(db, 'owner', null)).fingerprint;
  createNote.mockImplementation(async (input) => {
    await input.beforeCreate(db);
    if (!s.seen.has(input.idempotencyKey)) s.seen.set(input.idempotencyKey, 'note');
    return { id: s.seen.get(input.idempotencyKey) };
  });
});
describe('import worker recovery', () => {
  it('does not claim shared database tasks without local staging', async () => {
    s.localIds = [];
    expect(await processImportTask()).toBe(false);
    expect(createNote).not.toHaveBeenCalled();
    expect(s.writes).toHaveLength(0);
  });
  it('limits lease acquisition to locally staged task IDs', async () => {
    await processImportTask();
    const claim = db.query.mock.calls.find(([sql]) => sql.includes('LIMIT 1 FOR UPDATE'));
    expect(claim[0]).toContain('id IN (?)');
    expect(claim[1]).toEqual([['task']]);
  });
  it('uses a stable idempotency identity on a reclaimed item', async () => {
    await processImportTask();
    await processImportTask();
    expect(createNote).toHaveBeenCalledTimes(2);
    expect(s.seen.size).toBe(1);
    expect(createNote.mock.calls[0][0]).toMatchObject({ suppressUserRewards: true, userId: 'owner' });
    expect(s.writes.filter(([sql]) => sql.includes("status='completed',note_id"))).toHaveLength(2);
  });
  it('stops without creating remaining notes', async () => {
    s.task.stop_requested = 1;
    await processImportTask();
    expect(createNote).not.toHaveBeenCalled();
    expect(s.writes.some(([, args]) => args[0] === 'paused')).toBe(true);
  });
  it('pauses when the confirmed share fingerprint changes', async () => {
    s.task.share_fingerprint = 'old';
    await processImportTask();
    expect(s.seen.size).toBe(0);
    expect(s.writes.some(([, args]) => args[0] === 'paused' && args[1] === 'NOTE_IMPORT_TARGET_CHANGED')).toBe(true);
  });
  it('records one failure and keeps the remaining queue runnable', async () => {
    createNote.mockRejectedValue(Object.assign(new Error(), { code: 'NOTE_IMPORT_CONTENT_LIMIT' }));
    await processImportTask();
    expect(s.writes.some(([sql]) => sql.includes("note_import_items SET status='failed'"))).toBe(true);
    expect(s.writes.some(([sql]) => sql.includes("SET status='running'"))).toBe(true);
  });
  it('does not mark a committed note failed when the outcome needs reconciliation', async () => {
    createNote.mockRejectedValue(Object.assign(new Error(), { commitOutcomeUnknown: true }));
    await processImportTask();
    expect(s.writes.some(([sql]) => sql.includes("note_import_items SET status='failed'"))).toBe(false);
    expect(s.writes.some(([, args]) => args[0] === 'paused')).toBe(true);
  });
});
