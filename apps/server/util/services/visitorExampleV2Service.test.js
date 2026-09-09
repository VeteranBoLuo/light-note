import { describe, it, expect } from 'vitest';
import { SNAPSHOT_TABLES, planVisitorV2, visitorChanges, verifyVisitorRestore } from './visitorExampleV2Service.js';
import {
  noteThemes,
  todos,
  pendingNotes,
  pinnedNotes,
  buildNoteBodies,
} from '../../scripts/visitorExamples/manifestV2.mjs';
import { sanitizePersistedNoteContent } from '../noteHtmlSanitizer.js';
const snapshot = () => ({
  owner: 'v',
  tables: {
    ...Object.fromEntries(Object.keys(SNAPSHOT_TABLES).map((k) => [k, []])),
    note: Object.keys(noteThemes)
      .slice(0, 16)
      .map((title, i) => ({ id: 'n' + i, create_by: 'v', title, del_flag: 0 })),
    files: [{ id: 1, file_name: 'unknown.bin', folder_id: 5, del_flag: 0 }],
  },
});
describe('visitor v2 inventory and recovery', () => {
  it('covers the four quadrants, classification and intentional organization gaps', () => {
    const active = todos.filter((t) => t.status === 'pending').slice(0, 8);
    const q = [0, 0, 0, 0];
    for (const t of active) q[(t.priority === 2 ? 0 : 2) + (t.offset !== null && t.offset <= 0 ? 0 : 1)]++;
    expect(q).toEqual([2, 2, 2, 2]);
    expect(todos.filter((t) => t.status === 'completed')).toHaveLength(2);
    const untagged = Object.keys(noteThemes).filter((n) => !noteThemes[n].length);
    expect(untagged).toHaveLength(2);
    expect(pendingNotes.filter((n) => untagged.includes(n))).toHaveLength(1);
    expect(pinnedNotes).toHaveLength(3);
    const plan = planVisitorV2(snapshot());
    expect(plan.files[0].placement).toBeNull();
    expect(plan.notes.filter((n) => !n.id)).toHaveLength(2);
  });
  it('preserves unmatched/unsafe existing tasks, rejects ambiguous exact matches', () => {
    const s = snapshot();
    s.tables.todo_items = [{ id: 'old', title: todos[0].title, status: 'completed' }];
    const plan = planVisitorV2(s);
    expect(plan.todos[0]).toMatchObject({ id: null, retainedId: 'old' });
    s.tables.todo_items.push({ ...s.tables.todo_items[0], id: 'duplicate' });
    expect(() => planVisitorV2(s)).toThrow('VISITOR_AMBIGUOUS_SAMPLE');
  });
  it('retains controlled rich effects, hosted images and media composition on repeated sanitization', () => {
    const body = buildNoteBodies({
      welcome: 'https://boluo66.top/uploads/note-a.png',
      weekend: 'https://boluo66.top/uploads/note-b.png',
      inspiration: 'https://boluo66.top/uploads/note-c.png',
    })['富文本样式示例'];
    const saved = sanitizePersistedNoteContent(body, 'html');
    expect(sanitizePersistedNoteContent(saved, 'html')).toBe(saved);
    for (const token of [
      'ln-text-gradient',
      'ln-rich-text-glow',
      'ln-rich-effect-breathe',
      'ln-rich-gradient-border',
      'ln-media-text',
      'data-ln-media-width="42"',
      '<table',
      '<img',
    ])
      expect(saved).toContain(token);
  });
  it('restores only recorded changes and refuses subsequent manual edits', () => {
    const before = snapshot(),
      after = structuredClone(before);
    after.tables.note[0].is_top = 1;
    const changes = structuredClone(visitorChanges(before, after));
    expect(() => verifyVisitorRestore(after, changes, { rolling: [] })).not.toThrow();
    after.tables.note[0].title = '编辑过';
    expect(() => verifyVisitorRestore(after, changes, { rolling: [] })).toThrow('VISITOR_RESTORE_CONFLICT');
  });
});
