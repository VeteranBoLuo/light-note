import { describe, expect, it, vi } from 'vitest';
vi.mock('../../db/index.js', () => ({ default: { query: vi.fn() } }));
const { buildVisitorPlan, snapshotHash, applyVisitorPlan, readVisitorSnapshot } =
  await import('./visitorExampleMaintenanceService.js');
const manifest = await import('../../scripts/visitorExamples/manifest.mjs');
function snapshot() {
  return {
    user: { id: 'visitor', role: 'visitor', del_flag: 0 },
    tables: {
      bookmark: manifest.associations.map((p) => ({
        id: p.key,
        name: p.bookmark,
        url: 'https://example.com/' + p.key,
        del_flag: 0,
      })),
      note: manifest.visitorNotes
        .filter((n) => n.existing)
        .map((n) => ({ id: n.key, title: n.existing, type: n.type, content: '', del_flag: 0 })),
      note_resource_refs: [],
      toolbox_workspace_resources: [],
      toolbox_workspaces: manifest.associations.map((p) => ({ id: manifest.workshopId(p.key), status: 'active' })),
    },
    related: { todo_resource_refs: [] },
  };
}
describe('visitor sample maintenance', () => {
  it('keeps all existing bookmarks unchanged and never plans bookmark removal', () => {
    const old = snapshot();
    const original = structuredClone(old.tables.bookmark);
    const plan = buildVisitorPlan(old, manifest);
    expect(plan.bookmarks).toEqual(original);
    expect(plan.archive).toEqual([]);
    expect(plan.notes.find((n) => n.key === 'welcome').id).toBe('welcome');
  });
  it('rejects ordinary users before reading or writing resources', async () => {
    const db = { query: vi.fn().mockResolvedValue([[{ id: 'user', role: 'user', del_flag: 0 }]]) };
    await expect(readVisitorSnapshot(db, 'user', true)).rejects.toThrow();
    expect(db.query).toHaveBeenCalledTimes(1);
  });
  it('rejects concurrent changes before issuing a write', async () => {
    const original = snapshot();
    const db = { query: vi.fn(async (sql) => (String(sql).includes('FROM user ') ? [[original.user]] : [[]])) };
    await expect(applyVisitorPlan(db, { snapshot: original, manifest })).rejects.toThrow('VISITOR_SNAPSHOT_CONFLICT');
    expect(db.query.mock.calls.every(([sql]) => String(sql).startsWith('SELECT'))).toBe(true);
  });
  it('does not generate missing project links', () => {
    const old = snapshot();
    old.tables.toolbox_workspaces = [];
    expect(() => buildVisitorPlan(old, manifest)).toThrow('Example project missing');
  });
});
