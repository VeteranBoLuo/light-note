import { describe, expect, it } from 'vitest';
import {
  buildPublicToolQueryScopes,
  buildQueryResultMetadata,
  finalizeToolResultMetadata,
  formatToolResultMetadataDisclosure,
} from './toolResultMetadata.js';
import { bindAgentTemporalRanges } from './timeRange.js';

describe('Agent 工具结果元数据', () => {
  it('区分 total、returned 与 limit 截断，禁止把部分结果冒充完整结果', () => {
    expect(buildQueryResultMetadata({ total: 12, returned: 5 })).toMatchObject({
      total: 12,
      returned: 5,
      totalExact: true,
      completeness: 'partial',
      truncated: true,
      truncationReason: 'limit',
    });
    expect(buildQueryResultMetadata({ total: 0, returned: 0 })).toMatchObject({
      completeness: 'complete',
      truncated: false,
    });
  });

  it('用统一受控 facet 协议携带精确分类分布，并过滤无效维度和值', () => {
    const metadata = buildQueryResultMetadata({
      total: 85,
      returned: 10,
      facets: {
        noteType: {
          exact: true,
          values: { html: 67, markdown: 2, drawing: 16, 'bad value!': 99 },
        },
        'bad-dimension': { exact: true, values: { leaked: 1 } },
      },
    });

    expect(metadata.facets).toEqual({
      noteType: {
        exact: true,
        values: { html: 67, markdown: 2, drawing: 16 },
      },
    });
    expect(formatToolResultMetadataDisclosure(metadata, 'zh-CN')).toContain(
      'noteType: html=67, markdown=2, drawing=16',
    );
    expect(
      buildPublicToolQueryScopes([{ name: 'query_notes', status: 'success', resultMetadata: metadata }])[0],
    ).toMatchObject({
      facets: {
        noteType: {
          exact: true,
          values: { html: 67, markdown: 2, drawing: 16 },
        },
      },
    });
  });

  it('最终投影携带已绑定时间口径、稳定 ID 覆盖和文本预算截断', () => {
    const args = { timeRange: '今天' };
    bindAgentTemporalRanges({
      tool: { temporalSlots: [{ name: 'timeRange', label: '创建时间' }] },
      args,
      context: {
        temporalContext: {
          currentInstant: '2026-08-21T04:00:00Z',
          timeZone: 'Asia/Shanghai',
          storageTimeZone: 'Asia/Shanghai',
        },
      },
    });

    expect(
      finalizeToolResultMetadata({
        raw: {
          total: 2,
          items: [{ id: 'n1' }, { id: 'n2' }],
          resultMetadata: buildQueryResultMetadata({ totalCount: 2, returned: 2 }),
        },
        args,
        dependencyRefs: [
          { type: 'note', id: 'n1' },
          { type: 'note', id: 'n2' },
        ],
        summaryOriginalLength: 100,
        summaryReturnedLength: 60,
      }),
    ).toMatchObject({
      total: 2,
      returned: 2,
      completeness: 'complete',
      stableReferenceCount: 2,
      stableIdCoverage: 'complete',
      resolvedRanges: {
        timeRange: {
          expression: '今天',
          range: { timeZone: 'Asia/Shanghai' },
        },
      },
      summary: { originalLength: 100, returnedLength: 60, truncated: true },
    });
  });

  it('用统一格式披露权威时间口径和部分结果，不依赖具体工具', () => {
    const metadata = buildQueryResultMetadata({
      total: 12,
      returned: 5,
      resolvedRanges: {
        timeRange: {
          expression: '今天',
          range: {
            localStart: '2026-08-21 00:00:00',
            localEnd: '2026-08-21 12:00:00',
            timeZone: 'Asia/Shanghai',
          },
        },
      },
    });

    expect(formatToolResultMetadataDisclosure(metadata, 'zh-CN')).toBe(
      '【已核验查询口径】时间范围: 今天（2026-08-21，截至 12:00 · Asia/Shanghai）；已返回 5/12 条；查询集合为部分结果 (受返回条数上限限制)',
    );
  });

  it('查询集合完整但回答材料被文本预算截断时分别披露两层完整性', () => {
    const metadata = finalizeToolResultMetadata({
      raw: {
        total: 1,
        items: [{ id: 'bookmark-1' }],
        resultMetadata: buildQueryResultMetadata({ totalCount: 1, returned: 1 }),
      },
      dependencyRefs: [{ type: 'bookmark', id: 'bookmark-1' }],
      summaryOriginalLength: 7000,
      summaryReturnedLength: 6000,
    });

    expect(formatToolResultMetadataDisclosure(metadata, 'zh-CN')).toBe(
      '【已核验查询口径】已返回 1/1 条；查询集合完整；回答材料为部分结果 (受结果文本预算限制)',
    );
  });

  it('执行器不再把工具自报的数字 total 自动当成精确总量', () => {
    const metadata = finalizeToolResultMetadata({
      raw: { total: 60, items: [{ id: 'todo-1' }] },
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });

    expect(metadata).toMatchObject({
      totalCount: 60,
      returned: 1,
      totalExact: false,
      completeness: 'partial',
      truncationReason: 'unverified_total',
    });
    expect(formatToolResultMetadataDisclosure(metadata, 'zh-CN')).toContain('总量未精确计算');
    expect(formatToolResultMetadataDisclosure(metadata, 'zh-CN')).not.toContain('1/60');
  });

  it('nextCursor 是分页不完整的权威信号，并进入公开查询口径', () => {
    const metadata = finalizeToolResultMetadata({
      raw: {
        total: 5,
        items: [{ id: 'todo-1' }],
        nextCursor: 'next-page-token',
        resultMetadata: buildQueryResultMetadata({
          totalCount: 5,
          returned: 1,
          nextCursor: 'next-page-token',
        }),
      },
      dependencyRefs: [{ type: 'todo', id: 'todo-1' }],
    });
    expect(metadata).toMatchObject({
      totalCount: 5,
      complete: false,
      truncated: true,
      truncationReason: 'cursor',
      nextCursor: 'next-page-token',
    });
    expect(
      buildPublicToolQueryScopes([{ name: 'query_todos', status: 'success', resultMetadata: metadata }])[0],
    ).toMatchObject({ nextCursor: 'next-page-token', completeness: 'partial' });
  });

  it('公开查询口径只投影安全计数、稳定引用覆盖和用户本地时间范围', () => {
    const metadata = finalizeToolResultMetadata({
      raw: {
        total: 2,
        items: [{ id: 'n1' }],
        resultMetadata: buildQueryResultMetadata({
          total: 2,
          returned: 1,
          resolvedRanges: {
            timeRange: {
              expression: '今天',
              range: {
                start: '2026-08-20 16:00:00',
                endExclusive: '2026-08-21 04:00:01',
                storageTimeZone: 'UTC',
                localStart: '2026-08-21 00:00:00',
                localEnd: '2026-08-21 12:00:00',
                localEndExclusive: '2026-08-21 12:00:01',
                timeZone: 'Asia/Shanghai',
              },
            },
          },
        }),
      },
      dependencyRefs: [{ type: 'note', id: 'n1' }],
      summaryOriginalLength: 20,
      summaryReturnedLength: 20,
    });

    expect(buildPublicToolQueryScopes([{ name: 'query_notes', status: 'success', resultMetadata: metadata }])).toEqual([
      expect.objectContaining({
        schemaVersion: 1,
        tool: 'query_notes',
        total: 2,
        returned: 1,
        completeness: 'partial',
        projection: expect.objectContaining({ completeness: 'complete', truncated: false }),
        resolvedRanges: [
          expect.objectContaining({
            slot: 'timeRange',
            description: '今天（2026-08-21，截至 12:00 · Asia/Shanghai）',
            localStart: '2026-08-21 00:00:00',
            localEndExclusive: '2026-08-21 12:00:01',
            timeZone: 'Asia/Shanghai',
          }),
        ],
      }),
    ]);
    expect(
      JSON.stringify(
        buildPublicToolQueryScopes([{ name: 'query_notes', status: 'success', resultMetadata: metadata }]),
      ),
    ).not.toContain('storageTimeZone');
  });

  it('普通写操作没有查询口径时不生成多余披露', () => {
    expect(
      formatToolResultMetadataDisclosure(
        buildQueryResultMetadata({ total: null, returned: 0, exactTotal: false, coverage: 'complete' }),
      ),
    ).toBe('');
  });

  it('公开时间口径缺少本地边界时不会回退泄露存储时区边界', () => {
    const metadata = finalizeToolResultMetadata({
      raw: {
        total: 1,
        items: [{ id: 'n1' }],
        resultMetadata: buildQueryResultMetadata({
          total: 1,
          returned: 1,
          resolvedRanges: {
            timeRange: {
              expression: '今天',
              range: {
                start: '2026-08-20 16:00:00',
                endExclusive: '2026-08-21 16:00:00',
                timeZone: 'Asia/Shanghai',
              },
            },
          },
        }),
      },
      dependencyRefs: [{ type: 'note', id: 'n1' }],
    });

    const [scope] = buildPublicToolQueryScopes([{ name: 'query_notes', status: 'success', resultMetadata: metadata }]);
    expect(scope.resolvedRanges).toEqual([]);
    expect(JSON.stringify(scope)).not.toContain('2026-08-20 16:00:00');
  });
});
