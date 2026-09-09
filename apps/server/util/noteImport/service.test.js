import { beforeEach, describe, it, expect, vi } from 'vitest';
const state = vi.hoisted(() => ({ task: null, active: [], queries: [], shares: [] }));
const db = vi.hoisted(() => ({
  query: vi.fn(),
  beginTransaction: vi.fn(),
  commit: vi.fn(),
  rollback: vi.fn(),
  release: vi.fn(),
}));
vi.mock('../../db/index.js', () => ({ default: { ...db, getConnection: async () => db } }));
vi.mock('../services/noteService.js', () => ({ createNote: vi.fn() }));
vi.mock('../services/noteShareService.js', () => ({ listActiveInheritedNoteShares: async () => state.shares }));
vi.mock('../services/noteTreeService.js', () => ({
  loadOwnedNoteTree: async () => ({}),
  assertValidNoteParentFromSnapshot: vi.fn(),
}));
vi.mock('../imagePreview/references.js', () => ({ registerAsset: vi.fn() }));
vi.mock('../noteImages.js', () => ({ NOTE_IMAGE_DIR: '/tmp/unused-import-images' }));
const { startImport, ownedTask } = await import('./service.js');
beforeEach(() => {
  vi.clearAllMocks();
  state.task = {
    id: 'task',
    owner_id: 'owner',
    status: 'review',
    parent_id: null,
    expires_at: new Date(Date.now() + 60000),
  };
  state.active = [];
  state.shares = [];
  state.queries = [];
  db.query.mockImplementation(async (sql, args) => {
    state.queries.push([sql, args]);
    if (sql.includes('SELECT * FROM note_import_tasks')) return [[...(args[1] === 'owner' ? [state.task] : [])]];
    if (sql.includes('SELECT id FROM note_import_tasks')) return [state.active];
    if (sql.includes('SELECT id,status FROM note_import_items')) return [[{ id: 'item', status: 'ready' }]];
    return [[]];
  });
});
describe('import confirmation', () => {
  it('rejects cross-owner access', async () => {
    await expect(ownedTask(db, 'other', 'task')).rejects.toMatchObject({ code: 'NOTE_IMPORT_NOT_FOUND' });
  });
  it('requires share confirmation before queuing and rolls back', async () => {
    state.shares = [{ shareId: 'share', rootNoteId: 'root', expiresAt: '2030' }];
    await expect(startImport('owner', 'task', { items: [{ id: 'item', title: 'Hello' }] })).rejects.toMatchObject({
      code: 'NOTE_SHARE_EXPOSURE_CONFIRMATION_REQUIRED',
    });
    expect(db.rollback).toHaveBeenCalled();
    expect(state.queries.some(([sql]) => sql.includes("status='queued'"))).toBe(false);
  });
  it('queues an explicit selection with a frozen target fingerprint', async () => {
    await startImport('owner', 'task', { items: [{ id: 'item', title: ' Hello ' }] });
    expect(db.commit).toHaveBeenCalled();
    const update = state.queries.find(([sql]) => sql.includes("status='queued'"));
    expect(update[1][1]).toMatch(/^[a-f0-9]{64}$/);
  });
  it('makes double confirmation a no-op', async () => {
    state.task.status = 'running';
    await startImport('owner', 'task', {});
    expect(state.queries.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
  });
  it('prevents simultaneous account imports', async () => {
    state.active = [{ id: 'other' }];
    await expect(startImport('owner', 'task', { items: [{ id: 'item', title: 'x' }] })).rejects.toMatchObject({
      code: 'NOTE_IMPORT_ALREADY_RUNNING',
    });
  });
  it('rejects forged and duplicated items', async () => {
    await expect(
      startImport('owner', 'task', {
        items: [
          { id: 'item', title: 'x' },
          { id: 'item', title: 'x' },
        ],
      }),
    ).rejects.toMatchObject({ code: 'NOTE_IMPORT_SELECTION' });
  });
  it('does not retry expired staging', async () => {
    state.task.expires_at = new Date(0);
    await expect(startImport('owner', 'task', {})).rejects.toMatchObject({ code: 'NOTE_IMPORT_STATE' });
  });
});
