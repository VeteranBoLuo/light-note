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
const { startImport, ownedTask, dismissImport, clearImportHistory, getImportTask } = await import('./service.js');
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

describe('import task dismissal', () => {
  it.each(['uploading', 'review', 'paused', 'completed', 'failed', 'expired'])(
    'hides %s without deleting notes or idempotency records',
    async (status) => {
      state.task.status = status;
      await dismissImport('owner', 'task');
      expect(db.commit).toHaveBeenCalled();
      const writes = state.queries.filter(([sql]) => /^(UPDATE|DELETE|INSERT)/.test(sql));
      expect(writes).toHaveLength(1);
      expect(writes[0][0]).toContain("error_code='NOTE_IMPORT_DISMISSED'");
    },
  );
  it.each(['parsing', 'queued', 'running'])('rejects active %s tasks', async (status) => {
    state.task.status = status;
    await expect(dismissImport('owner', 'task')).rejects.toMatchObject({ code: 'NOTE_IMPORT_ACTIVE' });
    expect(db.rollback).toHaveBeenCalled();
  });
  it('rejects active leases and cross-account deletion', async () => {
    state.task.lease_until = new Date(Date.now() + 60000);
    await expect(dismissImport('owner', 'task')).rejects.toMatchObject({ code: 'NOTE_IMPORT_ACTIVE' });
    await expect(dismissImport('other', 'task')).rejects.toMatchObject({ code: 'NOTE_IMPORT_NOT_FOUND' });
  });
  it('prevents dismissed tasks from being accessed or restarted', async () => {
    state.task.error_code = 'NOTE_IMPORT_DISMISSED';
    await expect(startImport('owner', 'task', {})).rejects.toMatchObject({ code: 'NOTE_IMPORT_NOT_FOUND' });
  });
  it('exposes upload bytes and expired staging accurately', async () => {
    state.task.upload_bytes = 23;
    state.task.expires_at = new Date(0);
    expect(await getImportTask('owner', 'task')).toMatchObject({ status: 'expired', uploadBytes: 23, expiresAt: state.task.expires_at });
  });
});

it('returns null progress and warning details for legacy tasks', async () => {
  const original = db.query.getMockImplementation();
  db.query.mockImplementation((sql, args) =>
    sql.includes('source_name,type,status,selected,warnings')
      ? Promise.resolve([[{ id: 'item', warnings: '["missing_image"]', image_count: 15 }]])
      : original(sql, args),
  );
  const task = await getImportTask('owner', 'task');
  expect(task.progress).toBeNull();
  expect(task.finishedAt).toBeNull();
  expect(task.items[0].warningDetails).toBeNull();
  expect(task.items[0].warnings).toEqual(['missing_image']);
});
it('clears execution progress on retry without reselecting successful items', async () => {
  state.task.status = 'completed';
  await startImport('owner', 'task', { parentId: null });
  const updates = state.queries.filter(([sql]) => sql.startsWith('UPDATE note_import_items'));
  expect(updates).toHaveLength(1);
  expect(updates[0][0]).toContain("status='failed'");
  expect(state.queries.some(([sql]) => sql.includes("progress_json=NULL,finished_at=NULL,status='queued'"))).toBe(true);
});

describe('clear finished import history', () => {
  it('scopes the atomic clear to the owner and eligible tasks without deleting notes', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 3 }]);
    expect(await clearImportHistory('owner')).toEqual({ clearedCount: 3 });
    expect(db.query).toHaveBeenCalledTimes(1);
    const [sql, args] = db.query.mock.calls[0];
    expect(args).toEqual(['owner']);
    expect(sql).toContain('WHERE owner_id=?');
    expect(sql).toContain("status IN ('completed','failed','expired')");
    expect(sql).toContain("status NOT IN ('parsing','queued','running')");
    expect(sql).toContain('lease_until<NOW()');
    expect(sql).toContain("error_code<>'NOTE_IMPORT_DISMISSED'");
    expect(sql).toContain('expires_at=NOW()');
    expect(sql).toContain("status=IF(status='expired','expired','failed')");
  });
  it('returns zero when there is no eligible history', async () => {
    db.query.mockResolvedValueOnce([{ affectedRows: 0 }]);
    expect(await clearImportHistory('owner')).toEqual({ clearedCount: 0 });
  });
});
