export interface AiSource {
  type: 'note' | 'bookmark' | 'file' | 'knowledge' | 'document';
  id: string;
  title: string;
  url?: string;
  excerpt?: string;
  documentId?: string;
  fileId?: string;
  sourceType?: 'temporary' | 'cloud';
  locatorType?: 'page' | 'section' | 'row' | 'paragraph';
  locatorValue?: string;
}

export type AiSourceNavigation =
  | { kind: 'internal'; target: string | { path: string; query?: Record<string, string> } }
  | { kind: 'external'; url: string }
  | { kind: 'none' };

export function resolveAiSourceNavigation(source: AiSource): AiSourceNavigation {
  if (source.type === 'note') {
    return source.id ? { kind: 'internal', target: `/noteLibrary/${source.id}` } : { kind: 'none' };
  }
  if (source.type === 'file') {
    return { kind: 'internal', target: { path: '/cloudSpace', query: { fileName: source.title } } };
  }
  if (source.type === 'document') {
    // 云文件继续进入云空间；临时上传文件使用服务端完成归属校验后签发的短时只读预览地址。
    // 早期会话可能既没有 fileId 也没有预览地址，此时保持静态来源，绝不能落入书签路由。
    if (source.fileId && source.sourceType !== 'temporary') {
      return { kind: 'internal', target: { path: '/cloudSpace', query: { fileName: source.title } } };
    }
    if (source.url) return { kind: 'external', url: source.url };
    return { kind: 'none' };
  }
  if (source.type === 'knowledge') {
    return source.id
      ? { kind: 'internal', target: { path: '/help', query: { article: source.id } } }
      : { kind: 'none' };
  }
  if (source.type === 'bookmark') {
    if (source.url) return { kind: 'external', url: source.url };
    return source.id ? { kind: 'internal', target: `/manage/editBookmark/${source.id}` } : { kind: 'none' };
  }
  // 运行时若收到未来新增但当前客户端不认识的类型，也不允许猜成书签。
  return { kind: 'none' };
}
