import { normalizeMarkdownBlockquoteEntities, normalizeNoteType } from '@lightnote/shared';
import { serializeDrawingScene } from '@lightnote/shared/drawing-note';
import { sanitizePersistedNoteContent } from './noteHtmlSanitizer.js';

// 所有详情型读接口共用同一规范读模型，避免拥有者详情、公开分享和历史版本对旧数据作不同解释。
export function normalizeCanonicalNoteContent(content, type) {
  const normalizedType = normalizeNoteType(type);
  if (normalizedType === 'drawing') return serializeDrawingScene(content);
  return normalizedType === 'markdown' ? normalizeMarkdownBlockquoteEntities(content) : content;
}

export function normalizeCanonicalNoteRecord(record) {
  if (!record) return record;
  if (record.type === 'drawing') {
    return { ...record, content: serializeDrawingScene(record.content) };
  }
  // 历史 `md` 记录的正文实际可能是 HTML，不能在读路径把它当作 Markdown 源码改写。
  if (record.type === 'html' || record.type === 'md') {
    return {
      ...record,
      content: sanitizePersistedNoteContent(record.content, 'html', 'read-note-content'),
    };
  }
  if (record.type === 'markdown') {
    return { ...record, content: normalizeMarkdownBlockquoteEntities(record.content) };
  }
  return record;
}
