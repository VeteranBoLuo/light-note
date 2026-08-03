import type { AiToolConfirmation } from '@/types/aiAgent';

export const MAX_RENDERED_NOTE_CONFIRMATION_LENGTH = 20_000;

export interface NoteConfirmationContentPreview {
  source: string;
  renderedSource: string;
  truncated: boolean;
}

const CONTENT_KEYS = ['content', 'noteContent', 'note_content', 'body', 'markdown'] as const;

function contentArg(args: Record<string, unknown>) {
  for (const key of CONTENT_KEYS) {
    const value = args[key];
    if (value == null) continue;
    const content = String(value);
    if (content.trim()) return content;
  }
  return '';
}

/**
 * create_note 的 args 已由服务端规范化并封进不可篡改的确认令牌。
 * 前端只负责展示同一份权威正文，不重建、修改或回传执行参数。
 */
export function buildNoteConfirmationContentPreview(
  confirmation: AiToolConfirmation,
): NoteConfirmationContentPreview | undefined {
  if (confirmation.toolName !== 'create_note') return undefined;
  const source = contentArg(confirmation.args || {});
  if (!source) return undefined;

  return {
    source,
    renderedSource: source.slice(0, MAX_RENDERED_NOTE_CONFIRMATION_LENGTH),
    truncated: source.length > MAX_RENDERED_NOTE_CONFIRMATION_LENGTH,
  };
}
