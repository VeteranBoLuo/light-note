import { describe, it, expect, vi } from 'vitest';
import { getPublicToolboxCatalog } from '../toolbox/catalog.js';
import {
  getToolboxPinnedTools,
  updateToolboxPinnedTools,
  preserveToolboxPinnedTools,
} from './toolboxPinnedToolsService.js';
const user = { id: 'owner', role: 'user' };
const ids = getPublicToolboxCatalog()
  .tools.filter((tool) => tool.availability.enabled)
  .map((tool) => tool.id);
function database(initial = {}) {
  let stored = JSON.stringify(initial);
  const connection = {
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(),
    release: vi.fn(),
    query: vi.fn(async (sql, values) => {
      if (sql.startsWith('SELECT')) return [[{ preferences: stored }]];
      stored = values[0];
      return [{ affectedRows: 1 }];
    }),
  };
  return {
    query: connection.query,
    getConnection: async () => connection,
    connection,
    stored: () => JSON.parse(stored),
  };
}
describe('account pinned tools', () => {
  it('imports once, preserves unrelated preferences, and does not resurrect after clear', async () => {
    const db = database({ theme: 'night' });
    const update = (input) => updateToolboxPinnedTools({ user, db, input });
    expect(await getToolboxPinnedTools({ user, db })).toEqual({ initialized: false, toolIds: [] });
    expect(await update({ action: 'migrate', toolIds: [ids[0], ids[0], 'unknown'] })).toEqual({
      initialized: true,
      toolIds: [ids[0]],
    });
    await update({ toolId: ids[0], pinned: false });
    expect(await update({ action: 'migrate', toolIds: [ids[1]] })).toEqual({ initialized: true, toolIds: [] });
    expect(db.stored()).toEqual({ theme: 'night', toolboxPinnedTools: [] });
  });
  it('single-tool operations are idempotent, retain other pins and enforce the limit', async () => {
    const db = database();
    for (const id of ids.slice(0, 6)) await updateToolboxPinnedTools({ user, db, input: { toolId: id, pinned: true } });
    const duplicate = await updateToolboxPinnedTools({ user, db, input: { toolId: ids[0], pinned: true } });
    expect(duplicate.toolIds).toEqual(ids.slice(0, 6));
    await expect(updateToolboxPinnedTools({ user, db, input: { toolId: ids[6], pinned: true } })).rejects.toMatchObject(
      { code: 'TOOLBOX_PIN_LIMIT' },
    );
    expect(db.connection.rollback).toHaveBeenCalledOnce();
    expect((await updateToolboxPinnedTools({ user, db, input: { toolId: ids[0], pinned: false } })).toolIds).toEqual(
      ids.slice(1, 6),
    );
  });
  it('rejects visitors, unknown tools, invalid payloads and owner spoofing', async () => {
    const db = database();
    await expect(getToolboxPinnedTools({ user: { id: 'guest', role: 'visitor' }, db })).rejects.toMatchObject({
      status: 403,
    });
    for (const input of [
      { toolId: 'unknown', pinned: true },
      { toolId: ids[0], pinned: true, userId: 'other' },
      { action: 'migrate', toolIds: Array(7).fill(ids[0]) },
      { toolId: ids[0], pinned: 'true' },
    ]) {
      await expect(updateToolboxPinnedTools({ user, db, input })).rejects.toMatchObject({ status: 400 });
    }
    expect(db.connection.beginTransaction).not.toHaveBeenCalled();
  });
  it('ordinary preference saves cannot erase or forge account pins', () => {
    expect(
      JSON.parse(
        preserveToolboxPinnedTools({ theme: 'day', toolboxPinnedTools: ['forged'] }, { toolboxPinnedTools: [] }),
      ),
    ).toEqual({ theme: 'day', toolboxPinnedTools: [] });
    expect(JSON.parse(preserveToolboxPinnedTools({ toolboxPinnedTools: [ids[0]] }, {}))).toEqual({});
  });
});
