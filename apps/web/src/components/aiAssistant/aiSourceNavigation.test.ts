import { describe, expect, it } from 'vitest';
import { normalizeSourceHref, resolveAiSourceNavigation, type AiSource } from './aiSourceNavigation';

describe('resolveAiSourceNavigation', () => {
  const internalCases: Array<[string, AiSource, unknown]> = [
    ['笔记详情', { type: 'note', id: 'note-id', title: 'Note', target: 'note-detail' }, '/noteLibrary/note-id'],
    [
      '书签编辑',
      { type: 'bookmark', id: 'bookmark-id', title: 'Bookmark', target: 'bookmark-edit' },
      '/manage/editBookmark/bookmark-id',
    ],
    [
      '书签快照',
      { type: 'bookmark', id: 'bookmark-id', title: 'Snapshot', target: 'bookmark-snapshot' },
      { path: '/manage/bookmarkMg', query: { snapshot: 'bookmark-id' } },
    ],
    [
      '云文件精确预览',
      { type: 'file', id: 'file-id', title: 'report.docx', target: 'cloud-file' },
      { path: '/cloudSpace', query: { fileId: 'file-id' } },
    ],
    [
      '云文件夹',
      { type: 'folder', id: 'folder-id', title: 'Research', target: 'cloud-folder' },
      { path: '/cloudSpace', query: { folderId: 'folder-id' } },
    ],
    [
      '帮助中心文章',
      { type: 'knowledge', id: 'faq-id', title: 'FAQ', target: 'help-article' },
      { path: '/help', query: { article: 'faq-id' } },
    ],
    [
      '管理员内部知识',
      { type: 'knowledge', id: 'internal-id', title: 'Runbook', target: 'knowledge-admin' },
      { path: '/knowledgeBase', query: { article: 'internal-id' } },
    ],
    ['标签详情', { type: 'tag', id: 'tag-id', title: 'AI', target: 'tag-detail' }, '/tag/tag-id'],
  ];

  it.each(internalCases)('%s使用明确的站内语义路由', (_label, source, target) => {
    expect(resolveAiSourceNavigation(source)).toEqual({ kind: 'internal', target });
  });

  it('公开的非帮助中心知识打开公开知识页', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'knowledge',
        id: 'public-id',
        title: 'Guide',
        target: 'public-knowledge',
      }),
    ).toEqual({ kind: 'external', url: '/helpCenter/public-id' });
  });

  it('书签原网页与检索网页只接受 HTTP(S) 地址', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'bookmark',
        id: 'bookmark-id',
        title: 'Bookmark',
        target: 'bookmark-url',
        url: 'https://example.com/docs',
      }),
    ).toEqual({ kind: 'external', url: 'https://example.com/docs' });
    expect(
      resolveAiSourceNavigation({
        type: 'web',
        id: 'bad-url',
        title: 'Unsafe',
        target: 'web-url',
        url: 'javascript:alert(1)',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('临时文档有安全预览地址时可打开，没有地址时保持静态', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'temporary-document-id',
        title: 'meeting-notes.pdf',
        sourceType: 'temporary',
        target: 'temporary-document',
        url: 'https://download.example/meeting-notes.pdf',
      }),
    ).toEqual({ kind: 'external', url: 'https://download.example/meeting-notes.pdf' });
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'temporary-document-id',
        title: 'meeting-notes.pdf',
        sourceType: 'temporary',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('兼容旧会话中的云文件、知识、书签与标签来源', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'legacy-document-id',
        fileId: 'cloud-file-id',
        title: 'meeting-notes.pdf',
      }),
    ).toEqual({ kind: 'internal', target: { path: '/cloudSpace', query: { fileId: 'cloud-file-id' } } });
    expect(resolveAiSourceNavigation({ type: 'knowledge', id: 'faq-id', title: 'FAQ' })).toEqual({
      kind: 'internal',
      target: { path: '/help', query: { article: 'faq-id' } },
    });
    expect(resolveAiSourceNavigation({ type: 'bookmark', id: 'bookmark-id', title: 'Bookmark' })).toEqual({
      kind: 'internal',
      target: '/manage/editBookmark/bookmark-id',
    });
    expect(resolveAiSourceNavigation({ type: 'tag', id: 'tag-id', title: 'Tag' })).toEqual({
      kind: 'internal',
      target: '/tag/tag-id',
    });
  });

  it('公开旧知识根据分类进入公开知识页', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'knowledge',
        id: 'guide-id',
        title: 'Guide',
        status: 'public',
        category: '使用指南',
      }),
    ).toEqual({ kind: 'external', url: '/helpCenter/guide-id' });
  });

  it('缺少稳定标识的来源保持不可导航', () => {
    expect(resolveAiSourceNavigation({ type: 'note', id: '', title: 'Note' })).toEqual({ kind: 'none' });
    expect(resolveAiSourceNavigation({ type: 'knowledge', id: '', title: 'FAQ' })).toEqual({ kind: 'none' });
    expect(resolveAiSourceNavigation({ type: 'bookmark', id: '', title: 'Bookmark' })).toEqual({ kind: 'none' });
  });

  it('未知来源不会被猜成书签', () => {
    expect(
      resolveAiSourceNavigation({ type: 'future-source', id: 'future-id', title: 'Future source' } as any),
    ).toEqual({ kind: 'none' });
  });
});

describe('normalizeSourceHref', () => {
  it('保留站内相对地址和 HTTP(S) 地址，拒绝协议相对、凭据与危险协议', () => {
    expect(normalizeSourceHref('/helpCenter/article-id?from=ai')).toBe('/helpCenter/article-id?from=ai');
    expect(normalizeSourceHref('https://example.com/path')).toBe('https://example.com/path');
    expect(normalizeSourceHref('//evil.example/path')).toBe('');
    expect(normalizeSourceHref('helpCenter/article-id')).toBe('');
    expect(normalizeSourceHref('https://user:pass@example.com')).toBe('');
    expect(normalizeSourceHref('data:text/html,test')).toBe('');
  });
});
