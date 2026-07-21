import { describe, expect, it } from 'vitest';
import {
  formatAiCoverageRange,
  formatAiEvidenceLocator,
  getAiCoverageRatio,
  groupAiEvidence,
  normalizeSourceHref,
  resolveAiCoverageState,
  resolveAiSourceNavigation,
  type AiSource,
  type AiSourceCoverage,
} from './aiSourceNavigation';

const zhCoverageRangeLabels = {
  range: '范围',
  units: { page: '页', char: '字符', chunk: '分块', paragraph: '段落' },
};
const zhEvidenceLocatorLabels = {
  types: { page: '页码', section: '章节', paragraph: '段落', row: '行', chunk: '分块', status: '状态' },
  pageValue: (value: string) => `第 ${value} 页`,
  sectionValue: (value: string) => `章节 ${value}`,
  paragraphValue: (value: string) => `第 ${value} 段`,
};

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
    ['待办收件箱', { type: 'todo', id: 'todo-id', title: '待处理', target: 'todo-inbox' }, '/inbox'],
  ];

  it.each(internalCases)('%s使用明确的站内语义路由', (_label, source, target) => {
    expect(resolveAiSourceNavigation(source)).toEqual({ kind: 'internal', target });
  });

  it('旧会话中的公开知识 SEO 目标保持静态', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'knowledge',
        id: 'public-id',
        title: 'Guide',
        target: 'public-knowledge',
      }),
    ).toEqual({ kind: 'none' });
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

  it('兼容旧会话中的云文件、书签与标签来源，未知知识来源保持静态', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'document',
        id: 'legacy-document-id',
        fileId: 'cloud-file-id',
        title: 'meeting-notes.pdf',
      }),
    ).toEqual({ kind: 'internal', target: { path: '/cloudSpace', query: { fileId: 'cloud-file-id' } } });
    expect(resolveAiSourceNavigation({ type: 'knowledge', id: 'faq-id', title: 'FAQ' })).toEqual({
      kind: 'none',
    });
    expect(
      resolveAiSourceNavigation({
        type: 'knowledge',
        id: 'help-id',
        title: '帮助文章',
        status: 'public',
        category: '帮助中心',
      }),
    ).toEqual({
      kind: 'internal',
      target: { path: '/help', query: { article: 'help-id' } },
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

  it('公开但非帮助中心的旧知识保持静态', () => {
    expect(
      resolveAiSourceNavigation({
        type: 'knowledge',
        id: 'guide-id',
        title: 'Guide',
        status: 'public',
        category: '使用指南',
      }),
    ).toEqual({ kind: 'none' });
  });

  it('兼容未携带明确 target 的旧待办来源', () => {
    expect(resolveAiSourceNavigation({ type: 'todo', id: 'todo-id', title: '待处理' })).toEqual({
      kind: 'internal',
      target: '/inbox',
    });
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

function coverage(overrides: Partial<AiSourceCoverage> = {}): AiSourceCoverage {
  return {
    metadataAvailable: true,
    complete: true,
    truncated: false,
    coverageRatio: 1,
    total: { chars: 1000, pages: 10, chunks: 5 },
    processed: { chars: 1000, pages: 10, chunks: 5 },
    ...overrides,
  };
}

describe('AI 文档覆盖判定', () => {
  it('区分完整、部分、未知与失败，显式失败状态优先于旧元数据缺失', () => {
    expect(resolveAiCoverageState(coverage())).toBe('complete');
    expect(
      resolveAiCoverageState(
        coverage({
          complete: false,
          truncated: true,
          coverageRatio: 0.6,
          processed: { chars: 600, pages: 6, chunks: 3 },
        }),
      ),
    ).toBe('partial');
    expect(resolveAiCoverageState(coverage({ metadataAvailable: false, coverageRatio: null }))).toBe('unknown');
    expect(resolveAiCoverageState(coverage({ metadataAvailable: false, coverageRatio: null }), 'failed')).toBe(
      'failed',
    );
    expect(
      resolveAiCoverageState(
        coverage({
          complete: false,
          coverageRatio: 0,
          processed: { chars: 0, pages: 0, chunks: 0 },
          reasons: [{ code: 'PARSE_FAILED', message: '解析失败' }],
        }),
      ),
    ).toBe('failed');
  });

  it('约束异常覆盖率并格式化新旧失败范围', () => {
    expect(getAiCoverageRatio(coverage({ coverageRatio: 1.4 }))).toBe(1);
    expect(getAiCoverageRatio(coverage({ coverageRatio: -0.2 }))).toBe(0);
    expect(
      formatAiCoverageRange({ unit: 'characters', start: 0, end: 400, code: 'CHAR_LIMIT' }, zhCoverageRangeLabels),
    ).toBe('字符 0–400 (CHAR_LIMIT)');
    expect(formatAiCoverageRange({ type: 'page', value: '7-10', reason: 'OCR 失败' }, zhCoverageRangeLabels)).toBe(
      '页 7-10',
    );
    expect(
      formatAiCoverageRange(
        { unit: 'characters', start: 0, end: 400, code: 'CHAR_LIMIT' },
        { range: 'Range', units: { char: 'Characters' } },
      ),
    ).toBe('Characters 0–400 (CHAR_LIMIT)');
  });
});

describe('AI 证据账本归组', () => {
  const sources: AiSource[] = [
    {
      type: 'note',
      id: 'note-1',
      sourceId: 'source-note',
      resourceId: 'note-1',
      title: '研究笔记',
      excerpt: '来源摘录',
      citationKey: '10',
      evidenceRef: 'ev-direct',
      locator: { type: 'section', value: '结论' },
    },
    {
      type: 'todo',
      id: 'todo-1',
      sourceId: 'source-todo',
      resourceId: 'todo-1',
      title: '待办证据',
      evidence: [
        {
          citationKey: '3',
          evidenceRef: 'ev-todo',
          excerpt: '需要跟进',
          locator: { type: 'status', value: '未完成' },
        },
      ],
    },
  ];

  it('按 citationKey 数字顺序归组，并可通过 sourceId 或 resourceId 解析实际来源', () => {
    const groups = groupAiEvidence(sources, [
      {
        citationKey: '2',
        evidenceRef: 'ev-resource',
        resourceId: 'todo-1',
        excerpt: '来自统一检索的待办',
        locator: { page: 3 },
      },
      {
        citationKey: '11',
        evidenceRef: 'ev-source',
        sourceId: 'source-note',
        locator: { type: 'paragraph', value: '12' },
      },
      {
        citationKey: '11',
        evidenceRef: 'ev-source',
        sourceId: 'source-note',
      },
    ]);

    expect(groups.map((group) => group.citationKey)).toEqual(['2', '3', '10', '11']);
    expect(groups[0].items[0].source?.type).toBe('todo');
    expect(groups[1].items[0]).toEqual(expect.objectContaining({ sourceTitle: '待办证据', source: sources[1] }));
    expect(groups[3].items).toHaveLength(1);
    expect(groups[3].items[0]).toEqual(expect.objectContaining({ source: sources[0], sourceTitle: '研究笔记' }));
  });

  it('格式化多种结构化定位信息', () => {
    expect(formatAiEvidenceLocator({ type: 'page', page: 8 }, zhEvidenceLocatorLabels)).toBe('第 8 页');
    expect(formatAiEvidenceLocator({ section: '风险', start: 12, end: 20 }, zhEvidenceLocatorLabels)).toBe(
      '章节 风险 · 12–20',
    );
    expect(
      formatAiEvidenceLocator(
        { section: 'Risk', start: 12, end: 20 },
        {
          types: { section: 'Section' },
          sectionValue: (value) => `Section ${value}`,
        },
      ),
    ).toBe('Section Risk · 12–20');
    expect(formatAiEvidenceLocator(null)).toBe('');
  });

  it('不同资源类型的 resourceId 重号时保持静态，避免打开错误来源', () => {
    const groups = groupAiEvidence(
      [
        ...sources,
        {
          type: 'bookmark',
          id: 'todo-1',
          sourceId: 'source-bookmark',
          resourceId: 'todo-1',
          title: '同号书签',
          target: 'bookmark-edit',
        },
      ],
      [{ citationKey: '1', evidenceRef: 'ambiguous', resourceId: 'todo-1', excerpt: '无法安全判定类型' }],
    );

    expect(groups[0].items[0].source).toBeUndefined();
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
