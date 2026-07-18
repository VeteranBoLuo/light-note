export type AiSourceType = 'note' | 'bookmark' | 'file' | 'knowledge' | 'document' | 'tag' | 'folder' | 'web';

export type AiSourceTarget =
  | 'note-detail'
  | 'bookmark-url'
  | 'bookmark-edit'
  | 'bookmark-snapshot'
  | 'cloud-file'
  | 'cloud-folder'
  | 'help-article'
  | 'public-knowledge'
  | 'knowledge-admin'
  | 'tag-detail'
  | 'web-url'
  | 'temporary-document';

export interface AiSource {
  type: AiSourceType;
  id: string;
  title: string;
  url?: string;
  excerpt?: string;
  target?: AiSourceTarget;
  documentId?: string;
  fileId?: string;
  sourceType?: 'temporary' | 'cloud';
  locatorType?: 'page' | 'section' | 'row' | 'paragraph';
  locatorValue?: string;
  category?: string;
  status?: 'public' | 'internal';
  hasSnapshot?: boolean;
}

export type AiSourceNavigation =
  | { kind: 'internal'; target: string | { path: string; query?: Record<string, string> } }
  | { kind: 'external'; url: string }
  | { kind: 'none' };

export function normalizeSourceHref(value?: string): string {
  const raw = String(value || '').trim();
  if (!raw || raw.startsWith('//')) return '';
  try {
    if (raw.startsWith('/')) {
      const parsed = new URL(raw, 'https://light-note.invalid');
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    }
    if (!/^https?:\/\//i.test(raw)) return '';
    const parsed = new URL(raw);
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) return '';
    return parsed.href;
  } catch {
    return '';
  }
}

function internal(path: string, query?: Record<string, string>): AiSourceNavigation {
  return { kind: 'internal', target: query ? { path, query } : path };
}

function external(url?: string): AiSourceNavigation {
  const safeUrl = normalizeSourceHref(url);
  return safeUrl ? { kind: 'external', url: safeUrl } : { kind: 'none' };
}

function resolveExplicitTarget(source: AiSource): AiSourceNavigation | null {
  if (!source.target) return null;
  if (source.target === 'note-detail') return source.id ? internal(`/noteLibrary/${source.id}`) : { kind: 'none' };
  if (source.target === 'bookmark-url') return external(source.url);
  if (source.target === 'bookmark-edit')
    return source.id ? internal(`/manage/editBookmark/${source.id}`) : { kind: 'none' };
  if (source.target === 'bookmark-snapshot')
    return source.id ? internal('/manage/bookmarkMg', { snapshot: source.id }) : { kind: 'none' };
  if (source.target === 'cloud-file')
    return source.fileId || source.id
      ? internal('/cloudSpace', { fileId: String(source.fileId || source.id) })
      : { kind: 'none' };
  if (source.target === 'cloud-folder')
    return source.id ? internal('/cloudSpace', { folderId: source.id }) : { kind: 'none' };
  if (source.target === 'help-article') return source.id ? internal('/help', { article: source.id }) : { kind: 'none' };
  if (source.target === 'public-knowledge')
    return source.id ? external(`/helpCenter/${encodeURIComponent(source.id)}`) : { kind: 'none' };
  if (source.target === 'knowledge-admin')
    return source.id ? internal('/knowledgeBase', { article: source.id }) : { kind: 'none' };
  if (source.target === 'tag-detail') return source.id ? internal(`/tag/${source.id}`) : { kind: 'none' };
  if (source.target === 'web-url' || source.target === 'temporary-document') return external(source.url);
  return { kind: 'none' };
}

export function resolveAiSourceNavigation(source: AiSource): AiSourceNavigation {
  const explicit = resolveExplicitTarget(source);
  if (explicit) return explicit;

  // 兼容上线前已经保存在浏览器本地的旧会话；新来源均应由服务端显式返回 target。
  if (source.type === 'note') return source.id ? internal(`/noteLibrary/${source.id}`) : { kind: 'none' };
  if (source.type === 'file') return source.id ? internal('/cloudSpace', { fileId: source.id }) : { kind: 'none' };
  if (source.type === 'document') {
    if (source.fileId && source.sourceType !== 'temporary') {
      return internal('/cloudSpace', { fileId: source.fileId });
    }
    return external(source.url);
  }
  if (source.type === 'knowledge') {
    if (!source.id) return { kind: 'none' };
    if (source.status === 'public' && source.category && source.category !== '帮助中心') {
      return external(`/helpCenter/${encodeURIComponent(source.id)}`);
    }
    return internal('/help', { article: source.id });
  }
  if (source.type === 'bookmark') {
    const urlNavigation = external(source.url);
    if (urlNavigation.kind !== 'none') return urlNavigation;
    return source.id ? internal(`/manage/editBookmark/${source.id}`) : { kind: 'none' };
  }
  if (source.type === 'tag') return source.id ? internal(`/tag/${source.id}`) : { kind: 'none' };
  if (source.type === 'folder') return source.id ? internal('/cloudSpace', { folderId: source.id }) : { kind: 'none' };
  if (source.type === 'web') return external(source.url);
  return { kind: 'none' };
}
