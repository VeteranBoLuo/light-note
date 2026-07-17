import { describe, expect, it } from 'vitest';
import { resolveAiSourceNavigation } from './aiSourceNavigation';

describe('resolveAiSourceNavigation', () => {
  it('临时上传文件只作为当前对话引用，不错误跳转到书签', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'temporary-document-id',
        title: 'meeting-notes.pdf',
        sourceType: 'temporary',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('临时上传文件带只读预览地址时直接打开原文件', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'temporary-document-id',
        title: 'meeting-notes.pdf',
        sourceType: 'temporary',
        url: 'https://download.example/meeting-notes.pdf',
      }),
    ).toEqual({ kind: 'external', url: 'https://download.example/meeting-notes.pdf' });
  });

  it('云空间文件来源仍进入云空间并按文件名筛选', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'cloud-document-id',
        fileId: 'cloud-file-id',
        title: 'meeting-notes.pdf',
        sourceType: 'cloud',
      }),
    ).toEqual({
      kind: 'internal',
      target: { path: '/cloudSpace', query: { fileName: 'meeting-notes.pdf' } },
    });
  });

  it('兼容旧会话中未返回 sourceType 的云文件来源', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'legacy-cloud-document-id',
        fileId: 'cloud-file-id',
        title: 'meeting-notes.pdf',
      }),
    ).toEqual({
      kind: 'internal',
      target: { path: '/cloudSpace', query: { fileName: 'meeting-notes.pdf' } },
    });
  });

  it('显式文件来源仍进入云空间', () => {
    expect(resolveAiSourceNavigation({ type: 'file', id: 'cloud-file-id', title: 'report.docx' })).toEqual({
      kind: 'internal',
      target: { path: '/cloudSpace', query: { fileName: 'report.docx' } },
    });
  });

  it('笔记来源进入笔记详情', () => {
    expect(resolveAiSourceNavigation({ type: 'note', id: 'note-id', title: 'Note' })).toEqual({
      kind: 'internal',
      target: '/noteLibrary/note-id',
    });
  });

  it('知识库来源进入帮助中心文章', () => {
    expect(resolveAiSourceNavigation({ type: 'knowledge', id: 'faq-id', title: 'FAQ' })).toEqual({
      kind: 'internal',
      target: { path: '/help', query: { article: 'faq-id' } },
    });
  });

  it('带 URL 的书签来源打开外部页面', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'bookmark',
        id: 'bookmark-id',
        title: 'Bookmark',
        url: 'https://example.com',
      }),
    ).toEqual({ kind: 'external', url: 'https://example.com' });
  });

  it('书签来源继续使用自身编辑路由', () => {
    expect(resolveAiSourceNavigation({ type: 'bookmark', id: 'bookmark-id', title: 'Bookmark' })).toEqual({
      kind: 'internal',
      target: '/manage/editBookmark/bookmark-id',
    });
  });

  it('缺少目标标识的来源保持不可导航，不再兜底成书签', () => {
    expect(resolveAiSourceNavigation({ type: 'note', id: '', title: 'Note' })).toEqual({ kind: 'none' });
    expect(resolveAiSourceNavigation({ type: 'knowledge', id: '', title: 'FAQ' })).toEqual({ kind: 'none' });
    expect(resolveAiSourceNavigation({ type: 'bookmark', id: '', title: 'Bookmark' })).toEqual({ kind: 'none' });
  });

  it('未知来源不会被默认猜成书签', () => {
    expect(
      resolveAiSourceNavigation({ type: 'future-source', id: 'future-id', title: 'Future source' } as any),
    ).toEqual({ kind: 'none' });
  });
});
