import { describe, it, expect, vi } from 'vitest';
const db = { query: vi.fn() };
vi.mock('../../db/index.js', () => ({ default: db }));
const { readNoteExportScope } = await import('./noteExportService.js');
describe('directory export scope', () => {
  it('uses the whole owned tree including unexpanded grandchildren', async () => {
    db.query.mockResolvedValue([
      [
        { id: 'a', title: 'A', type: 'html', revision: 1, parent_id: null },
        { id: 'b', title: 'B', type: 'markdown', revision: 1, parent_id: 'a' },
        { id: 'c', title: 'C', type: 'drawing', revision: 1, parent_id: 'b' },
      ],
    ]);
    const all = await readNoteExportScope('owner', { rootNoteId: 'a', includeDescendants: true });
    expect(all.count).toBe(3);
    expect(all.drawingCount).toBe(1);
    const self = await readNoteExportScope('owner', { rootNoteId: 'a', includeDescendants: false });
    expect(self.count).toBe(1);
    expect(self.descendantCount).toBe(2);
    expect(db.query.mock.calls[0][1]).toEqual(['owner']);
  });
  it('rejects ambiguous scopes and other owners missing root', async () => {
    await expect(
      readNoteExportScope('o', { rootNoteId: 'a', ids: ['a'], includeDescendants: true }),
    ).rejects.toMatchObject({ code: 'NOTE_EXPORT_INVALID_SCOPE' });
    db.query.mockResolvedValue([[]]);
    await expect(readNoteExportScope('o', { rootNoteId: 'a', includeDescendants: true })).rejects.toMatchObject({
      code: 'NOTE_TREE_NODE_NOT_FOUND',
    });
  });
  it('invalidates a scope when content revision or membership changes', async () => {
    db.query.mockResolvedValue([[{ id: 'a', title: 'A', revision: 1 }]]);
    const first = await readNoteExportScope('o', { rootNoteId: 'a', includeDescendants: true });
    db.query.mockResolvedValue([[{ id: 'a', title: 'A', revision: 2 }]]);
    const next = await readNoteExportScope('o', { rootNoteId: 'a', includeDescendants: true });
    expect(first.scopeToken).not.toBe(next.scopeToken);
  });
});
