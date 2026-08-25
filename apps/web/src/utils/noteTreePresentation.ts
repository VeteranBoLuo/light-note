import { normalizeNoteType } from '@lightnote/shared';
import icon from '@/config/icon';

export function getNoteTreePageIcon(type?: string | null) {
  const normalizedType = normalizeNoteType(type);
  if (normalizedType === 'drawing') return icon.resource.noteDrawing;
  return normalizedType === 'markdown' ? icon.resource.noteMarkdown : icon.resource.noteHtml;
}

export function getNoteTreePageColor(type?: string | null) {
  const normalizedType = normalizeNoteType(type);
  if (normalizedType === 'drawing') return 'var(--note-format-drawing-color, #c13a5d)';
  if (normalizedType === 'markdown') return 'var(--note-format-markdown-color, var(--primary-color, #615ced))';
  return 'var(--note-format-html-color, var(--resource-note-color, #00a884))';
}

export function isMarkdownNoteTreePage(type?: string | null) {
  return normalizeNoteType(type) === 'markdown';
}
