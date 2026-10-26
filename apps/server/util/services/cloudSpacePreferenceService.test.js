import { describe, it, expect, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: {} }));
import { cloudSpacePreference } from './cloudSpacePreferenceService.js';
import { preserveCloudSpacePreference } from '../cloudSpacePreferences.js';

const user = { id: 'owner', role: 'user' };
function db(preferences = { theme: 'night', cloudView: 'table' }) {
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql) => (String(sql).startsWith('SELECT') ? [[{ preferences }]] : [{ affectedRows: 1 }])),
  };
  return { ...connection, getConnection: vi.fn(async () => connection), connection };
}
describe('cloud file display account preference', () => {
  it('defaults off and reads the account after a new login/device', async () => {
    expect(await cloudSpacePreference({ user, database: db() })).toEqual({ includeDescendants: false });
    expect(await cloudSpacePreference({ user, database: db({ cloudIncludeDescendants: true }) })).toEqual({
      includeDescendants: true,
    });
  });
  it('locks and merges just this field, preserving concurrent unrelated preferences', async () => {
    const database = db({ theme: 'night', cloudView: 'table', homePage: 'workbench' });
    expect(await cloudSpacePreference({ user, input: { includeDescendants: true }, write: true, database })).toEqual({
      includeDescendants: true,
    });
    expect(database.connection.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(database.connection.query.mock.calls[1][1]).toEqual([
      JSON.stringify({ theme: 'night', cloudView: 'table', homePage: 'workbench', cloudIncludeDescendants: true }),
      'owner',
    ]);
    expect(database.connection.commit).toHaveBeenCalledOnce();
  });
  it('retains this field through stale full-object saves; cannot inject it through legacy writes', () => {
    expect(
      JSON.parse(
        preserveCloudSpacePreference(
          { theme: 'day', cloudIncludeDescendants: false },
          { cloudIncludeDescendants: true },
        ),
      ),
    ).toEqual({ theme: 'day', cloudIncludeDescendants: true });
    expect(JSON.parse(preserveCloudSpacePreference({ cloudIncludeDescendants: true }, {}))).toEqual({});
  });
  it.each([{ includeDescendants: 'true' }, { includeDescendants: true, userId: 'other' }, {}])(
    'rejects malformed or expanded payloads',
    async (input) => {
      const database = db();
      await expect(cloudSpacePreference({ user, input, write: true, database })).rejects.toMatchObject({ status: 400 });
      expect(database.getConnection).not.toHaveBeenCalled();
    },
  );
  it('rejects visitors and rolls back failed writes', async () => {
    await expect(cloudSpacePreference({ user: { ...user, role: 'visitor' }, database: db() })).rejects.toMatchObject({
      status: 403,
    });
    const database = db();
    database.connection.query.mockRejectedValueOnce(new Error('db unavailable'));
    await expect(
      cloudSpacePreference({ user, input: { includeDescendants: true }, write: true, database }),
    ).rejects.toThrow();
    expect(database.connection.rollback).toHaveBeenCalledOnce();
    expect(database.connection.release).toHaveBeenCalledOnce();
  });
});
