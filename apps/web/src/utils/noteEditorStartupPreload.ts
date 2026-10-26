import { scheduleStaticPrewarm } from './staticPrewarm';

/** Byte-only warmup: editor code is evaluated by the normal, user-triggered loader. */
export function scheduleNoteEditorStartupPreload() {
  return scheduleStaticPrewarm({ groups: ['route.noteDetail', 'editor.html', 'editor.markdown'], priority: 2 });
}
