import { expect, it, vi } from 'vitest';
import { scheduleStaticPrewarm } from './staticPrewarm';
import { scheduleNoteEditorStartupPreload } from './noteEditorStartupPreload';
vi.mock('./staticPrewarm', () => ({ scheduleStaticPrewarm: vi.fn(() => () => {}) }));
it('submits only static groups to the shared scheduler', () => {
  scheduleNoteEditorStartupPreload();
  expect(scheduleStaticPrewarm).toHaveBeenCalledWith({
    groups: ['route.noteDetail', 'editor.html', 'editor.markdown'],
    priority: 2,
  });
});
