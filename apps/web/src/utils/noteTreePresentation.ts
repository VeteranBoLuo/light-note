import { normalizeNoteType } from '@lightnote/shared';
import icon from '@/config/icon';

export function getNoteTreePageIcon(type?: string | null) {
  return normalizeNoteType(type) === 'markdown' ? icon.resource.noteMarkdown : icon.resource.note;
}
