import { afterEach, describe, expect, it } from 'vitest';
import { createApp, h } from 'vue';
import { createI18n } from 'vue-i18n';
import enUS from '@/i18n/locales/en-US';
import zhCN from '@/i18n/locales/zh-CN';
import AiCoverageDisclosure from './AiCoverageDisclosure.vue';
import type { AiCoverageReport, AiSourceCoverage } from './aiSourceNavigation';

let cleanup: (() => void) | undefined;

afterEach(() => {
  cleanup?.();
  cleanup = undefined;
});

function parseCoverage(overrides: Partial<AiSourceCoverage> = {}): AiSourceCoverage {
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

function mountCoverage(coverage: AiCoverageReport, locale: 'zh-CN' | 'en-US' = 'zh-CN') {
  const host = document.createElement('div');
  document.body.append(host);
  const app = createApp({
    setup() {
      return () => h(AiCoverageDisclosure, { coverage });
    },
  });
  app.use(
    createI18n({
      legacy: false,
      locale,
      fallbackLocale: 'zh-CN',
      messages: { 'zh-CN': zhCN, 'en-US': enUS },
    }),
  );
  app.component('OriginalIcon', { render: () => h('span', { 'data-test-icon': '' }) });
  app.mount(host);
  cleanup = () => {
    app.unmount();
    host.remove();
  };
  return host;
}

describe('AiCoverageDisclosure', () => {
  it('同时披露整体与逐文件覆盖、分析扫描、上下文压缩和失败范围', () => {
    const coverage: AiCoverageReport = {
      documents: [
        {
          sourceId: 'doc-complete',
          fileName: '完整报告.pdf',
          status: 'ready',
          parse: parseCoverage(),
          selection: { mode: 'hierarchical-summary', scanRatio: 1, contextRatio: 0.25 },
          fullDocumentClaimAllowed: true,
        },
        {
          sourceId: 'doc-partial',
          fileName: '部分报告.docx',
          status: 'ready',
          parse: parseCoverage({
            complete: false,
            truncated: true,
            coverageRatio: 0.4,
            processed: { chars: 400, pages: 4, chunks: 2 },
            failedRanges: [{ unit: 'characters', start: 401, end: 1000, code: 'CHAR_LIMIT', reason: '超过解析上限' }],
          }),
          selection: { mode: 'relevance-retrieval', scanRatio: 1, contextRatio: 0.1 },
          fullDocumentClaimAllowed: false,
        },
      ],
      overall: {
        ...parseCoverage({
          complete: false,
          truncated: true,
          coverageRatio: 0.4,
          total: { chars: 2000, pages: 20, chunks: 10 },
          processed: { chars: 1400, pages: 14, chunks: 7 },
        }),
        documentCount: 2,
        fullDocumentClaimAllowed: false,
        failedRangeCount: 1,
        limitations: [
          { sourceId: 'doc-partial', fileName: '部分报告.docx', code: 'CHAR_LIMIT', message: '仅覆盖前段' },
        ],
        selection: { scanRatio: 1, contextRatio: 0.175 },
      },
    };
    const host = mountCoverage(coverage);

    expect(host.textContent).toContain('文档覆盖');
    expect(host.textContent).toContain('2 份文件 · 解析覆盖 40% · 分析扫描 100% · 1 个未覆盖或失败范围');
    expect(host.textContent).toContain('完整报告.pdf');
    expect(host.textContent).toContain('完整 · 100%');
    expect(host.textContent).toContain('部分报告.docx');
    expect(host.textContent).toContain('部分 · 40%');
    expect(host.textContent).toContain('全文分层摘要 · 分析扫描 100% · 回答上下文 25%');
    expect(host.textContent).toContain('相关片段检索 · 分析扫描 100% · 回答上下文 10%');
    expect(host.textContent).toContain('字符 401–1000 (CHAR_LIMIT)');
    expect(host.textContent).toContain('超过解析上限');
    expect(host.textContent).toContain('CHAR_LIMIT：仅覆盖前段');
    expect(
      [...host.querySelectorAll('[role="progressbar"]')].map((item) => item.getAttribute('aria-valuenow')),
    ).toEqual(['100', '40']);
  });

  it('不会把元数据缺失冒充完整，并明确区分未知与解析失败', () => {
    const unknown = parseCoverage({ metadataAvailable: false, complete: false, coverageRatio: null });
    const host = mountCoverage({
      documents: [
        { sourceId: 'unknown', fileName: '旧文档.pdf', status: 'ready', parse: unknown },
        {
          sourceId: 'failed',
          fileName: '损坏文档.pdf',
          status: 'failed',
          parse: unknown,
          selection: { mode: 'unavailable', scanRatio: 1, contextRatio: 1 },
        },
      ],
      overall: null,
    });

    expect(host.textContent).toContain('旧文档.pdf');
    expect(host.textContent).toContain('未知');
    expect(host.textContent).toContain('损坏文档.pdf');
    expect(host.textContent).toContain('失败');
    expect(host.textContent).toContain('未形成可用分析上下文');
    expect(host.querySelector('[aria-label="旧文档.pdf 解析覆盖"]')).toBeNull();
  });

  it('英文模式下覆盖状态、计数和范围均使用英文', () => {
    const host = mountCoverage(
      {
        documents: [
          {
            sourceId: 'partial',
            fileName: 'report.pdf',
            parse: parseCoverage({
              complete: false,
              truncated: true,
              coverageRatio: 0.4,
              processed: { chars: 400, pages: 4, chunks: 2 },
              failedRanges: [{ unit: 'characters', start: 401, end: 1000, code: 'CHAR_LIMIT' }],
            }),
          },
        ],
        overall: null,
      },
      'en-US',
    );

    expect(host.textContent).toContain('Document coverage');
    expect(host.textContent).toContain('Files: 1 · Parse coverage 40%');
    expect(host.textContent).toContain('Partial · 40%');
    expect(host.textContent).toContain('Characters 401–1000 (CHAR_LIMIT)');
    expect(host.textContent).not.toContain('文档覆盖');
  });
});
